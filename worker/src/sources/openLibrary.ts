import type { VerificationMatch } from '@bibliohelp/shared';
import { similarity } from '@bibliohelp/shared';
import { fetchJson, stripAccents, escapeLucene, joinSameOrigin } from '../utils/apiUtils.js';
import { retry, getRateLimiter } from '../utils/retry.js';
const limiter = getRateLimiter('openlibrary', 5);
const BASE = 'https://openlibrary.org';

interface OLBookData {
  title?: string;
  authors?: { name: string }[];
  publish_date?: string;
  isbn_13?: string[];
  isbn_10?: string[];
}

interface OLSearchDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  key?: string;
  publisher?: string[];
}

interface OLSearchResponse {
  docs: OLSearchDoc[];
}

/**
 * Look up a book by ISBN on Open Library.
 */
export async function lookupIsbn(isbn: string): Promise<VerificationMatch | null> {
  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<Record<string, OLBookData>>(`${BASE}/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`))
    );
    const key = `ISBN:${isbn}`;
    const book = data[key];
    if (!book?.title) return null;

    return {
      title: book.title,
      authors: (book.authors || []).map(a => a.name),
      year: book.publish_date ? parseYear(book.publish_date) : null,
      doi: null,
      isbn,
      journal: null,
      publisher: null,
      source: 'openlibrary',
      similarity: 1,
      url: `${BASE}/isbn/${isbn}`,
    };
  } catch {
    return null;
  }
}

/**
 * Direct ISBN lookup via /isbn/{isbn}.json (more reliable than bibkeys API).
 */
export async function lookupIsbnDirect(isbn: string): Promise<VerificationMatch | null> {
  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<{ title?: string; authors?: { key: string }[]; publish_date?: string; isbn_13?: string[]; isbn_10?: string[] }>(
        `${BASE}/isbn/${encodeURIComponent(isbn)}.json`
      ))
    );
    if (!data?.title) return null;

    // Authors come as keys like "/authors/OL123A", need separate lookup — use names from search instead
    return {
      title: data.title,
      authors: [],
      year: data.publish_date ? parseYear(data.publish_date) : null,
      doi: null,
      isbn,
      journal: null,
      publisher: null,
      source: 'openlibrary',
      similarity: 1,
      url: `${BASE}/isbn/${isbn}`,
    };
  } catch {
    return null;
  }
}

/**
 * Search Open Library by title.
 * Uses both title-specific and general query for better coverage of translated titles.
 */
export async function searchOpenLibrary(title: string, author?: string): Promise<VerificationMatch[]> {
  const normalizedTitle = stripAccents(title);
  const normalizedAuthor = author ? stripAccents(author) : undefined;

  // search.json interprets these as Solr queries, so user text must be escaped
  // (mirrors internetArchive.ts) — otherwise ':', '(', '*', '~', '^', AND/OR/NOT
  // reach Solr as operators and let a caller author arbitrary queries.
  // Search 1: by title field
  const titleParams = new URLSearchParams({ title: escapeLucene(normalizedTitle), limit: '5' });
  if (normalizedAuthor) titleParams.set('author', escapeLucene(normalizedAuthor));

  // Search 2: general query with author surname + key title words (catches translations)
  const surname = normalizedAuthor?.split(/\s+/).pop() || '';
  const keywords = normalizedTitle.split(/\s+/).filter(w => w.length > 4).slice(0, 3).join(' ');
  const generalQuery = escapeLucene(`${surname} ${keywords}`.trim());
  const generalParams = new URLSearchParams({ q: generalQuery, limit: '5' });

  try {
    const [titleData, generalData] = await Promise.all([
      limiter.execute(() => retry(() => fetchJson<OLSearchResponse>(`${BASE}/search.json?${titleParams}`))),
      generalQuery.length > 5
        ? limiter.execute(() => retry(() => fetchJson<OLSearchResponse>(`${BASE}/search.json?${generalParams}`)))
        : Promise.resolve({ docs: [] } as OLSearchResponse),
    ]);

    const allDocs = [...titleData.docs, ...generalData.docs];
    // Deduplicate by title
    const seen = new Set<string>();
    const unique = allDocs.filter(doc => {
      const key = doc.title?.toLowerCase().slice(0, 50);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique
      .map(doc => mapDoc(doc, title))
      .filter((m): m is VerificationMatch => m !== null);
  } catch {
    return [];
  }
}

function mapDoc(doc: OLSearchDoc, queryTitle: string): VerificationMatch | null {
  if (!doc.title) return null;
  return {
    title: doc.title,
    authors: doc.author_name || [],
    year: doc.first_publish_year ?? null,
    doi: null,
    isbn: doc.isbn?.[0] ?? null,
    journal: null,
    publisher: doc.publisher?.[0] ?? null,
    source: 'openlibrary',
    similarity: similarity(queryTitle, doc.title),
    url: doc.key ? joinSameOrigin(BASE, doc.key) : null,
  };
}

function parseYear(dateStr: string): number | null {
  const m = dateStr.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}
