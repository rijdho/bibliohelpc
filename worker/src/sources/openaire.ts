import type { VerificationMatch } from '@bibliohelp/shared';
import { similarity } from '@bibliohelp/shared';
import { fetchJson, stripAccents } from '../utils/apiUtils.js';
import { retry, getRateLimiter } from '../utils/retry.js';

const limiter = getRateLimiter('openaire', 5);
const BASE = 'https://api.openaire.eu/search';

interface OAHeader {
  total: { $: string };
}

interface OATitle {
  $: string;
}

interface OACreator {
  $: string;
}

interface OAPid {
  $: string;
  '@classid'?: string;
}

interface OAResult {
  metadata: {
    'oaf:entity': {
      'oaf:result': {
        title?: OATitle | OATitle[];
        creator?: OACreator | OACreator[];
        dateofacceptance?: { $: string };
        pid?: OAPid | OAPid[];
      };
    };
  };
}

interface OAResponse {
  response: {
    header: OAHeader;
    results: { result: OAResult | OAResult[] } | null;
  };
}

/**
 * Search OpenAIRE for publications by title and author.
 */
export async function searchOpenAIRE(title: string, author?: string): Promise<VerificationMatch[]> {
  const params = new URLSearchParams({
    title: stripAccents(title),
    format: 'json',
    size: '5',
  });
  if (author) params.set('author', stripAccents(author));

  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<OAResponse>(`${BASE}/publications?${params}`))
    );

    if (!data.response.results) return [];

    let items = data.response.results.result;
    if (!Array.isArray(items)) items = [items];

    return items
      .map(r => mapResult(r, title))
      .filter((m): m is VerificationMatch => m !== null);
  } catch {
    return [];
  }
}

/**
 * Search OpenAIRE for datasets by title.
 */
export async function searchOpenAIREDatasets(title: string, author?: string): Promise<VerificationMatch[]> {
  const params = new URLSearchParams({
    title: stripAccents(title),
    format: 'json',
    size: '3',
  });
  if (author) params.set('author', stripAccents(author));

  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<OAResponse>(`${BASE}/datasets?${params}`))
    );

    if (!data.response.results) return [];

    let items = data.response.results.result;
    if (!Array.isArray(items)) items = [items];

    return items
      .map(r => mapResult(r, title))
      .filter((m): m is VerificationMatch => m !== null);
  } catch {
    return [];
  }
}

function mapResult(result: OAResult, queryTitle: string): VerificationMatch | null {
  const meta = result.metadata['oaf:entity']['oaf:result'];

  // Extract title
  let titleRaw = meta.title;
  if (Array.isArray(titleRaw)) titleRaw = titleRaw[0];
  const matchTitle = titleRaw?.$;
  if (!matchTitle) return null;

  // Extract authors
  let creators = meta.creator || [];
  if (!Array.isArray(creators)) creators = [creators];
  const authors = creators.map(c => c.$).filter(Boolean);

  // Extract year
  const dateStr = meta.dateofacceptance?.$;
  const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) || null : null;

  // Extract DOI from pid
  let doi: string | null = null;
  let pids = meta.pid || [];
  if (!Array.isArray(pids)) pids = [pids];
  const doiPid = pids.find(p => p['@classid'] === 'doi');
  if (doiPid) doi = doiPid.$;

  return {
    title: matchTitle,
    authors,
    year,
    doi,
    isbn: null,
    journal: null,
    publisher: null,
    source: 'openaire' as VerificationMatch['source'],
    similarity: similarity(queryTitle, matchTitle),
    url: doi ? `https://doi.org/${doi}` : null,
  };
}
