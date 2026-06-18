import { Hono } from 'hono';
import type { Env } from './bindings.js';
import { corsMiddleware } from './middleware/cors.js';
import { loggerMiddleware } from './middleware/logger.js';
import { errorMiddleware } from './middleware/error.js';
import { health } from './routes/health.js';
import { verify } from './routes/verify.js';
import { manifest } from './routes/manifest.js';
import { oai } from './routes/oai.js';

const app = new Hono<{ Bindings: Env }>().basePath('/api');

// Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  const cspConnect = c.env.APP_DOMAIN
    ? `'self' https://${c.env.APP_DOMAIN}`
    : "'self'";
  c.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://appsforoffice.microsoft.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    `connect-src ${cspConnect}`,
    "frame-ancestors 'self' https://*.officeapps.live.com https://*.office.com",
  ].join('; '));
  c.res.headers.delete('X-Powered-By');
});

// Middleware
app.use('*', corsMiddleware);
app.use('*', loggerMiddleware);
app.use('*', errorMiddleware);

// Routes
app.route('/', health);
app.route('/', verify);
app.route('/', manifest);
app.route('/', oai);

export default app;
