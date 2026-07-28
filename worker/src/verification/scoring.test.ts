import { describe, it, expect } from 'vitest';
import type { VerificationMatch } from '@bibliohelp/shared';
import { scoreMatches, scoreIdentifierMismatch } from './scoring.js';

function match(similarity: number): VerificationMatch {
  return {
    title: 'Some Title',
    authors: ['Doe, J.'],
    year: 2020,
    doi: null,
    isbn: null,
    journal: null,
    publisher: null,
    source: 'crossref',
    similarity,
    url: null,
  };
}

describe('scoreMatches — no matches', () => {
  it('reports identifier-provided-but-not-found', () => {
    const r = scoreMatches([], null, true);
    expect(r.status).toBe('not_found');
    expect(r.score).toBe(0);
    expect(r.messageCode).toBe('msg.identifierNoMatch');
  });

  it('reports possible fabrication when no identifier was given', () => {
    const r = scoreMatches([], null, false);
    expect(r.messageCode).toBe('msg.noMatchFabricated');
  });
});

describe('scoreMatches — identifier verified', () => {
  it('is 100% verified via DOI regardless of fuzzy similarity', () => {
    const r = scoreMatches([match(0.2)], 'doi', true);
    expect(r.status).toBe('verified');
    expect(r.score).toBe(100);
    expect(r.messageCode).toBe('msg.verifiedVia');
    expect(r.messageParams).toEqual({ identifier: 'DOI' });
  });
});

describe('scoreMatches — year conflict on a high-similarity title', () => {
  it('demotes to partial when the match year contradicts the reference year', () => {
    const r = scoreMatches([match(1)], null, false, 2017); // match() is dated 2020
    expect(r.status).toBe('partial');
    expect(r.score).toBe(60);
    expect(r.messageCode).toBe('msg.yearConflict');
  });

  it('still verifies when years agree or are within ±1', () => {
    expect(scoreMatches([match(1)], null, false, 2020).status).toBe('verified');
    expect(scoreMatches([match(1)], null, false, 2019).status).toBe('verified');
  });

  it('still verifies when the reference has no year', () => {
    expect(scoreMatches([match(1)], null, false, null).status).toBe('verified');
  });

  it('does not affect identifier-verified references', () => {
    expect(scoreMatches([match(0.95)], 'doi', true, 1990).score).toBe(100);
  });
});

describe('scoreMatches — fuzzy tiers', () => {
  it('>= 0.90 → verified 95 (high confidence)', () => {
    const r = scoreMatches([match(0.95)], null, false);
    expect(r.status).toBe('verified');
    expect(r.score).toBe(95);
    expect(r.messageCode).toBe('msg.highConfidence');
    expect(r.messageParams).toEqual({ similarity: 95 });
  });

  it('0.75–0.90 → partial 70 (possible match)', () => {
    const r = scoreMatches([match(0.8)], null, false);
    expect(r.status).toBe('partial');
    expect(r.score).toBe(70);
    expect(r.messageCode).toBe('msg.possibleMatch');
  });

  it('0.50–0.75 → partial 40 (weak match)', () => {
    const r = scoreMatches([match(0.55)], null, false);
    expect(r.status).toBe('partial');
    expect(r.score).toBe(40);
    expect(r.messageCode).toBe('msg.weakMatch');
  });

  it('< 0.50 → not_found 10 (very low similarity)', () => {
    const r = scoreMatches([match(0.3)], null, false);
    expect(r.status).toBe('not_found');
    expect(r.score).toBe(10);
    expect(r.messageCode).toBe('msg.veryLowSimilarity');
  });
});

describe('scoreIdentifierMismatch', () => {
  it('flags a wrong DOI as likely_fake with the resolved title', () => {
    const r = scoreIdentifierMismatch('doi', 'Predicting event mentions');
    expect(r.status).toBe('likely_fake');
    expect(r.score).toBe(25);
    expect(r.messageCode).toBe('msg.identifierMismatch');
    expect(r.messageParams).toEqual({ identifier: 'DOI', matchedTitle: 'Predicting event mentions' });
  });

  it('works for ISBN too', () => {
    const r = scoreIdentifierMismatch('isbn', 'Introduction to Algorithms');
    expect(r.status).toBe('likely_fake');
    expect(r.messageParams).toMatchObject({ identifier: 'ISBN' });
  });
});
