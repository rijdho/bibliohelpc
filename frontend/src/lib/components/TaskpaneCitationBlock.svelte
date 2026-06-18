<script lang="ts">
  import {
    formatCitation,
    formatCitationPlain,
    type CitationFormat,
    type CitationData,
  } from '@bibliohelp/shared';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    citationData: CitationData;
    onInsert: (html: string) => Promise<void>;
  }

  let { citationData, onInsert }: Props = $props();

  const formats: CitationFormat[] = ['APA', 'MLA', 'Chicago', 'Vancouver'];
  let activeFormat = $state<CitationFormat>('APA');
  let copied = $state(false);
  let inserted = $state(false);

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderHtml(): string {
    return escapeHtml(formatCitation(citationData, activeFormat))
      .replace(/_([^_]+)_/g, '<em>$1</em>');
  }

  function citationAsHtml(): string {
    const raw = escapeHtml(formatCitation(citationData, activeFormat));
    return '<p>' + raw.replace(/_([^_]+)_/g, '<i>$1</i>') + '</p>';
  }

  async function copy() {
    const text = formatCitationPlain(citationData, activeFormat);
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {}
  }

  async function insert() {
    try {
      await onInsert(citationAsHtml());
      inserted = true;
      setTimeout(() => { inserted = false; }, 2000);
    } catch {}
  }
</script>

<div class="mt-2 pt-2 border-t border-border-light/60">
  <h4 class="text-[10px] font-semibold text-text mb-1.5 uppercase tracking-wider">{t('tpcite.title')}</h4>

  <!-- Format tabs -->
  <div class="flex bg-surface-warm border border-border-light rounded p-0.5 mb-2">
    {#each formats as fmt}
      <button
        onclick={() => activeFormat = fmt}
        class="flex-1 px-1 py-0.5 text-[10px] font-semibold rounded transition-all
          {activeFormat === fmt
            ? 'bg-primary text-white shadow-sm'
            : 'text-text-muted hover:text-text'}"
      >
        {fmt}
      </button>
    {/each}
  </div>

  <!-- Citation text -->
  <div class="bg-surface rounded border border-border-light/60 px-2.5 py-2 text-[11px] leading-relaxed text-text-muted">
    {@html renderHtml()}
  </div>

  <!-- Action buttons -->
  <div class="flex gap-1.5 mt-1.5">
    <button
      onclick={copy}
      class="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border transition-all
        {copied
          ? 'bg-verified-bg border-verified/25 text-verified'
          : 'border-border text-text-muted hover:text-text hover:border-accent/30'}"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {#if copied}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        {:else}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        {/if}
      </svg>
      {copied ? t('common.copied') : t('common.copy')}
    </button>
    <button
      onclick={insert}
      class="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border transition-all
        {inserted
          ? 'bg-verified-bg border-verified/25 text-verified'
          : 'border-primary/30 text-primary bg-primary/5 hover:bg-primary/10'}"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {#if inserted}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        {:else}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        {/if}
      </svg>
      {inserted ? t('tpcite.inserted') : t('tpcite.insert')}
    </button>
  </div>
</div>
