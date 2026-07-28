import type { FieldSuggestion, ParsedReference, VerificationMatch } from '@bibliohelp/shared';

/**
 * Compare parsed reference fields against best match to generate correction suggestions.
 */
export function generateSuggestions(
  ref: ParsedReference,
  bestMatch: VerificationMatch | undefined,
  // messageCode of the verification result: when the record itself is suspect
  // (year conflict → possible re-registered copy), don't advise adopting its
  // year or DOI — that would push the user's correct data toward the bad record.
  resultMessageCode?: string,
): FieldSuggestion[] {
  if (!bestMatch || bestMatch.similarity < 0.60) return [];
  if (resultMessageCode === 'msg.yearConflict' || resultMessageCode === 'msg.identifierMismatch') return [];

  const suggestions: FieldSuggestion[] = [];

  // Year mismatch
  if (ref.year && bestMatch.year && ref.year !== bestMatch.year) {
    suggestions.push({
      field: 'year',
      userValue: String(ref.year),
      suggestedValue: String(bestMatch.year),
      message: `The year in your reference is ${ref.year}, but the source indicates ${bestMatch.year}`,
      messageCode: 'sug.year',
      messageParams: { userValue: ref.year, suggestedValue: bestMatch.year },
    });
  }

  // DOI: user doesn't have one but match does
  if (!ref.doi && bestMatch.doi) {
    suggestions.push({
      field: 'doi',
      userValue: '',
      suggestedValue: bestMatch.doi,
      message: `A DOI was found for this reference: ${bestMatch.doi}`,
      messageCode: 'sug.doiFound',
      messageParams: { suggestedValue: bestMatch.doi },
    });
  }

  // DOI mismatch (user has different DOI)
  if (ref.doi && bestMatch.doi && ref.doi !== bestMatch.doi) {
    suggestions.push({
      field: 'doi',
      userValue: ref.doi,
      suggestedValue: bestMatch.doi,
      message: `The DOI in your reference (${ref.doi}) differs from the one found (${bestMatch.doi})`,
      messageCode: 'sug.doiMismatch',
      messageParams: { userValue: ref.doi, suggestedValue: bestMatch.doi },
    });
  }

  // Title: significant difference (check if user title has typos/truncation)
  // Only suggest if match similarity is good but titles differ noticeably
  if (bestMatch.similarity >= 0.75 && bestMatch.similarity < 0.98) {
    const userTitle = ref.title.toLowerCase().trim();
    const matchTitle = bestMatch.title.toLowerCase().trim();
    if (userTitle !== matchTitle && matchTitle.length > 10) {
      // Check if it's a meaningful difference (not just punctuation)
      const userWords = userTitle.split(/\s+/).filter(w => w.length > 2);
      const matchWords = matchTitle.split(/\s+/).filter(w => w.length > 2);
      const missingWords = matchWords.filter(w => !userWords.includes(w));
      if (missingWords.length >= 2 || (userWords.length > 0 && missingWords.length / matchWords.length > 0.2)) {
        suggestions.push({
          field: 'title',
          userValue: ref.title,
          suggestedValue: bestMatch.title,
          message: 'The title found differs from the one entered',
          messageCode: 'sug.titleDiffers',
        });
      }
    }
  }

  return suggestions;
}
