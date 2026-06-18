import type { VerificationMatch } from '@bibliohelp/shared';
import { similarity } from '@bibliohelp/shared';
import type { Env } from '../bindings.js';

interface D1Row {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  journal: string | null;
  publisher: string | null;
  source: string;
  verified: number;
  raw: string;
  created_at: string;
}

async function generateId(title: string, authors: string): Promise<string> {
  const data = new TextEncoder().encode(title + '||' + authors);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 20);
}

async function generateEmbedding(env: Env, text: string): Promise<number[]> {
  const truncated = text.slice(0, 500);
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [truncated],
  });
  return (result as any).data[0];
}

/**
 * Search for a reference in D1 + Vectorize cache.
 */
// Cosine-similarity cutoff for the semantic cache. Vectorize returns matches
// sorted by score desc; anything below this is semantically unrelated and is
// dropped so the cache doesn't surface irrelevant rows.
const MIN_VECTOR_SCORE = 0.70;

export async function searchCache(env: Env, title: string, author?: string): Promise<VerificationMatch[]> {
  try {
    const query = author ? `${title} ${author}` : title;
    const embedding = await generateEmbedding(env, query);

    const vectorResults = await env.VECTORIZE.query(embedding, {
      topK: 5,
      returnMetadata: 'none',
    });

    // Filter by the vector score (relevance), not lexical similarity.
    const scored = (vectorResults.matches ?? []).filter(m => (m.score ?? 0) >= MIN_VECTOR_SCORE);
    if (scored.length === 0) return [];

    // Preserve Vectorize relevance ordering when we re-hydrate from D1.
    const vectorOrder = new Map(scored.map((m, i) => [m.id, i]));
    const ids = scored.map(m => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT * FROM [references] WHERE id IN (${placeholders})`
    ).bind(...ids).all<D1Row>();

    if (!results || results.length === 0) return [];

    results.sort((a, b) => (vectorOrder.get(a.id) ?? 99) - (vectorOrder.get(b.id) ?? 99));

    return results.map(doc => ({
      title: doc.title,
      authors: doc.authors ? doc.authors.split(', ') : [],
      year: doc.year,
      doi: doc.doi,
      isbn: doc.isbn,
      journal: doc.journal,
      publisher: doc.publisher,
      source: 'd1cache' as const,
      similarity: similarity(title, doc.title),
      url: doc.doi ? `https://doi.org/${doc.doi}` : null,
    }));
  } catch (err) {
    console.warn('[Cache] Search failed:', (err as Error).message);
    return [];
  }
}

/**
 * Index a verified reference into D1 + Vectorize for caching.
 */
export async function indexReference(env: Env, match: VerificationMatch, raw: string): Promise<void> {
  const authors = match.authors.join(', ');
  const id = await generateId(match.title, authors);

  try {
    // Generate the embedding FIRST. If it fails, skip the whole cache write so
    // we never leave a D1 row that Vectorize cannot surface (non-atomic drift).
    const embedding = await generateEmbedding(env, `${match.title} ${authors}`);

    // Insert into D1
    await env.DB.prepare(
      `INSERT OR REPLACE INTO [references] (id, title, authors, year, doi, isbn, journal, publisher, source, verified, raw, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      id,
      match.title,
      authors,
      match.year,
      match.doi,
      match.isbn,
      match.journal,
      match.publisher,
      match.source,
      raw,
      new Date().toISOString(),
    ).run();

    // Upsert the vector (embedding already computed above)
    await env.VECTORIZE.upsert([{
      id,
      values: embedding,
    }]);
  } catch (err) {
    console.warn('[Cache] Failed to index reference:', (err as Error).message);
  }
}
