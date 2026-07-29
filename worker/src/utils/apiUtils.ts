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

/**
 * Escape Lucene/Solr query-syntax special characters so user-supplied text can't
 * inject operators (wildcards, fuzzy terms, field boosts, boolean keywords) into
 * a query sent to a Solr-backed API (Internet Archive, Open Library). Spaces are
 * preserved as term separators.
 */
export function escapeLucene(s: string): string {
  return s.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&');
}

/**
 * Join a base origin with a path/reference taken from a third-party API response,
 * returning the URL only if it stays on the base's origin. Guards against an
 * upstream value like "@evil.com/x" turning `${BASE}${ref}` into a cross-origin
 * link that a protocol-only check would wave through. Returns null off-origin.
 */
export function joinSameOrigin(base: string, ref: string): string | null {
  try {
    const url = new URL(ref, base);
    return url.origin === new URL(base).origin ? url.toString() : null;
  } catch {
    return null;
  }
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
