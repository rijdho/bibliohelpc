import type { CitationData } from '@bibliohelp/shared';

/**
 * Build a COinS (ContextObjects in Spans) title attribute string.
 * Zotero and other reference managers detect <span class="Z3988" title="...">
 * and offer to save the bibliographic record.
 *
 * @see https://en.wikipedia.org/wiki/COinS
 */
export function buildCoinsTitle(data: CitationData): string {
  const params = new URLSearchParams();
  params.set('ctx_ver', 'Z39.88-2004');

  if (data.journal) {
    // Journal article
    params.set('rft_val_fmt', 'info:ofi/fmt:kev:mtx:journal');
    params.set('rft.genre', 'article');
    params.set('rft.atitle', data.title);
    params.set('rft.jtitle', data.journal);
  } else {
    // Book
    params.set('rft_val_fmt', 'info:ofi/fmt:kev:mtx:book');
    params.set('rft.genre', 'book');
    params.set('rft.btitle', data.title);
  }

  // Authors (rft.au for each)
  for (const author of data.authors) {
    params.append('rft.au', author);
  }

  if (data.year) params.set('rft.date', String(data.year));
  if (data.isbn) params.set('rft.isbn', data.isbn);
  if (data.doi) params.set('rft_id', `info:doi/${data.doi}`);
  if (data.publisher) params.set('rft.pub', data.publisher);

  return params.toString();
}
