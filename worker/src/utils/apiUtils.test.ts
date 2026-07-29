import { describe, it, expect } from 'vitest';
import { escapeLucene, joinSameOrigin } from './apiUtils.js';

describe('escapeLucene — Solr/Lucene operator neutralization', () => {
  it('escapes query-syntax metacharacters', () => {
    expect(escapeLucene('title:(*)^99999 term~2')).toBe('title\\:\\(\\*\\)\\^99999 term\\~2');
  });

  it('preserves spaces as term separators and leaves plain words intact', () => {
    expect(escapeLucene('garcia machine learning')).toBe('garcia machine learning');
  });
});

describe('joinSameOrigin — cross-origin guard on third-party url fields', () => {
  it('joins a normal path on the same origin', () => {
    expect(joinSameOrigin('https://openlibrary.org', '/works/OL1W')).toBe('https://openlibrary.org/works/OL1W');
  });

  it('neutralizes an @-host trick by keeping it on the base origin', () => {
    // `${BASE}${key}` would yield https://openlibrary.org@evil.com/x (host=evil.com);
    // URL-resolution instead treats "@evil.com/x" as a path on the base origin.
    const url = joinSameOrigin('https://openlibrary.org', '@evil.com/x');
    expect(url).not.toBeNull();
    expect(new URL(url!).origin).toBe('https://openlibrary.org');
  });

  it('rejects an absolute off-origin URL and malformed input', () => {
    expect(joinSameOrigin('https://archive.org', 'https://evil.com/x')).toBeNull();
    expect(joinSameOrigin('https://archive.org', '\x00 not a url')).not.toContain('evil');
  });
});
