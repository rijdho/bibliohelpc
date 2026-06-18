interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = { ...DEFAULTS, ...options };
  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw lastError;
      }
      if (attempt === maxRetries) break;
      const waitTime = Math.min(delay, maxDelay);
      console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitTime}ms...`, lastError.message);
      await sleep(waitTime);
      delay *= backoffMultiplier;
    }
  }
  throw new Error(`Failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

const MAX_QUEUE_SIZE = 50;

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

class RateLimiter {
  private queue: QueueItem<unknown>[] = [];
  private processing = false;

  constructor(private requestsPerSecond: number) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error('Rate limiter queue full — too many concurrent requests.');
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const delay = 1000 / this.requestsPerSecond;
    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift()!;
      try { resolve(await fn()); } catch (error) { reject(error); }
      if (this.queue.length > 0) await sleep(delay);
    }
    this.processing = false;
  }
}

const limiters = new Map<string, RateLimiter>();

export function getRateLimiter(api: string, requestsPerSecond: number): RateLimiter {
  if (!limiters.has(api)) {
    limiters.set(api, new RateLimiter(requestsPerSecond));
  }
  return limiters.get(api)!;
}
