import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../bindings.js';

const PAGE_SIZE = 100;
const SOURCES = ['crossref', 'openalex', 'openlibrary', 'openaire', 'internetarchive', 'isbndb'];

// ─── XML helpers ──────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getBaseUrl(c: Context): string {
  const proto = c.req.header('x-forwarded-proto') || 'https';
  const env = (c as any).env as Env;
  const host = c.req.header('host') || env.APP_DOMAIN || 'localhost';
  return `${proto}://${host}/api/oai`;
}

function responseDate(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function envelope(baseUrl: string, verb: string, attrs: Record<string, string>, body: string): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">
  <responseDate>${responseDate()}</responseDate>
  <request${verb ? ` verb="${esc(verb)}"` : ''}${attrStr}>${esc(baseUrl)}</request>
${body}
</OAI-PMH>`;
}

function errXml(baseUrl: string, verb: string, code: string, msg: string): string {
  const v = (code === 'badVerb' || code === 'badArgument') ? '' : verb;
  return envelope(baseUrl, v, {}, `  <error code="${code}">${esc(msg)}</error>`);
}

// ─── OAI identifier ↔ D1 id ──────────────

function getOaiPrefix(env: Env): string {
  const repoId = env.APP_DOMAIN || 'bibliohelp.rijdho.org';
  return `oai:${repoId}`;
}

function toOaiId(prefix: string, docId: string): string {
  return `${prefix}:${docId}`;
}

function fromOaiId(prefix: string, oaiId: string): string | null {
  const p = `${prefix}:`;
  return oaiId.startsWith(p) ? oaiId.slice(p.length) : null;
}

// ─── Date helpers ─────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/;

function isValidDate(d: string): boolean {
  return DATE_RE.test(d) && !isNaN(Date.parse(d));
}

function normFrom(d: string): string {
  return d.length === 10 ? `${d}T00:00:00Z` : d;
}

function normUntil(d: string): string {
  return d.length === 10 ? `${d}T23:59:59Z` : d;
}

// ─── Resumption tokens (btoa/atob) ───────

interface TokenState {
  o: number;       // offset
  f?: string;      // from
  u?: string;      // until
  s?: string;      // set
}

function encodeToken(state: TokenState): string {
  const json = JSON.stringify(state);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeToken(token: string): TokenState | null {
  try {
    const restored = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = restored + '='.repeat((4 - restored.length % 4) % 4);
    const parsed = JSON.parse(atob(padded));
    if (typeof parsed.o !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── D1 document shape ───────────────────

interface OaiDoc {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string | null;
  isbn: string | null;
  journal: string | null;
  source: string;
  created_at: string;
}

// ─── D1 queries ──────────────────────────

async function queryRecords(
  db: D1Database,
  offset: number,
  size: number,
  from?: string,
  until?: string,
  set?: string,
): Promise<{ docs: OaiDoc[]; total: number }> {
  const conditions: string[] = ['verified = 1'];
  const params: (string | number)[] = [];

  if (from) {
    conditions.push('created_at >= ?');
    params.push(normFrom(from));
  }
  if (until) {
    conditions.push('created_at <= ?');
    params.push(normUntil(until));
  }
  if (set) {
    const sourceValue = set.replace(/^source:/, '');
    if (sourceValue) {
      conditions.push('source = ?');
      params.push(sourceValue);
    }
  }

  const where = conditions.join(' AND ');

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM [references] WHERE ${where}`
  ).bind(...params).first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const docsResult = await db.prepare(
    `SELECT id, title, authors, year, doi, isbn, journal, source, created_at
     FROM [references] WHERE ${where} ORDER BY created_at ASC LIMIT ? OFFSET ?`
  ).bind(...params, size, offset).all<OaiDoc>();

  return { docs: docsResult.results ?? [], total };
}

async function fetchRecord(db: D1Database, docId: string): Promise<OaiDoc | null> {
  return db.prepare(
    'SELECT id, title, authors, year, doi, isbn, journal, source, created_at FROM [references] WHERE id = ?'
  ).bind(docId).first<OaiDoc>();
}

// ─── Dublin Core XML builders ─────────────

function headerXml(doc: OaiDoc, prefix: string): string {
  const datestamp = doc.created_at
    ? doc.created_at.substring(0, 19) + 'Z'
    : '2024-01-01T00:00:00Z';
  let xml = `      <header>\n`;
  xml += `        <identifier>${esc(toOaiId(prefix, doc.id))}</identifier>\n`;
  xml += `        <datestamp>${datestamp}</datestamp>`;
  if (doc.source) {
    xml += `\n        <setSpec>source:${esc(doc.source)}</setSpec>`;
  }
  xml += `\n      </header>`;
  return xml;
}

function metadataXml(doc: OaiDoc): string {
  const authors = doc.authors ? doc.authors.split(', ').filter(a => a.trim()) : [];
  let dc = '';
  dc += `          <dc:title>${esc(doc.title)}</dc:title>\n`;
  for (const a of authors) {
    dc += `          <dc:creator>${esc(a)}</dc:creator>\n`;
  }
  if (doc.year) {
    dc += `          <dc:date>${doc.year}</dc:date>\n`;
  }
  if (doc.doi) {
    dc += `          <dc:identifier>doi:${esc(doc.doi)}</dc:identifier>\n`;
  }
  if (doc.isbn) {
    dc += `          <dc:identifier>isbn:${esc(doc.isbn)}</dc:identifier>\n`;
  }
  if (doc.journal) {
    dc += `          <dc:source>${esc(doc.journal)}</dc:source>\n`;
  }
  dc += `          <dc:type>text</dc:type>`;

  return `      <metadata>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd">
${dc}
        </oai_dc:dc>
      </metadata>`;
}

function recordXml(doc: OaiDoc, prefix: string): string {
  return `    <record>\n${headerXml(doc, prefix)}\n${metadataXml(doc)}\n    </record>`;
}

// ─── Verb handlers ────────────────────────

function handleIdentify(baseUrl: string, env: Env): string {
  const repoName = env.APP_NAME || 'BiblioHelp';
  const repoId = env.APP_DOMAIN || 'bibliohelp.rijdho.org';
  const adminEmail = env.API_MAILTO || 'bibliohelp@example.com';
  const prefix = getOaiPrefix(env);

  return envelope(baseUrl, 'Identify', {}, `  <Identify>
    <repositoryName>${esc(repoName)}</repositoryName>
    <baseURL>${esc(baseUrl)}</baseURL>
    <protocolVersion>2.0</protocolVersion>
    <adminEmail>${esc(adminEmail)}</adminEmail>
    <earliestDatestamp>2024-01-01T00:00:00Z</earliestDatestamp>
    <deletedRecord>no</deletedRecord>
    <granularity>YYYY-MM-DDThh:mm:ssZ</granularity>
    <description>
      <oai-identifier xmlns="http://www.openarchives.org/OAI/2.0/oai-identifier"
                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                      xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/oai-identifier http://www.openarchives.org/OAI/2.0/oai-identifier.xsd">
        <scheme>oai</scheme>
        <repositoryIdentifier>${repoId}</repositoryIdentifier>
        <delimiter>:</delimiter>
        <sampleIdentifier>${esc(prefix)}:example123</sampleIdentifier>
      </oai-identifier>
    </description>
  </Identify>`);
}

function handleListMetadataFormats(baseUrl: string, identifier?: string): string {
  const attrs: Record<string, string> = {};
  if (identifier) attrs.identifier = identifier;
  return envelope(baseUrl, 'ListMetadataFormats', attrs, `  <ListMetadataFormats>
    <metadataFormat>
      <metadataPrefix>oai_dc</metadataPrefix>
      <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>
      <metadataNamespace>http://purl.org/dc/elements/1.1/</metadataNamespace>
    </metadataFormat>
  </ListMetadataFormats>`);
}

function handleListSets(baseUrl: string): string {
  const sets = SOURCES.map(s =>
    `    <set>\n      <setSpec>source:${s}</setSpec>\n      <setName>Records from ${s}</setName>\n    </set>`
  ).join('\n');
  return envelope(baseUrl, 'ListSets', {}, `  <ListSets>\n${sets}\n  </ListSets>`);
}

async function handleListIdentifiers(baseUrl: string, db: D1Database, prefix: string, params: Record<string, string>): Promise<string> {
  const { metadataPrefix, from, until, set, resumptionToken } = params;
  let offset = 0;
  let dateFrom: string | undefined = from;
  let dateUntil: string | undefined = until;
  let setFilter: string | undefined = set;

  if (resumptionToken) {
    if (metadataPrefix || from || until || set) {
      return errXml(baseUrl, 'ListIdentifiers', 'badArgument', 'resumptionToken is an exclusive argument');
    }
    const state = decodeToken(resumptionToken);
    if (!state) {
      return errXml(baseUrl, 'ListIdentifiers', 'badResumptionToken', 'Invalid resumption token');
    }
    offset = state.o;
    dateFrom = state.f;
    dateUntil = state.u;
    setFilter = state.s;
  } else {
    if (!metadataPrefix) {
      return errXml(baseUrl, 'ListIdentifiers', 'badArgument', 'metadataPrefix is required');
    }
    if (metadataPrefix !== 'oai_dc') {
      return errXml(baseUrl, 'ListIdentifiers', 'cannotDisseminateFormat', `"${metadataPrefix}" is not supported`);
    }
    if (from && !isValidDate(from)) {
      return errXml(baseUrl, 'ListIdentifiers', 'badArgument', 'Invalid from date format');
    }
    if (until && !isValidDate(until)) {
      return errXml(baseUrl, 'ListIdentifiers', 'badArgument', 'Invalid until date format');
    }
  }

  const { docs, total } = await queryRecords(db, offset, PAGE_SIZE, dateFrom, dateUntil, setFilter);

  if (docs.length === 0) {
    return errXml(baseUrl, 'ListIdentifiers', 'noRecordsMatch', 'No records match the request');
  }

  const headers = docs.map(d => headerXml(d, prefix)).join('\n');
  let resumption = '';
  const nextOffset = offset + PAGE_SIZE;
  if (nextOffset < total) {
    const token = encodeToken({ o: nextOffset, f: dateFrom, u: dateUntil, s: setFilter });
    resumption = `\n    <resumptionToken completeListSize="${total}" cursor="${offset}">${token}</resumptionToken>`;
  } else if (offset > 0) {
    resumption = `\n    <resumptionToken completeListSize="${total}" cursor="${offset}"/>`;
  }

  const attrs: Record<string, string> = { metadataPrefix: 'oai_dc' };
  if (dateFrom) attrs.from = dateFrom;
  if (dateUntil) attrs.until = dateUntil;
  if (setFilter) attrs.set = setFilter;

  return envelope(baseUrl, 'ListIdentifiers', attrs, `  <ListIdentifiers>\n${headers}${resumption}\n  </ListIdentifiers>`);
}

async function handleListRecords(baseUrl: string, db: D1Database, prefix: string, params: Record<string, string>): Promise<string> {
  const { metadataPrefix, from, until, set, resumptionToken } = params;
  let offset = 0;
  let dateFrom: string | undefined = from;
  let dateUntil: string | undefined = until;
  let setFilter: string | undefined = set;

  if (resumptionToken) {
    if (metadataPrefix || from || until || set) {
      return errXml(baseUrl, 'ListRecords', 'badArgument', 'resumptionToken is an exclusive argument');
    }
    const state = decodeToken(resumptionToken);
    if (!state) {
      return errXml(baseUrl, 'ListRecords', 'badResumptionToken', 'Invalid resumption token');
    }
    offset = state.o;
    dateFrom = state.f;
    dateUntil = state.u;
    setFilter = state.s;
  } else {
    if (!metadataPrefix) {
      return errXml(baseUrl, 'ListRecords', 'badArgument', 'metadataPrefix is required');
    }
    if (metadataPrefix !== 'oai_dc') {
      return errXml(baseUrl, 'ListRecords', 'cannotDisseminateFormat', `"${metadataPrefix}" is not supported`);
    }
    if (from && !isValidDate(from)) {
      return errXml(baseUrl, 'ListRecords', 'badArgument', 'Invalid from date format');
    }
    if (until && !isValidDate(until)) {
      return errXml(baseUrl, 'ListRecords', 'badArgument', 'Invalid until date format');
    }
  }

  const { docs, total } = await queryRecords(db, offset, PAGE_SIZE, dateFrom, dateUntil, setFilter);

  if (docs.length === 0) {
    return errXml(baseUrl, 'ListRecords', 'noRecordsMatch', 'No records match the request');
  }

  const records = docs.map(d => recordXml(d, prefix)).join('\n');
  let resumption = '';
  const nextOffset = offset + PAGE_SIZE;
  if (nextOffset < total) {
    const token = encodeToken({ o: nextOffset, f: dateFrom, u: dateUntil, s: setFilter });
    resumption = `\n    <resumptionToken completeListSize="${total}" cursor="${offset}">${token}</resumptionToken>`;
  } else if (offset > 0) {
    resumption = `\n    <resumptionToken completeListSize="${total}" cursor="${offset}"/>`;
  }

  const attrs: Record<string, string> = { metadataPrefix: 'oai_dc' };
  if (dateFrom) attrs.from = dateFrom;
  if (dateUntil) attrs.until = dateUntil;
  if (setFilter) attrs.set = setFilter;

  return envelope(baseUrl, 'ListRecords', attrs, `  <ListRecords>\n${records}${resumption}\n  </ListRecords>`);
}

async function handleGetRecord(baseUrl: string, db: D1Database, prefix: string, identifier: string, metadataPrefix: string): Promise<string> {
  if (!identifier || !metadataPrefix) {
    return errXml(baseUrl, 'GetRecord', 'badArgument', 'identifier and metadataPrefix are required');
  }
  if (metadataPrefix !== 'oai_dc') {
    return errXml(baseUrl, 'GetRecord', 'cannotDisseminateFormat', `"${metadataPrefix}" is not supported`);
  }

  const docId = fromOaiId(prefix, identifier);
  if (!docId) {
    return errXml(baseUrl, 'GetRecord', 'idDoesNotExist', `Invalid identifier format`);
  }

  const doc = await fetchRecord(db, docId);
  if (!doc) {
    return errXml(baseUrl, 'GetRecord', 'idDoesNotExist', `Record not found`);
  }

  return envelope(baseUrl, 'GetRecord', { identifier, metadataPrefix: 'oai_dc' },
    `  <GetRecord>\n${recordXml(doc, prefix)}\n  </GetRecord>`);
}

// ─── Shared handler for GET and POST ──────

async function handleOai(c: Context<{ Bindings: Env }>): Promise<Response> {
  const baseUrl = getBaseUrl(c);
  const db = c.env.DB;
  const prefix = getOaiPrefix(c.env);

  // Extract params from GET query or POST form body
  let params: Record<string, string> = {};
  if (c.req.method === 'POST') {
    // Bound the POST body (OAI uses application/x-www-form-urlencoded). The
    // /verify size guard does not apply here, so enforce MAX_BODY_SIZE in bytes.
    const raw = await c.req.text();
    const maxBodySize = parseInt(c.env.MAX_BODY_SIZE || '50000', 10);
    if (new TextEncoder().encode(raw).length > maxBodySize) {
      return c.text('Request body too large', 413);
    }
    for (const [k, v] of new URLSearchParams(raw)) {
      params[k] = v;
    }
  } else {
    const url = new URL(c.req.url);
    for (const [k, v] of url.searchParams) {
      params[k] = v;
    }
  }

  const verb = params.verb || '';

  let xml: string;
  try {
    switch (verb) {
      case 'Identify':
        xml = handleIdentify(baseUrl, c.env);
        break;
      case 'ListMetadataFormats':
        xml = handleListMetadataFormats(baseUrl, params.identifier);
        break;
      case 'ListSets':
        xml = handleListSets(baseUrl);
        break;
      case 'ListIdentifiers':
        xml = await handleListIdentifiers(baseUrl, db, prefix, {
          metadataPrefix: params.metadataPrefix || '',
          from: params.from || '',
          until: params.until || '',
          set: params.set || '',
          resumptionToken: params.resumptionToken || '',
        });
        break;
      case 'ListRecords':
        xml = await handleListRecords(baseUrl, db, prefix, {
          metadataPrefix: params.metadataPrefix || '',
          from: params.from || '',
          until: params.until || '',
          set: params.set || '',
          resumptionToken: params.resumptionToken || '',
        });
        break;
      case 'GetRecord':
        xml = await handleGetRecord(
          baseUrl,
          db,
          prefix,
          params.identifier || '',
          params.metadataPrefix || '',
        );
        break;
      default:
        xml = errXml(baseUrl, '', 'badVerb', verb ? `"${verb}" is not a valid OAI-PMH verb` : 'verb argument is required');
    }
  } catch (err) {
    console.error('[OAI-PMH] Error:', (err as Error).message);
    xml = errXml(baseUrl, verb, 'badArgument', 'Internal error processing request');
  }

  c.header('Content-Type', 'text/xml; charset=utf-8');
  return c.body(xml);
}

// ─── Route ────────────────────────────────

export const oai = new Hono<{ Bindings: Env }>();

oai.get('/oai', handleOai);
oai.post('/oai', handleOai);
