import { describe, it, expect } from 'vitest';
import { authorsOverlap } from './engine.js';

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
