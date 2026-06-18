import { APP_VERSION } from '@bibliohelp/shared';

export function getHeaders(appName: string, mailto: string, extra: Record<string, string> = {}): Record<string, string> {
  const ua = `${appName}/${APP_VERSION} (mailto:${mailto})`;
  return {
    'Accept': 'application/json',
    'User-Agent': ua,
    ...extra,
  };
}

export function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') {
      q.append(k, String(v));
    }
  }
  return q.toString();
}

/**
 * Strip accents from text for API queries (APIs handle ASCII better).
 */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public source: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ApiError(`${res.status} ${res.statusText}`, res.status, url);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}
