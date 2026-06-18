import type { ParsedReference } from '@bibliohelp/shared';
import { normalizeDoi, normalizeIsbn } from '@bibliohelp/shared';
import { detectFormat, extractDoi, extractIsbn } from './formats.js';

/**
 * Parse a single reference string into structured data.
 */
export function parseReference(raw: string): ParsedReference {
  // Check for BibTeX entry
  if (raw.trim().startsWith('@')) {
    const bibtexResult = parseBibtexEntry(raw);
    if (bibtexResult) return bibtexResult;
  }

  // Check for RIS entry
  if (raw.trim().startsWith('TY  -')) {
    const risResult = parseRisEntry(raw);
    if (risResult) return risResult;
  }

  // Strip leading bullets/dashes (-, *, •, —, –)
  const trimmed = raw.trim().replace(/^[-\u2022\u2013\u2014*]\s*/, '');

  // Check for catalog format first: "Title / Author" (slash separator)
  const slashMatch = trimmed.match(/^(.+?)\s*\/\s*(.+)$/);
  if (slashMatch) {
    const doiRaw = extractDoi(trimmed);
    const isbnRaw = extractIsbn(trimmed);
    const catalogTitle = cleanTitle(slashMatch[1]);
    const catalogAuthors = parseAuthors(slashMatch[2].replace(/\.\s*$/, ''));
    const year = parseYear(trimmed);
    return {
      raw: trimmed,
      authors: catalogAuthors,
      title: catalogTitle,
      year,
      doi: normalizeDoi(doiRaw || ''),
      isbn: normalizeIsbn(isbnRaw || ''),
      journal: null,
      publisher: null,
      edition: parseEdition(trimmed),
      format: 'unknown',
    };
  }

  // Try format detection first (APA/MLA/Chicago/Vancouver)
  const { format, groups } = detectFormat(trimmed);

  // If the detected format looks like a mismatch (e.g. Chicago grabbed an informal ref),
  // try informal format first. Heuristic: if the "authors" section is very short
  // (just a surname + initial like "Haeussler E") and format is chicago/vancouver,
  // it's likely an informal "Surname I., Title, Publisher, Year" ref.
  const detectedAuthors = groups.authors || '';
  // Detect informal refs misidentified as chicago/vancouver:
  // "Arya,J" or "Haeussler E" or "Arya, J" — short author block with surname + initial
  const looksInformal = (format === 'chicago' || format === 'vancouver') &&
    detectedAuthors.length < 20 &&
    /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+[,\s]+[A-ZÁÉÍÓÚÑ]\.?$/i.test(detectedAuthors.trim());

  if (format === 'unknown' || looksInformal) {
    const informalResult = tryInformalFormat(trimmed);
    if (informalResult) return informalResult;
  }

  // Extract DOI and ISBN from anywhere in the string
  const doiRaw = extractDoi(trimmed);
  const isbnRaw = extractIsbn(trimmed);

  const authors = parseAuthors(groups.authors || '');
  let title = cleanTitle(groups.title || extractFallbackTitle(trimmed));
  // If parsed title is too short, the format regex likely misparsed — use fallback
  if (title.length < 15) {
    title = cleanTitle(extractFallbackTitle(trimmed));
  }
  const year = parseYear(groups.year || trimmed);

  // Try to extract journal from 'rest' field
  let journal: string | null = null;
  const rest = groups.rest || groups.journal || '';
  if (rest) {
    const journalMatch = rest.match(/^([^,;.]+)/);
    if (journalMatch && journalMatch[1].trim().length > 3) {
      journal = journalMatch[1].trim();
    }
  }

  return {
    raw: trimmed,
    authors,
    title,
    year,
    doi: normalizeDoi(doiRaw || ''),
    isbn: normalizeIsbn(isbnRaw || ''),
    journal,
    publisher: null,
    edition: parseEdition(trimmed),
    format,
  };
}

/**
 * Detect informal bibliography format common in Latin American academia:
 * "Surname,I., Surname,I., Title with many words, edition, Publisher, Year."
 * Key insight: author segments are short (< 20 chars) and match "Word I." or "Word,I." pattern,
 * while the title is the first long comma-separated segment.
 */
function tryInformalFormat(text: string): ParsedReference | null {
  // Normalize "Arya,J." → "Arya, J." (add space after comma when stuck to an initial)
  const normalized = text.replace(/,([A-ZÁÉÍÓÚÑ]\.?\s)/g, ', $1');

  // Split by comma, keeping track of segments
  const segments = normalized.split(/,\s*/);
  if (segments.length < 3) return null;

  // Author name segments: short, contain initials (single letter + optional period)
  // Matches: "Arya", "Budnick", "Haeussler E.", "Paul R.", "Wood R.", "J.", "F", "R"
  // Also matches: "J. Lardner" (initial + surname, reversed order)
  const authorPattern = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ]\.?)?$/;
  const reversedAuthorPattern = /^[A-ZÁÉÍÓÚÑ]\.?\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/;

  const authorParts: string[] = [];
  let titleStartIdx = -1;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    // Check if this looks like an author name or initial
    if (seg.length < 20 && (authorPattern.test(seg) || reversedAuthorPattern.test(seg) || /^[A-ZÁÉÍÓÚÑ]\.?$/.test(seg))) {
      authorParts.push(seg);
    } else {
      titleStartIdx = i;
      break;
    }
  }

  // Need at least 1 author part and a title
  if (authorParts.length === 0 || titleStartIdx < 0) return null;
  // Title segment should be substantially longer than author segments
  const titleSeg = segments[titleStartIdx].trim();
  if (titleSeg.length < 20) return null;

  // Reconstruct authors: group "Surname" + "I." pairs
  const authors: string[] = [];
  for (let i = 0; i < authorParts.length; i++) {
    const part = authorParts[i];
    if (/^[A-ZÁÉÍÓÚÑ]\.?$/.test(part) && authors.length > 0) {
      // This is an initial — append to previous author
      authors[authors.length - 1] += ` ${part.replace(/\.$/, '')}.`;
    } else {
      authors.push(part);
    }
  }

  // Title: concatenate segments until we hit pure metadata (edition, publisher, year)
  const pureMetadataPattern = /^(\d+[ªa]?\s*)?edici[oó]n|^\d{4}\.?$|^(McGraw|Pearson|Prentice|Springer|Wiley|Cengage|Oxford|Cambridge)/i;
  const titleParts: string[] = [titleSeg];
  for (let i = titleStartIdx + 1; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (pureMetadataPattern.test(seg)) break;
    if (seg.length > 15) {
      // If segment contains ". " followed by edition-like text, take only the part before the dot
      const editionSplit = seg.match(/^(.+?)\.\s*(.*edici[oó]n.*)$/i);
      if (editionSplit) {
        titleParts.push(editionSplit[1]);
        break;
      }
      titleParts.push(seg);
    } else {
      break;
    }
  }

  let title = titleParts.join(', ').replace(/\.\s*$/, '');

  const year = parseYear(text);
  const doiRaw = extractDoi(text);
  const isbnRaw = extractIsbn(text);

  // Look for publisher in remaining segments (before year)
  let publisher: string | null = null;
  const remaining = segments.slice(titleStartIdx + 1);
  for (const seg of remaining) {
    const clean = seg.trim().replace(/\.\s*$/, '');
    if (/^\d{4}$/.test(clean)) continue; // skip year
    if (/edici[oó]n/i.test(clean)) continue; // skip "cuarta edición"
    if (clean.length > 2 && clean.length < 40 && !clean.match(/^\d/)) {
      publisher = clean;
      break;
    }
  }

  return {
    raw: text,
    authors,
    title,
    year,
    doi: normalizeDoi(doiRaw || ''),
    isbn: normalizeIsbn(isbnRaw || ''),
    journal: null,
    publisher,
    edition: parseEdition(text),
    format: 'unknown',
  };
}

function parseAuthors(raw: string): string[] {
  if (!raw || raw.trim().length === 0) return [];

  // Split on common delimiters: &, ;, "and", comma-separated
  return raw
    .split(/\s*(?:&|;|\band\b)\s*|,\s*(?=[A-Z])/)
    .map(a => a.trim())
    .filter(a => a.length > 1 && !a.match(/^\d/));
}

function cleanTitle(title: string): string {
  return title
    .replace(/^["'""\s]+/, '')
    .replace(/["'""\s.]+$/, '')
    .trim();
}

function extractFallbackTitle(text: string): string {
  // Split on period+space only (not comma — titles often contain commas)
  const parts = text.split(/\.\s+/).filter(p => p.length > 5);
  if (parts.length >= 2) {
    // Return the longest segment — titles tend to be longer than author names
    return parts.reduce((a, b) => a.length >= b.length ? a : b);
  }
  return text.slice(0, 200);
}

function parseYear(text: string): number | null {
  const m = text.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  const year = parseInt(m[0], 10);
  return year >= 1800 && year <= new Date().getFullYear() + 1 ? year : null;
}

function parseEdition(text: string): string | null {
  // Match patterns like: "13a edición", "Cuarta edición", "4th edition", "2nd ed.", "3ª edición"
  const m = text.match(/(\d+[ªa]?\s*(?:edici[oó]n|ed\.?)|(?:primera|segunda|tercera|cuarta|quinta|sexta|s[eé]ptima|octava|novena|d[eé]cima|[a-z]+)\s+edici[oó]n|\d+(?:st|nd|rd|th)\s+edition?)/i);
  return m ? m[0].trim() : null;
}

/**
 * Extract a field value from a BibTeX entry.
 * Handles: field = {value}, field = "value", field = 12345
 */
function extractBibtexField(entry: string, field: string): string | null {
  // Match field = {value} with nested braces support
  const braceRegex = new RegExp(`${field}\\s*=\\s*\\{`, 'i');
  const braceMatch = braceRegex.exec(entry);
  if (braceMatch) {
    const start = braceMatch.index + braceMatch[0].length;
    let depth = 1;
    let i = start;
    while (i < entry.length && depth > 0) {
      if (entry[i] === '{') depth++;
      else if (entry[i] === '}') depth--;
      i++;
    }
    if (depth === 0) {
      return entry.slice(start, i - 1).trim();
    }
  }

  // Match field = "value"
  const quoteRegex = new RegExp(`${field}\\s*=\\s*"([^"]*)"`, 'i');
  const quoteMatch = entry.match(quoteRegex);
  if (quoteMatch) return quoteMatch[1].trim();

  // Match field = number (bare numeric value)
  const numRegex = new RegExp(`${field}\\s*=\\s*(\\d+)`, 'i');
  const numMatch = entry.match(numRegex);
  if (numMatch) return numMatch[1].trim();

  return null;
}

/**
 * Parse a BibTeX entry into a ParsedReference.
 * BibTeX format: @type{citekey, field1 = {value1}, field2 = {value2}, ...}
 */
function parseBibtexEntry(raw: string): ParsedReference | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('@')) return null;

  const title = extractBibtexField(trimmed, 'title');
  if (!title) return null;

  // Parse authors: "Last1, First1 and Last2, First2" or "First1 Last1 and First2 Last2"
  const authorField = extractBibtexField(trimmed, 'author');
  const authors: string[] = [];
  if (authorField) {
    const authorEntries = authorField.split(/\s+and\s+/i);
    for (const a of authorEntries) {
      const cleaned = a.trim().replace(/\s+/g, ' ');
      if (cleaned.length > 0) {
        authors.push(cleaned);
      }
    }
  }

  // Year
  const yearStr = extractBibtexField(trimmed, 'year');
  let year: number | null = null;
  if (yearStr) {
    const parsed = parseInt(yearStr, 10);
    if (parsed >= 1800 && parsed <= new Date().getFullYear() + 1) {
      year = parsed;
    }
  }

  // DOI: from BibTeX field, then fallback to extractDoi on raw text
  const doiField = extractBibtexField(trimmed, 'doi');
  const doi = normalizeDoi(doiField || '') || normalizeDoi(extractDoi(trimmed) || '');

  // ISBN: from BibTeX field, then fallback to extractIsbn on raw text
  const isbnField = extractBibtexField(trimmed, 'isbn');
  const isbn = normalizeIsbn(isbnField || '') || normalizeIsbn(extractIsbn(trimmed) || '');

  // Journal
  const journal = extractBibtexField(trimmed, 'journal') || null;

  // Publisher
  const publisher = extractBibtexField(trimmed, 'publisher') || null;

  // Edition
  const edition = extractBibtexField(trimmed, 'edition') || parseEdition(trimmed);

  return {
    raw: trimmed,
    authors,
    title: cleanTitle(title),
    year,
    doi,
    isbn,
    journal,
    publisher,
    edition,
    format: 'unknown',
  };
}

/**
 * Parse a RIS entry into a ParsedReference.
 * RIS format: each line is TAG  - value, entries delimited by TY/ER.
 */
function parseRisEntry(raw: string): ParsedReference | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('TY  -')) return null;

  const lines = trimmed.split('\n');
  const fields: Record<string, string[]> = {};

  for (const line of lines) {
    const tagMatch = line.trim().match(/^([A-Z][A-Z0-9])\s{2}-\s(.*)$/);
    if (tagMatch) {
      const tag = tagMatch[1];
      const value = tagMatch[2].trim();
      if (!fields[tag]) fields[tag] = [];
      fields[tag].push(value);
    }
  }

  // Title: TI or T1
  const title = fields['TI']?.[0] || fields['T1']?.[0];
  if (!title) return null;

  // Authors: AU or A1 (multiple lines = multiple authors)
  const authors: string[] = [];
  const authorTags = fields['AU'] || fields['A1'] || [];
  for (const a of authorTags) {
    const cleaned = a.trim();
    if (cleaned.length > 0) {
      authors.push(cleaned);
    }
  }

  // Year: PY or Y1 (may contain YYYY or YYYY/MM/DD///)
  let year: number | null = null;
  const yearStr = fields['PY']?.[0] || fields['Y1']?.[0];
  if (yearStr) {
    const yearMatch = yearStr.match(/(\d{4})/);
    if (yearMatch) {
      const parsed = parseInt(yearMatch[1], 10);
      if (parsed >= 1800 && parsed <= new Date().getFullYear() + 1) {
        year = parsed;
      }
    }
  }

  // DOI: DO tag, then fallback to extractDoi
  const doiField = fields['DO']?.[0] || null;
  const doi = normalizeDoi(doiField || '') || normalizeDoi(extractDoi(trimmed) || '');

  // ISBN/ISSN: SN tag, then fallback to extractIsbn
  const snField = fields['SN']?.[0] || null;
  const isbn = normalizeIsbn(snField || '') || normalizeIsbn(extractIsbn(trimmed) || '');

  // Journal: JO, JF, or T2
  const journal = fields['JO']?.[0] || fields['JF']?.[0] || fields['T2']?.[0] || null;

  // Publisher: PB
  const publisher = fields['PB']?.[0] || null;

  // Edition: ET tag
  const edition = fields['ET']?.[0] || null;

  // URL: UR tag
  // (stored for reference but ParsedReference doesn't have a url field currently)

  return {
    raw: trimmed,
    authors,
    title: cleanTitle(title),
    year,
    doi,
    isbn,
    journal,
    publisher,
    edition,
    format: 'unknown',
  };
}
