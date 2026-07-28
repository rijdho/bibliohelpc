import { describe, it, expect } from 'vitest';
import { parseStoredAuthors } from './repository.js';

describe('parseStoredAuthors — regression: "Family, Given" names mangled by split', () => {
  it('round-trips JSON-stored authors with commas inside names', () => {
    const authors = ['Vaswani, Ashish', 'Shazeer, Noam', 'Parmar, Niki'];
    expect(parseStoredAuthors(JSON.stringify(authors))).toEqual(authors);
  });

  it('still reads legacy comma-joined rows ("Given Family" style)', () => {
    expect(parseStoredAuthors('Ashish Vaswani, Noam Shazeer')).toEqual([
      'Ashish Vaswani',
      'Noam Shazeer',
    ]);
  });

  it('returns [] for null or empty', () => {
    expect(parseStoredAuthors(null)).toEqual([]);
    expect(parseStoredAuthors('')).toEqual([]);
  });

  it('falls back to splitting when the string only looks like JSON', () => {
    expect(parseStoredAuthors('[sic] Editors, The')).toEqual(['[sic] Editors', 'The']);
  });
});
