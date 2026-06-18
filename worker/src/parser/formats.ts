/**
 * Regex patterns for common citation formats.
 * Each returns named groups: authors, year, title, journal, doi, isbn
 */

// APA: Author, A. B., & Author, C. D. (2020). Title of work. Journal Name, 10(2), 1-20.
// Title capture allows periods inside parentheses, e.g. "(4.ª ed.)"
// Title group avoids nested quantifiers (ReDoS-safe): the three alternatives are
// disjoint on their first character, and the repetition is length-bounded.
const APA = /^(?<authors>.+?)\s*\((?<year>\d{4})\)\.\s*(?<title>(?:[^.(]|\([^)]*\)|\.\S){1,400})\.\s*(?<rest>.*)$/;

// MLA: Author. "Title." Journal, vol. 10, no. 2, 2020, pp. 1-20.
const MLA = /^(?<authors>.+?)\.\s*["""](?<title>[^"""]+)["""]\.\s*(?<rest>.*?)(?:,?\s*(?<year>\d{4}))(?<tail>.*)$/;

// Chicago: Author. Title. Place: Publisher, Year.
const CHICAGO = /^(?<authors>.+?)\.\s*(?<title>[^.]+)\.\s*(?<rest>.*?)(?<year>\d{4})(?<tail>.*)$/;

// Vancouver: Author(s). Title. Journal. Year;Vol(Issue):Pages.
const VANCOUVER = /^(?<authors>.+?)\.\s*(?<title>[^.]+)\.\s*(?<journal>[^.]+)\.\s*(?<year>\d{4})\s*[;:]?\s*(?<rest>.*)$/;

export type CitationFormat = 'apa' | 'mla' | 'chicago' | 'vancouver' | 'unknown';

export interface FormatMatch {
  format: CitationFormat;
  groups: Record<string, string | undefined>;
}

const DOI_PATTERN = /(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,}\/\S+)/i;
// Match ISBN with or without "ISBN:" prefix — bare 10/13 digit sequences too
const ISBN_PATTERN = /(?:ISBN[:\s-]*)?(97[89][-\s]?\d[-\s]?\d{2}[-\s]?\d{4}[-\s]?\d{3}[-\s]?\d|\d{9}[\dXx])/i;

export function detectFormat(line: string): FormatMatch {
  // Try APA first (most common in academia)
  let m = line.match(APA);
  if (m?.groups) return { format: 'apa', groups: m.groups };

  m = line.match(MLA);
  if (m?.groups) return { format: 'mla', groups: m.groups };

  m = line.match(VANCOUVER);
  if (m?.groups) return { format: 'vancouver', groups: m.groups };

  m = line.match(CHICAGO);
  if (m?.groups) return { format: 'chicago', groups: m.groups };

  return { format: 'unknown', groups: {} };
}

export function extractDoi(text: string): string | null {
  const m = text.match(DOI_PATTERN);
  return m ? m[1] : null;
}

export function extractIsbn(text: string): string | null {
  // First try with explicit ISBN prefix
  const explicit = text.match(/ISBN[:\s-]*([\d-]{10,17})/i);
  if (explicit) return explicit[1].replace(/[-\s]/g, '');
  // Then try bare ISBN patterns
  const m = text.match(ISBN_PATTERN);
  return m ? m[0].replace(/[-\s]/g, '') : null;
}
