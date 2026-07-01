import type { VerifyResponse } from '@bibliohelp/shared';
import { buildCitationData, formatCitationPlain, type CitationFormat } from '@bibliohelp/shared';
import { t, tCoded, dateLocale, getLang } from './i18n.svelte';

export function generateReport(data: VerifyResponse, appName: string, format: CitationFormat = 'APA'): string {
  const now = new Date().toLocaleString(dateLocale(), { dateStyle: 'long', timeStyle: 'short' });

  let html = `<!DOCTYPE html>
<html lang="${getLang()}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(t('report.title'))} — ${escapeHtml(appName)}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e; line-height: 1.6; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #6366f1; padding-bottom: 8px; color: #1a1a2e; }
  h2 { font-size: 1.1rem; margin-top: 2rem; color: #374151; }
  .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 2rem; }
  .summary { display: flex; gap: 16px; margin: 1.5rem 0; flex-wrap: wrap; }
  .summary-card { padding: 12px 20px; border-radius: 6px; text-align: center; min-width: 100px; }
  .summary-card .number { font-size: 1.8rem; font-weight: 700; }
  .summary-card .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .card-total { background: #f3f4f6; color: #1a1a2e; }
  .card-verified { background: #dcfce7; color: #166534; }
  .card-partial { background: #fef3c7; color: #92400e; }
  .card-notfound { background: #fee2e2; color: #991b1b; }
  .ref { border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; }
  .ref-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .ref-num { color: #6b7280; font-size: 0.8rem; font-family: monospace; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
  .badge-verified { background: #dcfce7; color: #166534; }
  .badge-partial { background: #fef3c7; color: #92400e; }
  .badge-not_found { background: #fee2e2; color: #991b1b; }
  .badge-likely_fake { background: #fee2e2; color: #991b1b; }
  .ref-raw { font-size: 0.9rem; color: #374151; margin-bottom: 8px; }
  .ref-message { font-size: 0.8rem; color: #6b7280; font-style: italic; }
  .ref-match { font-size: 0.8rem; color: #6b7280; margin-top: 6px; padding: 8px; background: #f9fafb; border-radius: 4px; }
  .ref-citation { font-size: 0.85rem; color: #374151; margin-top: 8px; padding: 8px 12px; background: #eef2ff; border-left: 3px solid #6366f1; border-radius: 0 4px 4px 0; }
  .suggestion { font-size: 0.8rem; color: #92400e; background: #fef3c7; padding: 6px 10px; border-radius: 4px; margin-top: 6px; }
  .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.8rem; color: #9ca3af; text-align: center; }
  @media print { body { padding: 20px; } .summary { page-break-after: avoid; } }
</style>
</head>
<body>
<h1>${escapeHtml(t('report.title'))}</h1>
<p class="meta">${escapeHtml(t('report.generatedBy'))} ${escapeHtml(appName)} ${escapeHtml(t('report.on'))} ${escapeHtml(now)}</p>

<div class="summary">
  <div class="summary-card card-total"><div class="number">${data.totalReferences}</div><div class="label">${escapeHtml(t('summary.total'))}</div></div>
  <div class="summary-card card-verified"><div class="number">${data.verified}</div><div class="label">${escapeHtml(t('summary.verified'))}</div></div>
  <div class="summary-card card-partial"><div class="number">${data.partial}</div><div class="label">${escapeHtml(t('summary.partial'))}</div></div>
  <div class="summary-card card-notfound"><div class="number">${data.notFound + data.likelyFake}</div><div class="label">${escapeHtml(t('summary.notFound'))}</div></div>
</div>
`;

  html += `<h2>${escapeHtml(t('report.detail'))}</h2>\n`;

  const statusLabel: Record<string, string> = {
    verified: t('report.statusVerified'),
    partial: t('report.statusPartial'),
    not_found: t('report.statusNotFound'),
    likely_fake: t('report.statusNotFound'),
  };

  for (let i = 0; i < data.results.length; i++) {
    const r = data.results[i];

    html += `<div class="ref">
  <div class="ref-header">
    <span class="ref-num">#${i + 1}</span>
    <span class="badge badge-${r.status}">${statusLabel[r.status] || r.status} (${r.score}%)</span>
  </div>
  <div class="ref-raw">${escapeHtml(r.reference.raw)}</div>
  <div class="ref-message">${escapeHtml(tCoded(r.messageCode, r.messageParams, r.message))}</div>`;

    if (r.suggestions?.length) {
      for (const sug of r.suggestions) {
        html += `\n  <div class="suggestion">${escapeHtml(tCoded(sug.messageCode, sug.messageParams, sug.message))}</div>`;
      }
    }

    if (r.matches.length > 0) {
      const m = r.matches[0];
      html += `\n  <div class="ref-match"><strong>${escapeHtml(t('report.bestMatch'))}</strong> (${(m.similarity * 100).toFixed(0)}%): ${escapeHtml(m.title)} — ${escapeHtml(m.authors.slice(0, 3).join(', '))} ${m.year ? `(${m.year})` : ''}</div>`;

      const citData = buildCitationData(r.reference, m);
      if (citData.title && citData.authors.length > 0) {
        html += `\n  <div class="ref-citation">${escapeHtml(formatCitationPlain(citData, format))}</div>`;
      }
    }

    html += `\n</div>\n`;
  }

  if (data.duplicates?.length) {
    html += `<h2>${escapeHtml(t('report.duplicates'))}</h2>\n`;
    for (const group of data.duplicates) {
      html += `<p class="suggestion">${escapeHtml(t('dup.refsLabel'))} ${group.indices.map(i => i + 1).join(', ')} ${escapeHtml(t('dup.sameSource'))} (${(group.similarity * 100).toFixed(0)}% ${escapeHtml(t('dup.similarity'))})</p>\n`;
    }
  }

  html += `
<div class="footer">
  ${escapeHtml(t('report.generatedBy'))} ${escapeHtml(appName)} — ${escapeHtml(t('report.footer'))}
</div>
</body>
</html>`;

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
