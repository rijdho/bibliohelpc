import type { VerificationResult, DuplicateGroup } from '@bibliohelp/shared';
import { similarity, normalizeText } from '@bibliohelp/shared';

const DUPLICATE_THRESHOLD = 0.80;

/**
 * Detect duplicate references by comparing titles pairwise.
 * Uses union-find to group transitive duplicates (A≈B and B≈C → {A,B,C}).
 * Returns groups of indices that appear to reference the same work.
 */
export function detectDuplicates(results: VerificationResult[]): DuplicateGroup[] {
  const n = results.length;
  if (n < 2) return [];

  // Union-Find data structure
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x: number, y: number): void {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return;
    if (rank[rx] < rank[ry]) {
      parent[rx] = ry;
    } else if (rank[rx] > rank[ry]) {
      parent[ry] = rx;
    } else {
      parent[ry] = rx;
      rank[rx]++;
    }
  }

  // Track best similarity for each pair that gets merged
  const pairSimilarities = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let maxSim = 0;

      // Compare parsed reference titles
      const titleA = results[i].reference.title;
      const titleB = results[j].reference.title;
      if (titleA && titleB) {
        maxSim = Math.max(maxSim, similarity(titleA, titleB));
      }

      // Also compare best match titles (handles case where user titles differ
      // but both match the same source)
      const matchA = results[i].matches[0];
      const matchB = results[j].matches[0];
      if (matchA && matchB) {
        maxSim = Math.max(maxSim, similarity(matchA.title, matchB.title));
      }

      // Require at least one author surname overlap to avoid false positives
      // from different books with similar domain-specific titles
      if (maxSim >= DUPLICATE_THRESHOLD && !authorsOverlap(results[i], results[j])) {
        continue;
      }

      if (maxSim >= DUPLICATE_THRESHOLD) {
        union(i, j);
        const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
        pairSimilarities.set(key, maxSim);
      }
    }
  }

  // Collect groups
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // Build result: only groups with 2+ members
  const duplicateGroups: DuplicateGroup[] = [];

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;

    // Find the minimum similarity among all pairs in the group
    let minSim = 1;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const key = `${Math.min(indices[a], indices[b])}-${Math.max(indices[a], indices[b])}`;
        const sim = pairSimilarities.get(key);
        if (sim !== undefined) {
          minSim = Math.min(minSim, sim);
        }
      }
    }

    // Representative title: prefer the longest parsed title in the group
    const title = indices
      .map(i => results[i].reference.title)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || 'Sin título';

    duplicateGroups.push({
      indices,
      title,
      similarity: Math.round(minSim * 100) / 100,
    });
  }

  // Sort by first index in each group
  duplicateGroups.sort((a, b) => a.indices[0] - b.indices[0]);

  return duplicateGroups;
}

/**
 * Extract author surnames from a result (parsed ref + best match).
 */
function getSurnames(result: VerificationResult): Set<string> {
  const surnames = new Set<string>();
  const allAuthors = [
    ...result.reference.authors,
    ...(result.matches[0]?.authors ?? []),
  ];
  for (const author of allAuthors) {
    // Extract surname: longest word (handles "Arya, J.", "J. Lardner", "Haeussler E.")
    const words = normalizeText(author).split(/\s+/).filter(w => w.length > 2);
    const surname = words.reduce((a, b) => a.length >= b.length ? a : b, '');
    if (surname) surnames.add(surname);
  }
  return surnames;
}

/**
 * Check if two results share at least one author surname.
 * If either has no authors, skip the check (allow duplicate detection).
 */
function authorsOverlap(a: VerificationResult, b: VerificationResult): boolean {
  const surnamesA = getSurnames(a);
  const surnamesB = getSurnames(b);
  // If either has no known authors, can't disprove — allow
  if (surnamesA.size === 0 || surnamesB.size === 0) return true;
  for (const s of surnamesA) {
    if (surnamesB.has(s)) return true;
  }
  return false;
}
