import type { VerificationMatch } from '@bibliohelp/shared';
import { similarity } from '@bibliohelp/shared';
import { stripAccents } from '../utils/apiUtils.js';
import { retry, getRateLimiter } from '../utils/retry.js';

const limiter = getRateLimiter('isbndb', 1);
const BASE = 'https://api2.isbndb.com';

interface ISBNdbBook {
  title?: string;
  title_long?: string;
  isbn13?: string;
  isbn10?: string;
  authors?: string[];
  publisher?: string;
  date_published?: string;
  edition?: string;
  pages?: number;
  image?: string;
  synopsis?: string;
  subjects?: string[];
}

interface ISBNdbBookResponse {
  book: ISBNdbBook;
}

interface ISBNdbSearchResponse {
  total: number;
  books: ISBNdbBook[];
}

function getAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': apiKey,
    'Accept': 'application/json',
  };
}

const FETCH_TIMEOUT_MS = 15_000;

async function fetchIsbndb<T>(url: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: getAuthHeaders(apiKey),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`ISBNdb ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check if ISBNdb is configured (API key present).
 */
export function isIsbndbAvailable(apiKey?: string): boolean {
  return !!apiKey && apiKey.length > 0;
}

/**
 * Look up a book by ISBN on ISBNdb.
 */
export async function lookupIsbnDb(isbn: string, apiKey?: string): Promise<VerificationMatch | null> {
  if (!isIsbndbAvailable(apiKey)) return null;
  try {
    const data = await limiter.execute(() =>
      retry(() => fetchIsbndb<ISBNdbBookResponse>(`${BASE}/book/${isbn}`, apiKey!))
    );
    const book = data.book;
    if (!book?.title) return null;

    return {
      title: book.title,
      authors: book.authors ?? [],
      year: book.date_published ? parseYear(book.date_published) : null,
      doi: null,
      isbn: book.isbn13 ?? book.isbn10 ?? isbn,
      journal: null,
      publisher: book.publisher ?? null,
      source: 'isbndb',
      similarity: 1,
      url: null,
    };
  } catch {
    return null;
  }
}

/**
 * Search ISBNdb by title (and optionally filter by author).
 */
export async function searchIsbnDb(title: string, author?: string, apiKey?: string): Promise<VerificationMatch[]> {
  if (!isIsbndbAvailable(apiKey)) return [];

  const query = encodeURIComponent(stripAccents(title));
  const params = new URLSearchParams({ page_size: '5', column: 'title' });

  try {
    const data = await limiter.execute(() =>
      retry(() => fetchIsbndb<ISBNdbSearchResponse>(`${BASE}/books/${query}?${params}`, apiKey!))
    );

    if (!data.books || !Array.isArray(data.books)) return [];

    return data.books
      .map(book => mapBook(book, title))
      .filter((m): m is VerificationMatch => m !== null);
  } catch {
    return [];
  }
}

function mapBook(book: ISBNdbBook, queryTitle: string): VerificationMatch | null {
  if (!book.title) return null;
  return {
    title: book.title,
    authors: book.authors ?? [],
    year: book.date_published ? parseYear(book.date_published) : null,
    doi: null,
    isbn: book.isbn13 ?? book.isbn10 ?? null,
    journal: null,
    publisher: book.publisher ?? null,
    source: 'isbndb',
    similarity: similarity(queryTitle, book.title),
    url: null,
  };
}

function parseYear(dateStr: string): number | null {
  const m = dateStr.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}
