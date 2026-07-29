<script lang="ts">
  import type { VerifyResponse } from '@bibliohelp/shared';
  import {
    formatCitation,
    formatCitationPlain,
    formatAllBibtex,
    formatAllRis,
    buildCitationData,
    type CitationFormat,
    type CitationData,
  } from '@bibliohelp/shared';
  import { t, plural } from '$lib/i18n.svelte';

  interface Props {
    data: VerifyResponse;
  }

  let { data }: Props = $props();

  const formats: CitationFormat[] = ['APA', 'MLA', 'Chicago', 'Vancouver'];
  let activeFormat = $state<CitationFormat>('APA');
  let copied = $state(false);

  // Only offer ready-to-copy citations for VERIFIED references. A partial /
  // likely-fake result's best match may be the wrong or a re-registered record
  // (e.g. a stolen DOI, or a copy re-dated to a different year), so formatting a
  // citation from it would hand the user exactly the suspect record we flagged.
  const citations = $derived(
    data.results
      .filter(r => r.status === 'verified')
      .map(r => {
        const bestMatch = r.matches[0];
        return buildCitationData(r.reference, bestMatch);
      })
      .filter(c => c.title && c.authors.length > 0)
  );

  async function copyAll() {
    const text = citations
      .map((c, i) => `${i + 1}. ${formatCitationPlain(c, activeFormat)}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {}
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBibtex() {
    const content = formatAllBibtex(citations);
    downloadFile(content, 'bibliohelp-references.bib', 'application/x-bibtex');
  }

  function downloadRis() {
    const content = formatAllRis(citations);
    downloadFile(content, 'bibliohelp-references.ris', 'application/x-research-info-systems');
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderCitation(c: CitationData): string {
    return escapeHtml(formatCitation(c, activeFormat))
      .replace(/_([^_]+)_/g, '<em>$1</em>');
  }
</script>

{#if citations.length > 0}
  <div class="bg-surface-card border border-border rounded p-4 animate-fade-in">
    <!-- Header -->
    <div class="flex items-center justify-between mb-3 flex-wrap gap-3">
      <div>
        <h3 class="font-display text-sm font-bold text-text">{t('cite.title')}</h3>
        <p class="text-[11px] text-text-light mt-0.5">{citations.length} {plural(citations.length, 'cite.ref')}</p>
      </div>

      <div class="flex items-center gap-2">
        <!-- Format selector -->
        <div class="flex bg-surface-warm border border-border-light rounded p-0.5">
          {#each formats as fmt}
            <button
              onclick={() => activeFormat = fmt}
              class="px-2.5 py-1 text-[11px] font-semibold rounded transition-all duration-150
                {activeFormat === fmt
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text'}"
            >
              {fmt}
            </button>
          {/each}
        </div>

        <!-- Copy button -->
        <button
          onclick={copyAll}
          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded border transition-all duration-150
            {copied
              ? 'bg-verified-bg border-verified/25 text-verified'
              : 'border-border text-text-muted hover:text-text hover:border-accent/30'}"
        >
          {#if copied}
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            {t('common.copied')}
          {:else}
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            {t('cite.copyAll')}
          {/if}
        </button>

        <!-- BibTeX download button -->
        <button
          onclick={downloadBibtex}
          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded border transition-all duration-150
            border-border text-text-muted hover:text-text hover:border-accent/30"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          BibTeX
        </button>

        <!-- RIS download button -->
        <button
          onclick={downloadRis}
          class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded border transition-all duration-150
            border-border text-text-muted hover:text-text hover:border-accent/30"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          RIS
        </button>
      </div>
    </div>

    <!-- Citations list -->
    <div class="space-y-1.5">
      {#each citations as c, i}
        <div class="flex gap-2.5 px-3 py-2 rounded bg-surface border border-border-light/60 hover:border-accent/15 transition-colors">
          <span class="shrink-0 text-[11px] text-text-light font-mono pt-0.5">{i + 1}.</span>
          <p class="text-sm leading-relaxed text-text-muted">
            {@html renderCitation(c)}
          </p>
        </div>
      {/each}
    </div>
  </div>
{/if}
