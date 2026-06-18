/**
 * Split a bibliography text block into individual reference entries.
 * Handles numbered lists, blank-line separated, paragraph-style entries,
 * single-line pasted text (newlines lost from PDF/Word copy),
 * BibTeX entries, and RIS entries.
 */
export function splitReferences(text: string): string[] {
  // Detect BibTeX format
  if (text.includes('@article{') || text.includes('@book{') || text.includes('@inproceedings{') || text.includes('@misc{') || text.includes('@incollection{') || text.includes('@phdthesis{') || text.includes('@mastersthesis{') || text.includes('@inbook{') || text.includes('@techreport{') || text.includes('@conference{') || text.includes('@proceedings{') || text.includes('@unpublished{')) {
    return splitBibtex(text);
  }

  // Detect RIS format
  if (/^TY\s{2}-\s/m.test(text)) {
    return splitRis(text);
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length === 0) return [];

  // Check if entries are numbered (1. or [1] or 1) prefix) or bulleted (- or *)
  const numberedPattern = /^(?:\[?\d+[.\])\s]|\d+\.\s)/;
  const bulletPattern = /^[-\u2022\u2013\u2014*]\s*/;
  const numberedCount = lines.filter(l => numberedPattern.test(l)).length;
  const bulletCount = lines.filter(l => bulletPattern.test(l)).length;

  if (numberedCount >= lines.length * 0.5 && lines.length >= 2) {
    return mergeNumberedEntries(lines, numberedPattern);
  }

  if (bulletCount >= lines.length * 0.5 && lines.length >= 2) {
    return mergeNumberedEntries(lines, bulletPattern);
  }

  // Check if separated by blank lines in the original text
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 0);
  if (blocks.length >= 2) {
    return blocks.map(b => b.replace(/\s*\n\s*/g, ' ').trim());
  }

  // If we only have 1 line (or joined text) and it's long, try to split inline
  const joined = lines.join(' ');
  if (lines.length <= 2 && joined.length > 150) {
    const inlineSplit = splitInlineReferences(joined);
    if (inlineSplit.length >= 2) return inlineSplit;
  }

  // Fall back: each line is a reference (common for single-line entries)
  return lines.filter(l => l.length > 20); // Skip very short lines
}

/**
 * Split a single long string into references by detecting boundaries.
 * Handles text pasted from PDFs/Word where newlines are lost.
 */
function splitInlineReferences(text: string): string[] {
  let m: RegExpExecArray | null;

  // Strategy 1: inline numbered references "1. ... 2. ... 3. ..."
  // Find positions of sequential numbers: look for "N. " or "N) " patterns
  const numberPositions: number[] = [];
  const numberedInline = /(?:^|\s)(\d+)[.\)]\s+/g;

  while ((m = numberedInline.exec(text)) !== null) {
    const numStart = m.index + m[0].indexOf(m[1]);
    numberPositions.push(numStart);
  }

  // Check if numbers are sequential (1, 2, 3...) to avoid false positives
  if (numberPositions.length >= 2) {
    const nums = numberPositions.map(pos => {
      const numMatch = text.slice(pos).match(/^(\d+)/);
      return numMatch ? parseInt(numMatch[1]) : 0;
    });
    const isSequential = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    if (isSequential) {
      const entries = extractEntries(text, numberPositions, /^\d+[.\)]\s*/);
      if (entries.length >= 2) return entries;
    }
  }

  // Strategy 2: detect APA author-start boundaries
  // In APA, authors are "Surname, I." — surname + comma + initial with period.
  // A new reference starts where we see this pattern AFTER a sentence end.
  // We look for: [sentence end] [space] [Surname, I.]
  // where sentence end = period, closing paren + period, number, ISBN, URL, etc.
  const authorStartPositions: number[] = [0];

  // Match: after ". " or ") " or digit+". " — find "Surname, I." pattern
  // The "Surname, I." must have: Capital + 2+ lowercase + comma + space + Capital + period
  const authorStart = /[.!?)0-9]\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,},\s+[A-ZÁÉÍÓÚÑ]\.)/g;

  while ((m = authorStart.exec(text)) !== null) {
    // Split position: right after the whitespace, at the start of the surname
    const splitAt = m.index + m[0].length;
    if (splitAt - authorStartPositions[authorStartPositions.length - 1] > 50) {
      authorStartPositions.push(splitAt);
    }
  }

  if (authorStartPositions.length >= 2) {
    const entries = extractEntries(text, authorStartPositions);
    if (entries.length >= 2) return entries;
  }

  return [];
}

/** Extract entries from text given split positions, optionally stripping a prefix pattern */
function extractEntries(text: string, positions: number[], stripPrefix?: RegExp): string[] {
  const entries: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : text.length;
    let entry = text.slice(start, end).trim();
    if (stripPrefix) entry = entry.replace(stripPrefix, '');
    entry = entry.replace(/\.\s*$/, '').trim();
    if (entry.length > 20) entries.push(entry);
  }
  return entries;
}

function mergeNumberedEntries(lines: string[], pattern: RegExp): string[] {
  const entries: string[] = [];
  let current = '';

  for (const line of lines) {
    if (pattern.test(line)) {
      if (current) entries.push(current.trim());
      current = line.replace(pattern, '').trim();
    } else {
      current += ' ' + line;
    }
  }
  if (current) entries.push(current.trim());

  return entries.filter(e => e.length > 10);
}

/**
 * Split BibTeX text into individual entries.
 * Uses a brace counter to handle nested braces within field values.
 */
function splitBibtex(text: string): string[] {
  const entries: string[] = [];
  const entryStart = /@\w+\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = entryStart.exec(text)) !== null) {
    const start = match.index;
    let depth = 0;
    let end = -1;

    for (let i = start + match[0].length - 1; i < text.length; i++) {
      if (text[i] === '{') {
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end > start) {
      const entry = text.slice(start, end).trim();
      if (entry.length > 10) {
        entries.push(entry);
      }
    }
  }

  return entries;
}

/**
 * Split RIS text into individual entries.
 * Each entry starts with `TY  - ` and ends with `ER  - `.
 */
function splitRis(text: string): string[] {
  const entries: string[] = [];
  const lines = text.split('\n');
  let current: string[] = [];
  let inEntry = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^TY\s{2}-\s/.test(trimmed)) {
      // Start of a new entry
      current = [trimmed];
      inEntry = true;
    } else if (/^ER\s{2}-/.test(trimmed) && inEntry) {
      // End of entry
      current.push(trimmed);
      const entry = current.join('\n').trim();
      if (entry.length > 10) {
        entries.push(entry);
      }
      current = [];
      inEntry = false;
    } else if (inEntry) {
      current.push(trimmed);
    }
  }

  return entries;
}
