# BiblioHelp

## Project Overview

Cloudflare-native web tool + Word add-in to verify academic bibliographic references against multiple scholarly APIs, with D1+Vectorize for semantic caching. Includes citation formatting (APA/MLA/Chicago/Vancouver) for verified references.

Replaces the original Docker version (Docker + MeiliSearch + Cloudflare Tunnel). The Docker infrastructure and tunnels have been decommissioned.

## Stack

- **Frontend**: SvelteKit 5 + Tailwind v4 → Cloudflare Pages
- **Backend**: Hono + TypeScript → Cloudflare Worker
- **Cache**: D1 (SQLite metadata) + Vectorize (semantic search) + Workers AI (embeddings)
- **APIs**: CrossRef, OpenAlex, Open Library, OpenAIRE, Internet Archive, ISBNdb
- **Rate Limiting**: an edge Cloudflare Rate Limiting (WAF) rule on `POST /api/verify` — recommended 10 req/min/IP — is the intended throttle for a public deployment. No code-level rate limiting (Workers are stateless). The rule lives in the Cloudflare dashboard, not the repo; see `_ref/cloudflare-infra.md` for the exact spec and how to verify/create it. Size caps (50 KB body, 30 refs) ARE in code.
- **Design**: "violet" house style, shared with the landing page and with the sibling repos fair-repo-audit / coara-action-planner. Violet primary (#6d4aff), **self-hosted Inter** via `@fontsource-variable/inter` (NO external CDN — a Google Fonts `<link>` is blocked by the CSP `font-src 'self'` and would also break the privacy promise), three-verdict data palette (verified #1f9670 / partial #c08519 / likely-fake #c0463d). Light theme. Tokens live in `frontend/src/app.css` `@theme`.

## Domains

| Service | URL | Platform |
|---------|-----|----------|
| Frontend | `https://bibliohelp.rijdho.org` | Cloudflare Pages (custom domain) |
| Frontend (alt) | `https://bibliohelpc.pages.dev` | Cloudflare Pages (default) |
| Worker API | `https://api.bibliohelp.rijdho.org` | Cloudflare Worker (custom domain; workers.dev route disabled) |
| Landing | `https://rijdho.github.io/bibliohelpc/` | GitHub Pages (from `docs/`) |
| Frontend (GitHub mirror) | `https://rijdho.github.io/bibliohelpc/app/` | GitHub Pages (`docs/app/`), same Worker backend |

The frontend at `bibliohelp.rijdho.org` is a CNAME to `bibliohelpc.pages.dev`, configured as a custom domain in Cloudflare Pages. The GitHub Pages copies are a second, independent deployment of the *same* SvelteKit app (see "GitHub Pages" below); both hit the same Cloudflare Worker API.

## Workspace Structure

```
bibliohelpc/
├── package.json                     # Workspace root
├── tsconfig.base.json
├── .gitignore
├── CLAUDE.md
├── packages/shared/                 # Types + utils + citation formatter (@bibliohelp/shared)
├── worker/                          # Cloudflare Worker (Hono API)
│   ├── wrangler.toml                # Bindings: D1, Vectorize, AI
│   ├── migrations/                  # D1 SQL migrations
│   └── src/
│       ├── index.ts                 # export default app (Worker entry)
│       ├── bindings.ts              # interface Env
│       ├── cache/repository.ts      # D1 + Vectorize + Workers AI
│       ├── middleware/              # cors, error, logger
│       ├── routes/                  # health, verify, manifest, oai
│       ├── parser/                  # splitter, formats, extractors
│       ├── sources/                 # crossref, openalex, openLibrary, openaire, internetArchive, isbndb
│       ├── utils/                   # apiUtils, retry
│       └── verification/            # engine, scoring, duplicates, suggestions
├── frontend/                        # SvelteKit → Cloudflare Pages
│   ├── svelte.config.js             # adapter-static
│   ├── vite.config.ts               # No /api proxy (separate domain)
│   ├── static/_headers              # CSP + security headers for Pages
│   ├── static/robots.txt            # Block all crawlers/bots/AI scrapers
│   └── src/
└── word-addin/
    └── manifest.xml                 # Domain → bibliohelp.rijdho.org
```

## Commands

```bash
# Development
npm run dev:worker          # wrangler dev (Worker on localhost:8787)
npm run dev:frontend        # Vite dev server
npm run dev                 # Both in parallel

# Deploy Worker
cd worker && npx wrangler deploy

# Deploy Frontend to Cloudflare Pages (custom-domain build, base = '')
cd frontend \
  && VITE_APP_NAME=BiblioHelp \
     VITE_API_URL=https://api.bibliohelp.rijdho.org \
     VITE_FOOTER_HTML='by <a href="https://life.rijdho.org" target="_blank">@rijdho</a>' \
     npm run build \
  && npx wrangler pages deploy build --project-name=bibliohelpc --commit-dirty=true

# Deploy Frontend to GitHub Pages (sub-path build → docs/app; auto-deploys on push)
cd frontend \
  && BASE_PATH=/bibliohelpc/app \
     VITE_APP_NAME=BiblioHelp VITE_API_URL=https://api.bibliohelp.rijdho.org \
     VITE_FOOTER_HTML='by <a href="https://life.rijdho.org" target="_blank">@rijdho</a>' \
     npm run build \
  && rm -rf ../docs/app && cp -r build ../docs/app && cp ../docs/app/index.html ../docs/app/404.html
# then: git add docs && git commit && git push  → the pages.yml workflow deploys
```

## GitHub Pages (landing + app mirror)

`docs/` is published to `https://rijdho.github.io/bibliohelpc/` by **GitHub Actions**
(`.github/workflows/pages.yml`), NOT the legacy Jekyll builder — Jekyll strips
SvelteKit's underscore-prefixed `_app/` directory and 404s the whole app.

- `docs/index.html` + `docs/style.css` + `docs/fonts/` — the standalone landing
  (violet house style, ES/EN/DE). Self-hosted Inter under `docs/fonts/`.
- `docs/app/` — the SvelteKit app built with `BASE_PATH=/bibliohelpc/app`
  (SvelteKit `paths.base`, wired via the `BASE_PATH` env in `svelte.config.js`;
  empty for the Cloudflare build). Uses `{base}` for internal links.
- The app calls the same `api.bibliohelp.rijdho.org` Worker. The Worker CORS
  allowlist (`worker/src/middleware/cors.ts`) therefore includes
  `https://rijdho.github.io`.
- Assets are content-hashed, so after redeploying, hard-reload / cache-bust when
  verifying in a browser — a stale CSS/JS bundle will otherwise look unchanged.

## Architecture

### Key differences from BiblioHelp (Docker version)

- No Docker, no MeiliSearch, no `@hono/node-server`, no `dotenv`, no Cloudflare Tunnel
- Worker uses `export default app` instead of `serve()`
- Config via `c.env` bindings instead of `config` singleton
- Cache: D1 + Vectorize + Workers AI instead of MeiliSearch
- Rate limiting: Cloudflare WAF instead of in-code middleware
- `crypto.subtle.digest()` instead of `crypto.createHash()`
- `btoa()`/`atob()` instead of `Buffer.from().toString('base64url')`
- manifest.xml embedded as template string instead of `fs.readFileSync()`
- Frontend fetches `${apiUrl}/api/verify` instead of `/api/verify`

### Verification Pipeline

Same as BiblioHelp: cache check → DOI → ISBN → title search → OpenAlex fallback → author boost → dedup → cache result.

### Source Adapters

Same APIs, but functions receive explicit parameters (mailto, apiKey) instead of reading from config singleton.

## Security

### CORS (`worker/src/middleware/cors.ts`)

- Whitelisted origins: `https://{APP_DOMAIN}` (from env), `*.{PAGES_DOMAIN}` (from env, default `bibliohelpc.pages.dev`), `localhost:*`
- Server-to-server (no origin): returns `APP_DOMAIN` origin or empty string (never `*`)
- Non-whitelisted origins: rejected (empty string)

### Security Headers

**Frontend** (`frontend/static/_headers`) — applied by Cloudflare Pages:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`
- `Content-Security-Policy`: restricts scripts, styles, connections, frame ancestors (Word add-in compatible)

**Worker** (`worker/src/index.ts`) — same headers **except `X-Frame-Options`**
(CSP `frame-ancestors` is the single source of truth for framing, so Word/Office
origins can embed the API), plus:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Powered-By` header removed

### Anti-bot / Anti-scraping

- `robots.txt`: blocks all crawlers including GPTBot, ChatGPT-User, Google-Extended, CCBot, anthropic-ai, Claude-Web, cohere-ai, Bytespider, FacebookBot
- `X-Robots-Tag` header on both frontend and worker API: `noindex, nofollow, noarchive, nosnippet`

### XSS Prevention

- Citation rendering (`CitationBlock.svelte`, `TaskpaneCitationBlock.svelte`): HTML-escapes all API data before converting `_italic_` markers to `<em>`/`<i>` tags via `escapeHtml()`
- URL links in matches (`ResultsTable.svelte`, `taskpane/+page.svelte`): validated with `isSafeUrl()` — only `http:`/`https:` protocols allowed

### Embedding Cost Control

- `generateEmbedding()` in `worker/src/cache/repository.ts` truncates input to 500 chars before sending to Workers AI

### Other

- Body size limit: 50 KB max
- Max references: 30 per request
- Input validation: JSON parse with try/catch, type checks
- Response sanitization: `source` field stripped from matches
- Fetch timeouts: 15s per external API, 60s per verification request
- API keys: `ISBNDB_API_KEY` server-side only (optional)
- Frontend isolation: only `VITE_*` vars reach the browser

## Conventions

- ESM everywhere (type: "module")
- Svelte 5 runes ($state, $derived, $effect)
- Shared types imported from @bibliohelp/shared
- Worker bindings typed via `Env` interface in `bindings.ts`
- Minimal border radius (rounded, not rounded-xl)

## Environment Variables

### Worker (wrangler.toml `[vars]`)

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_NAME` | Yes | Display name (e.g. "BiblioHelp") |
| `APP_DOMAIN` | Yes | Custom domain for CORS + OAI-PMH (e.g. "bibliohelp.rijdho.org") |
| `API_MAILTO` | Yes | Contact email for OpenAlex polite pool |
| `MAX_BODY_SIZE` | Yes | Max request body in bytes (e.g. "50000") |
| `MAX_REFERENCES` | Yes | Max references per request (e.g. "30") |
| `PAGES_DOMAIN` | No | Pages domain for CORS (default: "bibliohelpc.pages.dev") |
| `ISBNDB_API_KEY` | No | ISBNdb API key (Cloudflare secret, not in wrangler.toml) |

### Frontend (build-time `VITE_*`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_APP_NAME` | No | App name (default: "BiblioHelp") |
| `VITE_API_URL` | Yes | Worker API URL (e.g. "https://api.bibliohelp.rijdho.org") |
| `VITE_FOOTER_HTML` | No | Footer HTML content (e.g. `by <a href="...">@rijdho</a>`) |
