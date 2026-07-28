import type { VerificationStatus, VerificationMatch } from '@bibliohelp/shared';

export interface ScoreResult {
  status: VerificationStatus;
  score: number;
  /** English fallback message. */
  message: string;
  /** i18n key for localized rendering on the client. */
  messageCode: string;
  /** Interpolation params for the localized message. */
  messageParams?: Record<string, string | number>;
}

/**
 * True when the two years don't contradict each other. ±1 tolerates
 * online-first vs print dates; missing years can't disprove anything.
 */
export function yearsCompatible(refYear: number | null, matchYear: number | null): boolean {
  if (!refYear || !matchYear) return true;
  return Math.abs(refYear - matchYear) <= 1;
}

/**
 * Score a reference whose DOI/ISBN resolves to a clearly different work (both the
 * title AND the authors differ from the resolved record). This catches wrong/stolen
 * DOIs and fabricated citations that borrow a real identifier, which would otherwise
 * be marked "100% verified" purely because the identifier resolves.
 */
export function scoreIdentifierMismatch(kind: 'doi' | 'isbn', matchedTitle: string): ScoreResult {
  const identifier = kind.toUpperCase();
  return {
    // Flagged as likely_fake (distinct red badge) rather than partial: a citation
    // whose identifier points to an unrelated work is a strong fabrication signal.
    status: 'likely_fake',
    score: 25,
    message: `The ${identifier} resolves to a different work: "${matchedTitle}". Check the reference — it may be incorrect or fabricated.`,
    messageCode: 'msg.identifierMismatch',
    messageParams: { identifier, matchedTitle },
  };
}

/**
 * Determine verification status based on matches and how they were found.
 */
export function scoreMatches(
  matches: VerificationMatch[],
  // Non-null ONLY when the match was actually retrieved via the reference's own
  // DOI/ISBN (provenance from engine), not merely because a match carries some
  // identifier. Prevents title-search matches with an incidental DOI from being
  // marked 100% verified.
  identifierMatched: 'doi' | 'isbn' | null,
  hadIdentifier: boolean,
  // Year from the reference being verified; a high-similarity title whose year
  // contradicts it is NOT auto-verified (re-registered copies, wrong editions).
  refYear: number | null = null,
): ScoreResult {
  if (matches.length === 0) {
    return {
      status: 'not_found',
      score: 0,
      message: hadIdentifier
        ? 'Identifier provided but no matching record found in any database.'
        : 'No matching record found in any academic database. This reference may be fabricated.',
      messageCode: hadIdentifier ? 'msg.identifierNoMatch' : 'msg.noMatchFabricated',
    };
  }

  const best = matches.reduce((a, b) => a.similarity > b.similarity ? a : b);

  // Direct identifier match — only when retrieved via the reference's DOI/ISBN
  if (identifierMatched) {
    const identifier = identifierMatched.toUpperCase();
    return {
      status: 'verified',
      score: 100,
      message: `Verified via ${identifier}.`,
      messageCode: 'msg.verifiedVia',
      messageParams: { identifier },
    };
  }

  const similarity = Number((best.similarity * 100).toFixed(0));

  // Fuzzy title/author match
  if (best.similarity >= 0.90) {
    // The title matches but the year contradicts the reference: this record may
    // be a re-registered copy or a different edition — do not auto-verify.
    if (!yearsCompatible(refYear, best.year)) {
      return {
        status: 'partial',
        score: 60,
        message: `The title matches (similarity: ${similarity}%), but the source is dated ${best.year}, not ${refYear}. It may be a different edition or a re-registered copy — verify manually.`,
        messageCode: 'msg.yearConflict',
        messageParams: { similarity, matchYear: best.year ?? '', refYear: refYear ?? '' },
      };
    }
    return {
      status: 'verified',
      score: 95,
      message: `High-confidence match (similarity: ${similarity}%).`,
      messageCode: 'msg.highConfidence',
      messageParams: { similarity },
    };
  }

  if (best.similarity >= 0.75) {
    return {
      status: 'partial',
      score: 70,
      message: `Possible match (similarity: ${similarity}%). The title or author may differ slightly.`,
      messageCode: 'msg.possibleMatch',
      messageParams: { similarity },
    };
  }

  if (best.similarity >= 0.50) {
    return {
      status: 'partial',
      score: 40,
      message: `Weak match (similarity: ${similarity}%). Verify manually.`,
      messageCode: 'msg.weakMatch',
      messageParams: { similarity },
    };
  }

  return {
    status: 'not_found',
    score: 10,
    message: `Only very low-similarity results were found. This reference may contain significant errors.`,
    messageCode: 'msg.veryLowSimilarity',
  };
}
