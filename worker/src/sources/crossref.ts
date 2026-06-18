import type { VerificationMatch } from '@bibliohelp/shared';
import { similarity } from '@bibliohelp/shared';
import { fetchJson, getHeaders, buildQuery, stripAccents } from '../utils/apiUtils.js';
import { retry, getRateLimiter } from '../utils/retry.js';

const limiter = getRateLimiter('crossref', 5);
const BASE = 'https://api.crossref.org';

interface CrossRefWork {
  DOI: string;
  title: string[];
  author?: { given?: string; family?: string }[];
  published?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
}

interface CrossRefResponse {
  message: { items: CrossRefWork[] };
}

interface CrossRefSingleResponse {
  message: CrossRefWork;
}

/**
 * Look up a DOI directly on CrossRef.
 */
export async function lookupDoi(doi: string, appName: string, mailto: string): Promise<VerificationMatch | null> {
  const headers = getHeaders(appName, mailto);
  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<CrossRefSingleResponse>(`${BASE}/works/${encodeURIComponent(doi)}`, headers))
    );
    const work = data.message;
    return mapWork(work);
  } catch {
    return null;
  }
}

/**
 * Search CrossRef by title and author.
 */
export async function searchCrossRef(title: string, author: string | undefined, appName: string, mailto: string): Promise<VerificationMatch[]> {
  const headers = getHeaders(appName, mailto);
  const params: Record<string, unknown> = {
    'query.bibliographic': stripAccents(title),
    rows: 5,
    select: 'DOI,title,author,published,container-title',
  };
  if (author) params['query.author'] = stripAccents(author);

  const qs = buildQuery(params);
  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<CrossRefResponse>(`${BASE}/works?${qs}`, headers))
    );
    return data.message.items
      .map(w => mapWork(w, title))
      .filter((m): m is VerificationMatch => m !== null);
  } catch {
    return [];
  }
}

function mapWork(work: CrossRefWork, queryTitle?: string): VerificationMatch | null {
  const title = work.title?.[0];
  if (!title) return null;

  const authors = (work.author || []).map(a =>
    [a.given, a.family].filter(Boolean).join(' ')
  );
  const year = work.published?.['date-parts']?.[0]?.[0] ?? null;

  return {
    title,
    authors,
    year,
    doi: work.DOI,
    isbn: null,
    journal: work['container-title']?.[0] ?? null,
    publisher: null,
    source: 'crossref',
    similarity: queryTitle ? similarity(queryTitle, title) : 1,
    url: `https://doi.org/${work.DOI}`,
  };
}
