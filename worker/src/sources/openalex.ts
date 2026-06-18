import type { VerificationMatch } from '@bibliohelp/shared';
import { similarity } from '@bibliohelp/shared';
import { fetchJson, getHeaders, buildQuery, stripAccents } from '../utils/apiUtils.js';
import { retry, getRateLimiter } from '../utils/retry.js';

const limiter = getRateLimiter('openalex', 10);
const BASE = 'https://api.openalex.org';

interface OpenAlexWork {
  id: string;
  doi?: string;
  title?: string;
  authorships?: { author: { display_name: string } }[];
  publication_year?: number;
  primary_location?: { source?: { display_name?: string } };
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
}

/**
 * Search OpenAlex by title (and optionally author).
 */
export async function searchOpenAlex(title: string, author: string | undefined, appName: string, mailto: string): Promise<VerificationMatch[]> {
  const headers = getHeaders(appName, mailto);
  let search = stripAccents(title);
  if (author) search = `${search} ${stripAccents(author)}`;

  const params: Record<string, unknown> = {
    search,
    per_page: 5,
    mailto,
  };

  const qs = buildQuery(params);
  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<OpenAlexResponse>(`${BASE}/works?${qs}`, headers))
    );
    return data.results
      .map(w => mapWork(w, title))
      .filter((m): m is VerificationMatch => m !== null);
  } catch {
    return [];
  }
}

function mapWork(work: OpenAlexWork, queryTitle: string): VerificationMatch | null {
  if (!work.title) return null;

  const authors = (work.authorships || []).map(a => a.author.display_name);
  const doi = work.doi?.replace('https://doi.org/', '') ?? null;

  return {
    title: work.title,
    authors,
    year: work.publication_year ?? null,
    doi,
    isbn: null,
    journal: work.primary_location?.source?.display_name ?? null,
    publisher: null,
    source: 'openalex',
    similarity: similarity(queryTitle, work.title),
    url: work.doi ?? (work.id?.startsWith('http') ? work.id : null),
  };
}
