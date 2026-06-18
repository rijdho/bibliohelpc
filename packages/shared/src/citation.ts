import type { VerificationMatch, ParsedReference } from './types.js';

export type CitationFormat = 'APA' | 'MLA' | 'Chicago' | 'Vancouver';

/** Build a citation from best match data, falling back to parsed reference fields. */
export interface CitationData {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  isbn: string | null;
  journal: string | null;
  publisher: string | null;
  edition: string | null;
  url: string | null;
}

export function buildCitationData(ref: ParsedReference, match?: VerificationMatch): CitationData {
  // Choose best author source:
  // - Ref authors are better for informal formats (parsed from user input)
  // - Match authors are better when ref parsing splits APA-style "Last, I." incorrectly
  // Heuristic: if most ref authors are very short (< 4 chars), they're likely broken initials
  const isGarbage = (a: string) => !a.trim() || /^(https?:|\/\/|\/doi|doi[.:]|10\.\d)/.test(a.trim()) || a === 'undefined' || /doi\.org/.test(a);
  const refAuthors = ref.authors.filter(a => !isGarbage(a));
  const matchAuthors = (match?.authors ?? []).filter(a => !isGarbage(a));
  const refAuthorsLookBroken = refAuthors.length > 0 &&
    refAuthors.filter(a => a.replace(/[.,]/g, '').trim().length < 4).length > refAuthors.length * 0.4;
  const matchAuthorsLookBroken = matchAuthors.length > 0 &&
    matchAuthors.some(a => a.length > 60 || /\(/.test(a));

  let authors: string[];
  if (refAuthors.length === 0) {
    authors = matchAuthors;
  } else if (refAuthorsLookBroken && !matchAuthorsLookBroken && matchAuthors.length > 0) {
    authors = matchAuthors;
  } else {
    authors = refAuthors;
  }

  return {
    title: match?.title ?? ref.title,
    authors,
    year: ref.year ?? match?.year ?? null,
    doi: match?.doi ?? ref.doi,
    isbn: match?.isbn ?? ref.isbn,
    journal: match?.journal ?? ref.journal,
    publisher: ref.publisher ?? match?.publisher ?? null,
    edition: ref.edition ?? null,
    url: match?.url ?? null,
  };
}

/**
 * Detect if a name part is an initial: single letter, optionally with period.
 */
function isInitial(s: string): boolean {
  return /^[A-ZÁÉÍÓÚÑ]\.?$/i.test(s);
}

/**
 * Format author as "Surname, A. B." for APA/Vancouver.
 * Handles inputs like: "Haeussler E.", "Paul R.", "John Smith", "Smith, John"
 */
function authorLastInitials(name: string): string {
  const trimmed = name.trim().replace(/\.$/, '').trim();

  // Already "Last, First" format
  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(/,\s*/);
    const initials = rest.map(p => p.trim().split(/\s+/).map(w => w[0]?.toUpperCase() + '.').join(' ')).join(' ');
    return initials ? `${last}, ${initials}` : last;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  // "Surname Initial" pattern (e.g. "Haeussler E", "Paul R")
  // Detect: last part(s) are initials, first part is the surname
  const trailingInitials: string[] = [];
  while (parts.length > 1 && isInitial(parts[parts.length - 1])) {
    trailingInitials.unshift(parts.pop()!);
  }
  if (trailingInitials.length > 0) {
    const surname = parts.join(' ');
    const initStr = trailingInitials.map(i => i[0].toUpperCase() + '.').join(' ');
    return `${surname}, ${initStr}`;
  }

  // "First Last" pattern (e.g. "John Smith")
  const last = parts.pop()!;
  const initials = parts.map(p => p[0]?.toUpperCase() + '.').join(' ');
  return `${last}, ${initials}`;
}

/**
 * Format author as "Surname, First" for MLA/Chicago.
 */
function authorLastFirst(name: string): string {
  const trimmed = name.trim().replace(/\.$/, '').trim();

  if (trimmed.includes(',')) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  // "Surname Initial" pattern
  const trailingInitials: string[] = [];
  while (parts.length > 1 && isInitial(parts[parts.length - 1])) {
    trailingInitials.unshift(parts.pop()!);
  }
  if (trailingInitials.length > 0) {
    const surname = parts.join(' ');
    const initStr = trailingInitials.map(i => i[0].toUpperCase() + '.').join(' ');
    return `${surname}, ${initStr}`;
  }

  const last = parts.pop()!;
  return `${last}, ${parts.join(' ')}`;
}

/**
 * Normalize any author string to natural "First Last" order, used for the
 * non-first authors in MLA/Chicago (the first author stays inverted).
 * Handles "Last, First", "Surname I.", and already-natural "First Last".
 */
function authorNatural(name: string): string {
  const trimmed = name.trim().replace(/\.$/, '').trim();

  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(/,\s*/);
    const given = rest.join(' ').trim()
      .split(/\s+/).map(w => (w.length === 1 ? `${w}.` : w)).join(' ');
    return given ? `${given} ${last}` : last;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  // "Surname I." pattern → "I. Surname"
  const trailingInitials: string[] = [];
  while (parts.length > 1 && isInitial(parts[parts.length - 1])) {
    trailingInitials.unshift(parts.pop()!);
  }
  if (trailingInitials.length > 0) {
    const surname = parts.join(' ');
    const initStr = trailingInitials.map(i => `${i[0].toUpperCase()}.`).join(' ');
    return `${initStr} ${surname}`;
  }

  // Already "First Last"
  return trimmed;
}

function formatAuthorsAPA(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authorLastInitials(authors[0]);
  if (authors.length === 2) {
    return `${authorLastInitials(authors[0])} & ${authorLastInitials(authors[1])}`;
  }
  if (authors.length <= 20) {
    const all = authors.map(authorLastInitials);
    const last = all.pop();
    return `${all.join(', ')}, & ${last}`;
  }
  const first19 = authors.slice(0, 19).map(authorLastInitials);
  return `${first19.join(', ')}, ... ${authorLastInitials(authors[authors.length - 1])}`;
}

function formatAuthorsMLA(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authorLastFirst(authors[0]);
  if (authors.length === 2) {
    return `${authorLastFirst(authors[0])}, and ${authorNatural(authors[1])}`;
  }
  return `${authorLastFirst(authors[0])}, et al.`;
}

function formatAuthorsChicago(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authorLastFirst(authors[0]);
  if (authors.length <= 3) {
    const all = authors.map((a, i) => i === 0 ? authorLastFirst(a) : authorNatural(a));
    const last = all.pop();
    return `${all.join(', ')}, and ${last}`;
  }
  return `${authorLastFirst(authors[0])}, et al.`;
}

function formatAuthorsVancouver(authors: string[]): string {
  if (authors.length === 0) return '';
  const formatted = authors.slice(0, 6).map(authorLastInitials);
  if (authors.length > 6) {
    return `${formatted.join(', ')}, et al.`;
  }
  return formatted.join(', ');
}

function doiUrl(doi: string): string {
  return doi.startsWith('http') ? doi : `https://doi.org/${doi}`;
}

export function formatCitation(data: CitationData, format: CitationFormat): string {
  const { title, authors, year, doi, journal, publisher, edition, url } = data;
  const edStr = edition ? ` (${edition})` : '';

  switch (format) {
    case 'APA': {
      const parts: string[] = [];
      const authStr = formatAuthorsAPA(authors);
      if (authStr) parts.push(authStr);
      parts.push(year ? `(${year}).` : '(s.f.).');
      parts.push(`_${title}_${edStr}.`);
      if (journal) parts.push(`_${journal}_.`);
      if (publisher) parts.push(publisher + '.');
      if (doi) parts.push(doiUrl(doi));
      else if (url) parts.push(url);
      return parts.join(' ');
    }

    case 'MLA': {
      const parts: string[] = [];
      const authStr = formatAuthorsMLA(authors);
      if (authStr) parts.push(authStr + '.');
      parts.push(`_${title}_${edStr}.`);
      if (journal) parts.push(`_${journal}_,`);
      if (publisher) parts.push(publisher + ',');
      if (year) parts.push(`${year}.`);
      if (doi) parts.push(doiUrl(doi) + '.');
      else if (url) parts.push(url + '.');
      return parts.join(' ');
    }

    case 'Chicago': {
      const parts: string[] = [];
      const authStr = formatAuthorsChicago(authors);
      if (authStr) parts.push(authStr + '.');
      parts.push(`_${title}_${edStr}.`);
      if (journal) parts.push(`_${journal}_.`);
      if (publisher) parts.push(publisher + ',');
      if (year) parts.push(`${year}.`);
      if (doi) parts.push(doiUrl(doi) + '.');
      else if (url) parts.push(url + '.');
      return parts.join(' ');
    }

    case 'Vancouver': {
      const parts: string[] = [];
      const authStr = formatAuthorsVancouver(authors);
      if (authStr) parts.push(authStr + '.');
      parts.push(title + edStr + '.');
      if (journal) parts.push(journal + '.');
      if (publisher) parts.push(publisher + ';');
      if (year) parts.push(`${year}.`);
      if (doi) parts.push(`doi: ${doi}`);
      else if (url) parts.push(`Disponible en: ${url}`);
      return parts.join(' ');
    }
  }
}

/** Plain text version (no markdown italic markers). */
export function formatCitationPlain(data: CitationData, format: CitationFormat): string {
  return formatCitation(data, format).replace(/_/g, '');
}

// ---------------------------------------------------------------------------
// BibTeX / RIS export
// ---------------------------------------------------------------------------

/**
 * Generate a BibTeX cite key from first author surname + year.
 * Falls back to "ref" if no author, and "nd" if no year.
 */
function bibtexKey(data: CitationData): string {
  let surname = 'ref';
  if (data.authors.length > 0) {
    const first = data.authors[0].trim();
    // Take the part before comma or first word
    const part = first.includes(',') ? first.split(',')[0].trim() : first.split(/\s+/).pop()!;
    surname = part
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase() || 'ref';
  }
  const yr = data.year ?? 'nd';
  return `${surname}${yr}`;
}

/** Escape special BibTeX characters in a value. */
function bibtexEscape(s: string): string {
  return s.replace(/([&%$#_{}~^\\])/g, '\\$1');
}

/**
 * Format author for BibTeX: "Surname, First" joined with " and ".
 * Reuses the authorLastFirst helper logic.
 */
function bibtexAuthors(authors: string[]): string {
  return authors.map(name => {
    const trimmed = name.trim().replace(/\.$/, '').trim();
    if (trimmed.includes(',')) return trimmed;
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0];
    // Check trailing initials
    const trailing: string[] = [];
    while (parts.length > 1 && /^[A-ZÁÉÍÓÚÑ]\.?$/i.test(parts[parts.length - 1])) {
      trailing.unshift(parts.pop()!);
    }
    if (trailing.length > 0) {
      return `${parts.join(' ')}, ${trailing.map(i => i[0].toUpperCase() + '.').join(' ')}`;
    }
    const last = parts.pop()!;
    return `${last}, ${parts.join(' ')}`;
  }).join(' and ');
}

/** Format a single CitationData as a BibTeX entry. */
export function formatBibtex(data: CitationData): string {
  const { title, authors, year, doi, isbn, journal, publisher, edition } = data;

  // Determine entry type
  let entryType: string;
  if (journal) entryType = 'article';
  else if (publisher && !journal) entryType = 'book';
  else entryType = 'misc';

  const key = bibtexKey(data);
  const fields: string[] = [];

  if (authors.length > 0) fields.push(`  author = {${bibtexAuthors(authors)}}`);
  if (title) fields.push(`  title = {${bibtexEscape(title)}}`);
  if (journal) fields.push(`  journal = {${bibtexEscape(journal)}}`);
  if (year) fields.push(`  year = {${year}}`);
  if (edition) fields.push(`  edition = {${bibtexEscape(edition)}}`);
  if (publisher) fields.push(`  publisher = {${bibtexEscape(publisher)}}`);
  if (doi) fields.push(`  doi = {${doi}}`);
  if (isbn) fields.push(`  isbn = {${isbn}}`);

  return `@${entryType}{${key},\n${fields.join(',\n')}\n}`;
}

/** Format a single CitationData as a RIS entry. */
export function formatRis(data: CitationData): string {
  const { title, authors, year, doi, isbn, journal, publisher, url } = data;

  // Determine type tag
  let ty: string;
  if (journal) ty = 'JOUR';
  else if (publisher && !journal) ty = 'BOOK';
  else ty = 'GEN';

  const lines: string[] = [];
  lines.push(`TY  - ${ty}`);
  for (const a of authors) {
    // Format as "Surname, First" for RIS AU field
    const trimmed = a.trim().replace(/\.$/, '').trim();
    let formatted: string;
    if (trimmed.includes(',')) {
      formatted = trimmed;
    } else {
      const parts = trimmed.split(/\s+/);
      if (parts.length === 1) {
        formatted = parts[0];
      } else {
        const trailing: string[] = [];
        while (parts.length > 1 && /^[A-ZÁÉÍÓÚÑ]\.?$/i.test(parts[parts.length - 1])) {
          trailing.unshift(parts.pop()!);
        }
        if (trailing.length > 0) {
          formatted = `${parts.join(' ')}, ${trailing.map(i => i[0].toUpperCase() + '.').join(' ')}`;
        } else {
          const last = parts.pop()!;
          formatted = `${last}, ${parts.join(' ')}`;
        }
      }
    }
    lines.push(`AU  - ${formatted}`);
  }
  if (title) lines.push(`TI  - ${title}`);
  if (journal) lines.push(`JO  - ${journal}`);
  if (year) lines.push(`PY  - ${year}`);
  if (doi) lines.push(`DO  - ${doi}`);
  if (publisher) lines.push(`PB  - ${publisher}`);
  if (isbn) lines.push(`SN  - ${isbn}`);
  if (url) lines.push(`UR  - ${url}`);
  lines.push('ER  - ');

  return lines.join('\n');
}

/** Format multiple citations as a single BibTeX string. */
export function formatAllBibtex(citations: CitationData[]): string {
  return citations.map(formatBibtex).join('\n\n');
}

/** Format multiple citations as a single RIS string. */
export function formatAllRis(citations: CitationData[]): string {
  return citations.map(formatRis).join('\n');
}
