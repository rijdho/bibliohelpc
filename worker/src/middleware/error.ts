import type { Context, Next } from 'hono';

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (err: unknown) {
    const status = (err as { status?: number }).status || 500;
    // Log full error internally, return generic message to client
    console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err instanceof Error ? err.message : err);
    const clientMessage = status < 500 ? (err instanceof Error ? err.message : 'Bad request') : 'Error interno del servidor';
    return c.json({ error: clientMessage }, status as 500);
  }
}
