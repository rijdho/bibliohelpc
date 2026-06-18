import type { VerificationMatch } from '@bibliohelp/shared';
import { similarity } from '@bibliohelp/shared';
import { fetchJson, stripAccents } from '../utils/apiUtils.js';
import { retry, getRateLimiter } from '../utils/retry.js';

const limiter = getRateLimiter('internetarchive', 5);
const BASE = 'https://archive.org';

interface IADoc {
  title?: string;
  creator?: string | string[];
  date?: string;
  identifier?: string;
  isbn?: string[];
}

interface IAResponse {
  response: {
    numFound: number;
    docs: IADoc[];
  };
}

/**
 * Escape Lucene/Solr query-syntax special characters so user-supplied title and
 * author text can't break (or inject into) the IA query. Spaces are preserved as
 * term separators.
 */
function escapeLucene(s: string): string {
  return s.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&');
}

/**
 * Search Internet Archive for books by title and author.
 */
export async function searchInternetArchive(title: string, author?: string): Promise<VerificationMatch[]> {
  const normalizedTitle = stripAccents(title);
  // Use only 3 key words — IA Solr works better with fewer terms
  const keywords = normalizedTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ');
  const safeKeywords = escapeLucene(keywords);

  // First try: title keywords + author
  let q = `title:(${safeKeywords})`;
  if (author) q += ` AND creator:(${escapeLucene(stripAccents(author))})`;

  let results = await iaSearch(q, title);

  // Fallback: title keywords only (without author filter)
  if (results.length === 0 && author) {
    results = await iaSearch(`title:(${safeKeywords})`, title);
  }

  return results;
}

async function iaSearch(q: string, queryTitle: string): Promise<VerificationMatch[]> {
  const params = new URLSearchParams({
    q,
    output: 'json',
    rows: '5',
    'fl[]': 'title,creator,date,identifier,isbn',
  });

  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<IAResponse>(`${BASE}/advancedsearch.php?${params}`))
    );

    return data.response.docs
      .map(doc => mapDoc(doc, queryTitle))
      .filter((m): m is VerificationMatch => m !== null);
  } catch {
    return [];
  }
}

/**
 * Search Internet Archive by ISBN.
 */
export async function lookupIsbnIA(isbn: string): Promise<VerificationMatch | null> {
  const params = new URLSearchParams({
    q: `isbn:${escapeLucene(isbn)}`,
    output: 'json',
    rows: '1',
    'fl[]': 'title,creator,date,identifier,isbn',
  });

  try {
    const data = await limiter.execute(() =>
      retry(() => fetchJson<IAResponse>(`${BASE}/advancedsearch.php?${params}`))
    );

    if (data.response.docs.length === 0) return null;
    const doc = data.response.docs[0];
    const match = mapDoc(doc, '');
    if (match) match.similarity = 1;
    return match;
  } catch {
    return null;
  }
}

function mapDoc(doc: IADoc, queryTitle: string): VerificationMatch | null {
  if (!doc.title) return null;

  let docTitle = doc.title;
  let authors = Array.isArray(doc.creator)
    ? doc.creator
    : doc.creator ? [doc.creator] : [];

  // IA often embeds authors in title: "Author1 & Author2 - Actual Title"
  if (authors.length === 0) {
    const dashSplit = docTitle.match(/^(.+?)\s*[-–—]\s+([A-ZÁÉÍÓÚÑ].{10,})$/);
    if (dashSplit) {
      const possibleAuthors = dashSplit[1];
      const possibleTitle = dashSplit[2];
      // Only split if the part before dash looks like author names (short, with initials)
      if (possibleAuthors.length < 80 && /[A-Z]\.\s*[&,]/.test(possibleAuthors)) {
        authors = possibleAuthors.split(/\s*[&,]\s*/).map(a => a.trim()).filter(a => a.length > 1);
        docTitle = possibleTitle;
      }
    }
  }

  const year = doc.date ? parseInt(doc.date.slice(0, 4), 10) || null : null;
  const isbn = doc.isbn?.[0] ?? null;

  return {
    title: docTitle,
    authors,
    year,
    doi: null,
    isbn,
    journal: null,
    publisher: null,
    source: 'internetarchive' as VerificationMatch['source'],
    similarity: queryTitle ? similarity(queryTitle, docTitle) : 1,
    url: doc.identifier ? `${BASE}/details/${doc.identifier}` : null,
  };
}
