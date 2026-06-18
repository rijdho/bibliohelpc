/**
 * Normalize a DOI string: lowercase, strip URL prefixes.
 */
export function normalizeDoi(raw: string): string | null {
  if (!raw) return null;
  let doi = raw.trim().toLowerCase();
  // Strip common URL prefixes
  doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  doi = doi.replace(/^doi:\s*/i, '');
  // DOI pattern: 10.xxxx/...
  const match = doi.match(/(10\.\d{4,}\/\S+)/);
  return match ? match[1] : null;
}

/**
 * Normalize an ISBN: strip hyphens and spaces, validate length.
 */
export function normalizeIsbn(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[-\s]/g, '');
  if (cleaned.length === 10 || cleaned.length === 13) {
    return cleaned;
  }
  return null;
}

/**
 * Normalize text for comparison: lowercase, remove accents, collapse whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Light stemming for Spanish/English words.
 * Strips common suffixes to normalize singular/plural and gender variations.
 * e.g., "matematicas" → "matematic", "aplicadas" → "aplicad"
 */
function stem(word: string): string {
  // Minimum word length to stem
  if (word.length <= 4) return word;

  // Spanish: remove plural/gender suffixes
  let w = word;
  // -iones → -ion (naciones → nacion)
  if (w.endsWith('iones')) w = w.slice(0, -2);
  // -ción → -c  (no, keep more)
  // -eses → -es (ingleses → ingles)
  else if (w.endsWith('eses')) w = w.slice(0, -2);
  // -as, -os, -es plurals
  else if (w.length > 5 && /(?:as|os|es)$/.test(w)) w = w.slice(0, -1);

  // -a/-o gender (aplicada → aplicad, aplicado → aplicad)
  if (w.length > 5 && /[^aeiou][ao]$/.test(w)) w = w.slice(0, -1);

  return w;
}

/**
 * String similarity using word overlap with light stemming.
 * Combines Jaccard index with coverage of the shorter title,
 * so a title that is a subset of another scores high.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;

  // Stopwords common in academic titles (Spanish + English)
  const stops = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'un', 'una', 'y', 'a', 'e', 'o', 'al', 'por', 'con', 'para', 'que', 'se', 'su', 'no', 'es', 'the', 'of', 'and', 'in', 'for', 'to', 'on', 'an', 'is', 'at', 'by', 'or', 'as', 'its']);

  const tokenize = (s: string): string[] => {
    return s.split(/\s+/).filter(w => w.length > 1 && !stops.has(w));
  };

  const aRaw = tokenize(na);
  const bRaw = tokenize(nb);
  if (aRaw.length === 0 || bRaw.length === 0) return 0;

  // Create stemmed sets for fuzzy matching
  const aStemmed = new Set(aRaw.map(stem));
  const bStemmed = new Set(bRaw.map(stem));
  const aWords = new Set(aRaw);
  const bWords = new Set(bRaw);

  // Count matches: exact match first, then stemmed match
  let intersection = 0;
  const bMatched = new Set<string>();

  for (const w of aWords) {
    if (bWords.has(w)) {
      intersection++;
      bMatched.add(w);
    } else if (bStemmed.has(stem(w))) {
      // Stemmed match counts as 0.9 of a full match
      intersection += 0.9;
      // Mark one bWord as matched
      for (const bw of bWords) {
        if (!bMatched.has(bw) && stem(bw) === stem(w)) {
          bMatched.add(bw);
          break;
        }
      }
    }
  }

  // Jaccard: penalizes extra words in either title
  const union = aWords.size + bWords.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // Coverage: how much of the smaller set is covered
  const minSize = Math.min(aWords.size, bWords.size);
  const coverage = minSize > 0 ? intersection / minSize : 0;

  // Blend: 40% Jaccard + 60% coverage
  return 0.4 * jaccard + 0.6 * coverage;
}
