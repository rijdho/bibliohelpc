import type { ParsedReference, VerificationResult, VerificationMatch } from '@bibliohelp/shared';
import { normalizeText, similarity } from '@bibliohelp/shared';
import type { Env } from '../bindings.js';
import { lookupDoi, searchCrossRef } from '../sources/crossref.js';
import { searchOpenAlex } from '../sources/openalex.js';
import { lookupIsbn, lookupIsbnDirect, searchOpenLibrary } from '../sources/openLibrary.js';
import { searchOpenAIRE, searchOpenAIREDatasets } from '../sources/openaire.js';
import { searchInternetArchive, lookupIsbnIA } from '../sources/internetArchive.js';
import { lookupIsbnDb, searchIsbnDb } from '../sources/isbndb.js';
import { searchCache, indexReference } from '../cache/repository.js';
import { scoreMatches, scoreIdentifierMismatch, yearsCompatible } from './scoring.js';

// Below this title similarity, a DOI-resolved record is a candidate mismatch.
const IDENTIFIER_TITLE_MISMATCH = 0.5;
// ISBN uses a more lenient threshold — book titles carry more noise (subtitles,
// editions, translations) so only flag when almost nothing overlaps.
const ISBN_TITLE_MISMATCH = 0.3;

/**
 * True when at least one surname (word of length >= 3) is shared between the two
 * author lists. Used to distinguish a legitimately translated title (authors still
 * match) from a wrong/stolen identifier (neither title nor authors match).
 * Returns true when the reference has no usable surnames — we can't disprove a match.
 */
export function authorsOverlap(refAuthors: string[], matchAuthors: string[]): boolean {
  const refSurnames = new Set(
    refAuthors.flatMap(a => normalizeText(a).split(/\s+/).filter(w => w.length >= 3)),
  );
  if (refSurnames.size === 0) return true;
  return matchAuthors.some(a =>
    normalizeText(a).split(/\s+/).some(w => w.length >= 3 && refSurnames.has(w)),
  );
}

// When two matches have near-identical title similarity, the year decides.
const SIMILARITY_TIE = 0.05;

/**
 * Ranking comparator: higher similarity wins, but within SIMILARITY_TIE the
 * record whose year agrees with the reference wins. Prevents a re-registered
 * copy of a paper (same title, different year/DOI) from beating the original.
 */
function compareMatches(a: VerificationMatch, b: VerificationMatch, refYear: number | null): number {
  if (Math.abs(a.similarity - b.similarity) <= SIMILARITY_TIE) {
    const ya = yearsCompatible(refYear, a.year) ? 1 : 0;
    const yb = yearsCompatible(refYear, b.year) ? 1 : 0;
    if (ya !== yb) return yb - ya;
  }
  return b.similarity - a.similarity;
}

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
    // A cached record whose year contradicts the reference is not the same
    // work (or is a polluted entry) — skip it and re-verify against live sources.
    const goodCache = cached.filter(m => m.similarity >= 0.90 && yearsCompatible(ref.year, m.year));
    if (goodCache.length > 0) {
      // Preserve identifier provenance: if the reference's own DOI/ISBN matches the
      // cached record, it's a full identifier verification (100%), not merely a fuzzy
      // title hit (95%). Title already matched >= 0.90 to reach the cache, so there's
      // no mismatch risk here.
      const best = goodCache.reduce((a, b) => a.similarity > b.similarity ? a : b);
      const idMatched: 'doi' | 'isbn' | null =
        ref.doi && best.doi && best.doi.toLowerCase() === ref.doi.toLowerCase() ? 'doi'
        : ref.isbn && best.isbn && best.isbn === ref.isbn ? 'isbn'
        : null;
      const result = scoreMatches(goodCache, idMatched, !!ref.doi || !!ref.isbn, ref.year);
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
      // Guard against wrong/stolen DOIs: if the resolved record's title AND authors
      // both differ from the reference, the DOI points to a different work — don't
      // rubber-stamp it as verified. (A translated title alone still verifies, since
      // the authors would still match.)
      const titleSim = ref.title && doiMatch.title ? similarity(ref.title, doiMatch.title) : 1;
      if (ref.title && titleSim < IDENTIFIER_TITLE_MISMATCH && !authorsOverlap(ref.authors, doiMatch.authors)) {
        doiMatch.similarity = titleSim;
        const result = scoreIdentifierMismatch('doi', doiMatch.title);
        return { reference: ref, matches, suggestions: [], ...result };
      }
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
      // Guard against wrong/stolen ISBNs, like the DOI path but more leniently.
      // Compare against the best-titled record across sources; only flag when that
      // record has authors that also fail to overlap (avoids false positives when a
      // source returns no authors or a noisy title).
      if (ref.title) {
        const best = matches.reduce((a, b) => {
          const sa = a.title ? similarity(ref.title, a.title) : 0;
          const sb = b.title ? similarity(ref.title, b.title) : 0;
          return sb > sa ? b : a;
        });
        const bestSim = best.title ? similarity(ref.title, best.title) : 0;
        if (bestSim < ISBN_TITLE_MISMATCH && best.authors.length > 0 && !authorsOverlap(ref.authors, best.authors)) {
          best.similarity = bestSim;
          const result = scoreIdentifierMismatch('isbn', best.title);
          return { reference: ref, matches, suggestions: [], ...result };
        }
      }
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

  // 5. If no good match yet — or the best one contradicts the reference's year
  // (possible re-registered copy; the original may live in OpenAlex) — try OpenAlex
  const bestSoFar = matches.length > 0
    ? matches.reduce((a, b) => a.similarity > b.similarity ? a : b)
    : null;
  if (!bestSoFar || bestSoFar.similarity < 0.75 || !yearsCompatible(ref.year, bestSoFar.year)) {
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

  // Deduplicate by title similarity (year-aware: on near-equal similarity the
  // record whose year matches the reference wins)
  const deduped = deduplicateMatches(matches, ref.year);

  // Cache best match (deduped is already sorted year-aware, so [0] is the
  // year-consistent winner). Never cache a record whose year contradicts the
  // reference — it may be a re-registered copy and would poison the cache.
  if (deduped.length > 0) {
    const best = deduped[0];
    if (best.similarity >= 0.75 && yearsCompatible(ref.year, best.year)) {
      try { await indexReference(env, best, ref.raw); } catch {}
    }
  }

  const result = scoreMatches(deduped, null, !!ref.doi || !!ref.isbn, ref.year);
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

export function deduplicateMatches(matches: VerificationMatch[], refYear: number | null): VerificationMatch[] {
  const seen = new Map<string, VerificationMatch>();
  for (const m of matches) {
    const key = m.title.toLowerCase().slice(0, 50);
    const existing = seen.get(key);
    if (!existing || compareMatches(m, existing, refYear) < 0) {
      seen.set(key, m);
    }
  }
  return [...seen.values()].sort((a, b) => compareMatches(a, b, refYear));
}
