import type { VerificationStatus, VerificationMatch } from '@bibliohelp/shared';

export interface ScoreResult {
  status: VerificationStatus;
  score: number;
  message: string;
}

/**
 * Determine verification status based on matches and how they were found.
 */
export function scoreMatches(
  matches: VerificationMatch[],
  hadDoi: boolean,
  hadIsbn: boolean,
): ScoreResult {
  if (matches.length === 0) {
    return {
      status: 'not_found',
      score: 0,
      message: hadDoi || hadIsbn
        ? 'Identifier provided but no matching record found in any database.'
        : 'No matching record found in any academic database. This reference may be fabricated.',
    };
  }

  const best = matches.reduce((a, b) => a.similarity > b.similarity ? a : b);

  // Direct identifier match (DOI or ISBN)
  if ((hadDoi && best.doi) || (hadIsbn && best.isbn)) {
    return {
      status: 'verified',
      score: 100,
      message: `Verificado via ${hadDoi ? 'DOI' : 'ISBN'}.`,
    };
  }

  // Fuzzy title/author match
  if (best.similarity >= 0.90) {
    return {
      status: 'verified',
      score: 95,
      message: `Coincidencia de alta confianza (similitud: ${(best.similarity * 100).toFixed(0)}%).`,
    };
  }

  if (best.similarity >= 0.75) {
    return {
      status: 'partial',
      score: 70,
      message: `Posible coincidencia (similitud: ${(best.similarity * 100).toFixed(0)}%). El titulo o autor puede diferir ligeramente.`,
    };
  }

  if (best.similarity >= 0.50) {
    return {
      status: 'partial',
      score: 40,
      message: `Coincidencia debil (similitud: ${(best.similarity * 100).toFixed(0)}%). Verificar manualmente.`,
    };
  }

  return {
    status: 'not_found',
    score: 10,
    message: `Solo se encontraron resultados con muy baja similitud. Esta referencia puede contener errores significativos.`,
  };
}
