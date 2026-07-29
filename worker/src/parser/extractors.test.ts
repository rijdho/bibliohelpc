import { describe, it, expect } from 'vitest';
import { parseReference } from './extractors.js';

describe('parseReference — APA with DOI URL (regression: catalog "//" false match)', () => {
  const ref = parseReference(
    'García, J., & López, M. (2019). Machine learning approaches for text classification in academic documents. Journal of Information Science, 45(3), 312-328. https://doi.org/10.1177/0165551518761012',
  );

  it('detects APA format, not catalog', () => {
    expect(ref.format).toBe('apa');
  });

  it('extracts the real title (not the whole citation)', () => {
    expect(ref.title).toBe('Machine learning approaches for text classification in academic documents');
  });

  it('extracts authors (not a URL fragment) and re-pairs surname+initials', () => {
    expect(ref.authors).toEqual(['García, J.', 'López, M.']);
  });

  it('extracts the DOI', () => {
    expect(ref.doi).toBe('10.1177/0165551518761012');
  });

  it('does NOT invent an ISBN from DOI digits', () => {
    expect(ref.isbn).toBeNull();
  });

  it('extracts the year', () => {
    expect(ref.year).toBe(2019);
  });
});

describe('parseAuthors (via parseReference) — surname/initial grouping', () => {
  it('keeps multi-initial and hyphenated initials intact', () => {
    const ref = parseReference(
      'Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2009). Introduction to Algorithms. MIT Press.',
    );
    expect(ref.authors).toEqual(['Cormen, T. H.', 'Leiserson, C. E.', 'Rivest, R. L.', 'Stein, C.']);
  });

  it('handles a long author list with "et al."-style separators', () => {
    const ref = parseReference(
      'Vaswani, A., Shazeer, N., Parmar, N., & Polosukhin, I. (2017). Attention is all you need. NeurIPS, 30.',
    );
    expect(ref.authors).toEqual(['Vaswani, A.', 'Shazeer, N.', 'Parmar, N.', 'Polosukhin, I.']);
  });
});

describe('ISBN extraction', () => {
  it('extracts a real ISBN-13 with hyphens', () => {
    const ref = parseReference('Smith, J. (2020). A Book. O’Reilly. ISBN 978-0-13-468599-1');
    expect(ref.isbn).toBe('9780134685991');
  });

  it('does not match a 10-digit run embedded in a DOI', () => {
    const ref = parseReference('Author, A. (2018). Title. Journal. https://doi.org/10.1177/0165551518761012');
    expect(ref.isbn).toBeNull();
  });
});

describe('ISBN validation — path-traversal guard (security)', () => {
  it('rejects a 10-char BibTeX isbn field that is not a valid ISBN', () => {
    const ref = parseReference('@book{x, title = {A Sufficiently Long Title Here}, isbn = {.././stats}}');
    expect(ref.isbn).toBeNull();
  });

  it('rejects a 13-char traversal string in a RIS SN field', () => {
    const ref = parseReference('TY  - BOOK\nTI  - Some Book Title\nSN  - ../books/abcd\nER  -');
    expect(ref.isbn).toBeNull();
  });

  it('still accepts a genuine ISBN-13 and ISBN-10 (incl. trailing X)', () => {
    expect(parseReference('@book{x, title = {T}, isbn = {978-0-262-03384-8}}').isbn).toBe('9780262033848');
    expect(parseReference('@book{x, title = {T}, isbn = {0-306-40615-2}}').isbn).toBe('0306406152');
    expect(parseReference('@book{x, title = {T}, isbn = {0-8044-2957-X}}').isbn).toBe('080442957X');
  });
});

describe('parser is bounded on adversarial input (ReDoS guard)', () => {
  it('handles a 50 KB no-whitespace letter run fast (parseEdition/format regexes)', () => {
    const start = Date.now();
    const ref = parseReference('a'.repeat(50_000));
    expect(Date.now() - start).toBeLessThan(200);
    expect(ref.raw.length).toBeLessThanOrEqual(4000);
  });

  it('handles a 50 KB `. "a". ` repeat fast (MLA/CHICAGO lazy prefixes)', () => {
    const start = Date.now();
    parseReference('. "a". '.repeat(7142));
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('still detects a real edition after the [a-z] bound', () => {
    const ref = parseReference('Autor, A. (2019). Un libro (cuarta edición). Editorial.');
    expect(ref.edition).toMatch(/edici/i);
  });
});

describe('catalog format "Title / Author" still works', () => {
  const ref = parseReference('Introduction to Algorithms / Thomas H. Cormen. Cambridge: MIT Press, 2009. ISBN 978-0-262-03384-8');
  it('takes the pre-slash text as title', () => {
    expect(ref.title).toBe('Introduction to Algorithms');
  });
  it('still extracts the ISBN', () => {
    expect(ref.isbn).toBe('9780262033848');
  });
});

describe('BibTeX parsing', () => {
  const ref = parseReference(
    '@article{key, title = {Attention Is All You Need}, author = {Vaswani, Ashish and Shazeer, Noam}, year = {2017}, doi = {10.5555/3295222.3295349}}',
  );
  it('extracts title, year and doi', () => {
    expect(ref.title).toBe('Attention Is All You Need');
    expect(ref.year).toBe(2017);
    expect(ref.doi).toBe('10.5555/3295222.3295349');
  });
  it('extracts authors', () => {
    expect(ref.authors).toEqual(['Vaswani, Ashish', 'Shazeer, Noam']);
  });
});
