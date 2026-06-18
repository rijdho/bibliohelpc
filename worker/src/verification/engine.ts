import type { ParsedReference, VerificationResult, VerificationMatch } from '@bibliohelp/shared';
import { normalizeText } from '@bibliohelp/shared';
import type { Env } from '../bindings.js';
import { lookupDoi, searchCrossRef } from '../sources/crossref.js';
import { searchOpenAlex } from '../sources/openalex.js';
import { lookupIsbn, lookupIsbnDirect, searchOpenLibrary } from '../sources/openLibrary.js';
import { searchOpenAIRE, searchOpenAIREDatasets } from '../sources/openaire.js';
import { searchInternetArchive, lookupIsbnIA } from '../sources/internetArchive.js';
import { lookupIsbnDb, searchIsbnDb } from '../sources/isbndb.js';
import { searchCache, indexReference } from '../cache/repository.js';
import { scoreMatches } from './scoring.js';

/**
 * Verify a single parsed reference against all sources.
 */
export async function verifyReference(ref: ParsedReference, env: Env): Promise<VerificationResult> {
  const matches: VerificationMatch[] = [];
  const appName = env.APP_NAME || 'BiblioHelp';
  const mailto = env.API_MAILTO || 'bibliohelp@example.com';
  const isbndbKey = env.ISBNDB_API_KEY;

  // 1. Check D1+Vectorize cache first
  try {
    const cached = await searchCache(env, ref.title, ref.authors[0]);
    const goodCache = cached.filter(m => m.similarity >= 0.90);
    if (goodCache.length > 0) {
      const result = scoreMatches(goodCache, null, !!ref.doi || !!ref.isbn);
      return { reference: ref, matches: goodCache, suggestions: [], ...result };
    }
  } catch {
    // Cache not available, continue without
  }

  // 2. DOI direct lookup
  if (ref.doi) {
    const doiMatch = await lookupDoi(ref.doi, appName, mailto);
    if (doiMatch) {
      matches.push(doiMatch);
      // Cache result
      try { await indexReference(env, doiMatch, ref.raw); } catch {}
      const result = scoreMatches(matches, 'doi', true);
      return { reference: ref, matches, suggestions: [], ...result };
    }
  }

  // 3. ISBN lookup (Open Library + Internet Archive + ISBNdb in parallel)
  if (ref.isbn) {
    const [olMatch, olDirect, iaMatch, isbndbMatch] = await Promise.all([
      lookupIsbn(ref.isbn),
      lookupIsbnDirect(ref.isbn),
      lookupIsbnIA(ref.isbn),
      lookupIsbnDb(ref.isbn, isbndbKey),
    ]);
    if (olMatch) matches.push(olMatch);
    if (olDirect && !olMatch) matches.push(olDirect);
    if (iaMatch) matches.push(iaMatch);
    if (isbndbMatch) matches.push(isbndbMatch);

    if (matches.length > 0) {
      try { await indexReference(env, matches[0], ref.raw); } catch {}
      const result = scoreMatches(matches, 'isbn', true);
      return { reference: ref, matches, suggestions: [], ...result };
    }
  }

  // 4. Title + Author fuzzy search — primary sources in parallel
  const firstAuthor = ref.authors[0] || undefined;
  const [oaireMatches, oaireDsMatches, iaMatches, crMatches, olMatches, isbndbMatches] = await Promise.all([
    searchOpenAIRE(ref.title, firstAuthor),
    searchOpenAIREDatasets(ref.title, firstAuthor),
    searchInternetArchive(ref.title, firstAuthor),
    searchCrossRef(ref.title, firstAuthor, appName, mailto),
    searchOpenLibrary(ref.title, firstAuthor),
    searchIsbnDb(ref.title, firstAuthor, isbndbKey),
  ]);

  matches.push(...oaireMatches, ...oaireDsMatches, ...iaMatches, ...crMatches, ...olMatches, ...isbndbMatches);

  // 5. If no good match yet, try OpenAlex as fallback
  const bestSoFar = matches.length > 0
    ? matches.reduce((a, b) => a.similarity > b.similarity ? a : b).similarity
    : 0;
  if (bestSoFar < 0.75) {
    const oaMatches = await searchOpenAlex(ref.title, firstAuthor, appName, mailto);
    matches.push(...oaMatches);
  }

  // Boost similarity when author surname matches (handles translated titles)
  // Only boost if title similarity is already decent (>= 0.60) to avoid false positives
  if (ref.authors.length > 0) {
    // Extract surname: longest word in author name (handles "Budnick F." and "Smith, J.")
    const authorWords = normalizeText(ref.authors[0]).split(/\s+/).filter(w => w.length > 1);
    const refSurname = authorWords.reduce((a, b) => a.length >= b.length ? a : b, '');
    if (refSurname.length >= 3) {
      for (const m of matches) {
        if (m.similarity < 0.60 || m.similarity >= 0.90) continue;
        const surnameMatch = m.authors.some(a => {
          const parts = normalizeText(a).split(/\s+/);
          return parts.some(p => p === refSurname);
        });
        if (surnameMatch) {
          // Cap just below the 0.90 verified threshold (see scoring.ts): an
          // author-surname coincidence must never alone promote a title-only
          // near-miss into the "verified" tier.
          m.similarity = Math.min(0.89, m.similarity + 0.15);
        }
      }
    }
  }

  // Deduplicate by title similarity
  const deduped = deduplicateMatches(matches);

  // Cache best match
  if (deduped.length > 0) {
    const best = deduped.reduce((a, b) => a.similarity > b.similarity ? a : b);
    if (best.similarity >= 0.75) {
      try { await indexReference(env, best, ref.raw); } catch {}
    }
  }

  const result = scoreMatches(deduped, null, !!ref.doi || !!ref.isbn);
  return { reference: ref, matches: deduped.slice(0, 5), suggestions: [], ...result };
}

/**
 * Verify multiple references (with concurrency limit).
 */
export async function verifyAll(refs: ParsedReference[], env: Env): Promise<VerificationResult[]> {
  const CONCURRENCY = 3;
  const results: VerificationResult[] = [];

  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    const batch = refs.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(r => verifyReference(r, env)));
    results.push(...batchResults);
  }

  return results;
}

function deduplicateMatches(matches: VerificationMatch[]): VerificationMatch[] {
  const seen = new Map<string, VerificationMatch>();
  for (const m of matches) {
    const key = m.title.toLowerCase().slice(0, 50);
    const existing = seen.get(key);
    if (!existing || m.similarity > existing.similarity) {
      seen.set(key, m);
    }
  }
  return [...seen.values()].sort((a, b) => b.similarity - a.similarity);
}
