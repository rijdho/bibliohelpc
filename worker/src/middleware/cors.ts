import { cors } from 'hono/cors';
import type { Env } from '../bindings.js';

export const corsMiddleware = cors({
  origin: (origin, c) => {
    const env = (c as any).env as Env;
    const allowed: string[] = [];
    if (env.APP_DOMAIN) {
      allowed.push(`https://${env.APP_DOMAIN}`);
    }
    // The app is also served from GitHub Pages (rijdho.github.io/bibliohelpc/app),
    // whose Origin is just the host — allow it so that deployment can call the API.
    allowed.push('https://rijdho.github.io');
    // Allow server-to-server (no origin)
    if (!origin) return allowed[0] || '';
    if (allowed.includes(origin)) return origin;
    // Allow Cloudflare Pages preview/production domains
    const pagesDomain = env.PAGES_DOMAIN || 'bibliohelpc.pages.dev';
    if (origin === `https://${pagesDomain}` || origin.endsWith(`.${pagesDomain}`)) return origin;
    // Allow localhost during development
    if (origin.startsWith('http://localhost:')) return origin;
    return '';  // Reject non-whitelisted origins
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
});
