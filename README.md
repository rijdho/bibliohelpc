# BiblioHelp

Herramienta web + add-in de Word para verificar referencias bibliográficas académicas contra múltiples APIs académicas, con formateo de citas (APA/MLA/Chicago/Vancouver).

Versión Cloudflare-native que reemplaza al BiblioHelp original (Docker + MeiliSearch + Cloudflare Tunnel).

## Demo

**https://bibliohelp.rijdho.org**

## Stack

| Componente | Tecnología | Plataforma |
|------------|------------|------------|
| Frontend | SvelteKit 5 + Tailwind v4 | Cloudflare Pages |
| Backend | Hono + TypeScript | Cloudflare Worker |
| Cache | D1 + Vectorize + Workers AI | Cloudflare |
| APIs | CrossRef, OpenAlex, Open Library, OpenAIRE, Internet Archive, ISBNdb | Externos |

## Qué hace

1. Recibe texto con referencias bibliográficas (pegar desde Word, PDF, etc.)
2. Detecta y separa referencias individuales (APA, MLA, Chicago, Vancouver, BibTeX, RIS, informal)
3. Busca cada referencia en 6 APIs académicas
4. Calcula similitud y asigna status: verificada, parcial, no encontrada
5. Detecta duplicados y sugiere correcciones
6. Genera citas formateadas en APA/MLA/Chicago/Vancouver
7. Exporta en BibTeX y RIS

## Desarrollo

```bash
npm install
npm run dev              # Worker + Frontend en paralelo
```

Worker en `http://localhost:8787`, Frontend en `http://localhost:5173`.

## Deploy

```bash
# Worker
cd worker && npx wrangler deploy

# Frontend
cd frontend \
  && VITE_APP_NAME=BiblioHelp \
     VITE_API_URL=https://api.bibliohelp.rijdho.org \
     VITE_FOOTER_HTML='by <a href="https://life.rijdho.org" target="_blank">@rijdho</a> + <a href="https://www.linkedin.com/in/claudio-henr%C3%ADquez-d%C3%ADaz-810aa168/" target="_blank">@claudio</a>' \
     npm run build \
  && npx wrangler pages deploy build --project-name=bibliohelpc --commit-dirty=true
```

## Variables de entorno

### Worker (`wrangler.toml`)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `APP_NAME` | Sí | Nombre de la app |
| `APP_DOMAIN` | Sí | Dominio custom para CORS y OAI-PMH |
| `API_MAILTO` | Sí | Email para OpenAlex polite pool |
| `MAX_BODY_SIZE` | Sí | Tamaño máximo de request en bytes |
| `MAX_REFERENCES` | Sí | Máximo de referencias por request |
| `PAGES_DOMAIN` | No | Dominio Pages para CORS (default: `bibliohelpc.pages.dev`) |
| `ISBNDB_API_KEY` | No | API key de ISBNdb (secret de Cloudflare) |

### Frontend (build-time)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `VITE_APP_NAME` | No | Nombre de la app (default: "BiblioHelp") |
| `VITE_API_URL` | Sí | URL del Worker API |
| `VITE_FOOTER_HTML` | No | HTML del pie de página |

## Infraestructura Cloudflare

| Recurso | Nombre/ID |
|---------|-----------|
| Worker | `bibliohelpc-worker` |
| Pages | `bibliohelpc` |
| D1 Database | `bibliohelpc-references` (`422b4459-88dc-4cf5-a6fa-443aa046fed8`) |
| Vectorize Index | `bibliohelpc-embeddings` |
| Custom domain | `bibliohelp.rijdho.org` → `bibliohelpc.pages.dev` (CNAME) |

## Seguridad

- **CORS**: whitelist de orígenes (`APP_DOMAIN`, `PAGES_DOMAIN`, `localhost`)
- **CSP**: headers en `frontend/static/_headers` (script-src, connect-src, frame-ancestors para Word add-in)
- **XSS**: escape HTML en citas renderizadas con `{@html}`, validación de protocolo en URLs de matches
- **Anti-bot**: `robots.txt` bloquea todos los crawlers (GPTBot, ChatGPT, Claude, Google-Extended, CCBot, etc.) + `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` en frontend y worker
- **Rate limiting**: Cloudflare WAF (Workers son stateless, no se puede hacer en código)
- **Embedding cost control**: texto truncado a 500 chars antes de Workers AI
- **Sin source maps**: no se generan en el build
- **Sin leaks**: nombres de fuentes internas solo en el Worker, `source` stripeado de respuestas, `X-Powered-By` removido

## Word Add-in

El manifiesto se sirve desde `/api/manifest` en el Worker. Incluye:
- Botón en ribbon (Tab Home)
- Panel lateral (~350px) para verificar texto seleccionado
- Inserción de citas formateadas con italics en el documento

## Migración desde BiblioHelp (Docker)

Este proyecto reemplaza completamente al BiblioHelp original:

| | BiblioHelp (Docker) | BiblioHelp (actual) |
|---|---|---|
| Backend | Node.js + Hono en Docker | Cloudflare Worker |
| Frontend | SvelteKit + nginx en Docker | Cloudflare Pages |
| Cache | MeiliSearch (fuzzy search) | D1 + Vectorize (semantic search) |
| Tunnel | Cloudflare Tunnel `bibliohelp-rijdho` | No necesario (Pages nativo) |
| Dominio | `bibliohelp.rijdho.org` via tunnel | `bibliohelp.rijdho.org` via Pages CNAME |

Los tunnels `bibliohelp-rijdho` y `bibliohelp-eilein` fueron eliminados. Los containers Docker, imágenes y volúmenes del proyecto original fueron removidos.
