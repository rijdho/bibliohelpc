import { Hono } from 'hono';
import type { VerifyRequest, VerifyResponse } from '@bibliohelp/shared';
import type { Env } from '../bindings.js';
import { splitReferences } from '../parser/splitter.js';
import { parseReference } from '../parser/extractors.js';
import { verifyAll } from '../verification/engine.js';
import { detectDuplicates } from '../verification/duplicates.js';
import { generateSuggestions } from '../verification/suggestions.js';

export const verify = new Hono<{ Bindings: Env }>();

const VERIFY_TIMEOUT_MS = 60_000; // 60s max for entire verification

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

verify.post('/verify', async (c) => {
  const maxBodySize = parseInt(c.env.MAX_BODY_SIZE || '50000', 10);
  const maxReferences = parseInt(c.env.MAX_REFERENCES || '30', 10);

  // Body size check (measured in BYTES, not UTF-16 code units)
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > maxBodySize) {
    const maxKb = Math.round(maxBodySize / 1000);
    return c.json({ error: `The text is too large (max ${maxKb} KB)`, code: 'err.bodyTooLarge', params: { maxKb } }, 413);
  }

  let body: VerifyRequest;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ error: 'Invalid JSON', code: 'err.invalidJson' }, 400);
  }

  if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
    return c.json({ error: 'No text provided', code: 'err.noText' }, 400);
  }

  // Split into individual references
  const entries = splitReferences(body.text);
  if (entries.length === 0) {
    return c.json({ error: 'No references could be parsed from the input', code: 'err.noReferences' }, 400);
  }
  if (entries.length > maxReferences) {
    return c.json({ error: `Too many references (${entries.length}). Maximum ${maxReferences} per query.`, code: 'err.tooManyReferences', params: { count: entries.length, max: maxReferences } }, 400);
  }

  // Parse each entry
  const parsed = entries.map(parseReference);

  // Verify all (with global timeout)
  let results;
  try {
    results = await withTimeout(
      verifyAll(parsed, c.env),
      VERIFY_TIMEOUT_MS,
      'TIMEOUT',
    );
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === 'TIMEOUT';
    return c.json(
      isTimeout
        ? { error: 'Verification took too long. Try with fewer references.', code: 'err.timeout' }
        : { error: 'Verification failed.', code: 'err.verifyFailed' },
      504,
    );
  }

  // Strip internal fields (source) and add correction suggestions before sending to client
  const sanitizedResults = results.map(r => ({
    ...r,
    matches: r.matches.map(({ source, ...m }) => m) as VerifyResponse['results'][0]['matches'],
    suggestions: generateSuggestions(r.reference, r.matches[0], r.messageCode),
  }));

  const duplicates = detectDuplicates(sanitizedResults);

  const response: VerifyResponse = {
    results: sanitizedResults,
    totalReferences: sanitizedResults.length,
    verified: sanitizedResults.filter(r => r.status === 'verified').length,
    partial: sanitizedResults.filter(r => r.status === 'partial').length,
    notFound: sanitizedResults.filter(r => r.status === 'not_found').length,
    likelyFake: sanitizedResults.filter(r => r.status === 'likely_fake').length,
    duplicates,
  };

  return c.json(response);
});
