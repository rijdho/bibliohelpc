import { describe, it, expect } from 'vitest';
import type { VerificationMatch } from '@bibliohelp/shared';
import { authorsOverlap, deduplicateMatches } from './engine.js';
import { yearsCompatible } from './scoring.js';

describe('authorsOverlap — distinguishes translated title from wrong identifier', () => {
  it('true when a surname is shared (e.g. translated title, same authors)', () => {
    expect(authorsOverlap(['Jang, G.', 'Myaeng, S.'], ['Gwan Jang', 'Sung-Hyon Myaeng'])).toBe(true);
  });

  it('false when neither author overlaps (wrong/stolen identifier)', () => {
    expect(authorsOverlap(['García, J.', 'López, M.'], ['Gwan Jang', 'Sung-Hyon Myaeng'])).toBe(false);
  });

  it('true (cannot disprove) when the reference has no usable surnames', () => {
    expect(authorsOverlap([], ['Cormen', 'Rivest'])).toBe(true);
    expect(authorsOverlap(['J.'], ['Cormen'])).toBe(true);
  });

  it('ignores short tokens and is case-insensitive', () => {
    expect(authorsOverlap(['CORMEN, T. H.'], ['Thomas H. Cormen'])).toBe(true);
  });
});

describe('yearsCompatible', () => {
  it('accepts equal and ±1 years (online-first vs print)', () => {
    expect(yearsCompatible(2017, 2017)).toBe(true);
    expect(yearsCompatible(2017, 2018)).toBe(true);
  });

  it('rejects contradictory years', () => {
    expect(yearsCompatible(2017, 2025)).toBe(false);
  });

  it('cannot disprove when either year is missing', () => {
    expect(yearsCompatible(null, 2025)).toBe(true);
    expect(yearsCompatible(2017, null)).toBe(true);
  });
});

function mkMatch(over: Partial<VerificationMatch>): VerificationMatch {
  return {
    title: 'Attention Is All You Need',
    authors: [],
    year: null,
    doi: null,
    isbn: null,
    journal: null,
    publisher: null,
    source: 'crossref',
    similarity: 1,
    url: null,
    ...over,
  };
}

describe('deduplicateMatches — year-aware ranking (regression: re-registered copy beats original)', () => {
  it('on a similarity tie, the record whose year matches the reference wins', () => {
    const bogus = mkMatch({ year: 2025, doi: '10.65215/ne77pf66', source: 'openaire' });
    const real = mkMatch({ year: 2017, doi: '10.48550/arXiv.1706.03762' });
    // bogus arrives first (source order), but the 2017 reference should pick the real record
    const deduped = deduplicateMatches([bogus, real], 2017);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].year).toBe(2017);
  });

  it('a clearly higher similarity still wins over a year match', () => {
    const close = mkMatch({ title: 'Attention Is All You Need', year: 2025, similarity: 1 });
    const far = mkMatch({ title: 'Attention and other things', year: 2017, similarity: 0.6 });
    const deduped = deduplicateMatches([close, far], 2017);
    expect(deduped[0].similarity).toBe(1);
  });

  it('without a reference year, ranking falls back to similarity alone', () => {
    const a = mkMatch({ year: 2025, similarity: 1 });
    const b = mkMatch({ title: 'Different work entirely', year: 2017, similarity: 0.9 });
    const deduped = deduplicateMatches([a, b], null);
    expect(deduped[0].year).toBe(2025);
  });
});
