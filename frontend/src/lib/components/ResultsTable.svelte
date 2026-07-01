<script lang="ts">
  import { type VerifyResponse, buildCitationData } from '@bibliohelp/shared';
  import { buildCoinsTitle } from '$lib/coins';
  import { t, tCoded } from '$lib/i18n.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import CitationBlock from './CitationBlock.svelte';

  interface Props {
    data: VerifyResponse;
  }

  let { data }: Props = $props();

  let expandedIndex = $state<number | null>(null);

  function toggleExpand(i: number) {
    expandedIndex = expandedIndex === i ? null : i;
  }

  function isSafeUrl(url: string | null): boolean {
    if (!url) return false;
    try { return new URL(url).protocol.startsWith('http'); }
    catch { return false; }
  }

  const summary = $derived({
    total: data.totalReferences,
    verified: data.verified,
    partial: data.partial,
    notFound: data.notFound + data.likelyFake,
  });
</script>

<div class="space-y-5 animate-fade-in">
  <!-- Summary cards -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
    <div class="bg-surface-card border border-border rounded p-3.5 text-center animate-fade-in-up" style="opacity:0">
      <div class="font-display text-2xl font-bold text-text">{summary.total}</div>
      <div class="text-[11px] text-text-muted mt-0.5 uppercase tracking-wider">{t('summary.total')}</div>
    </div>
    <div class="bg-verified-bg border border-verified/20 rounded p-3.5 text-center animate-fade-in-up" style="opacity:0">
      <div class="font-display text-2xl font-bold text-verified">{summary.verified}</div>
      <div class="text-[11px] text-verified/70 mt-0.5 uppercase tracking-wider">{t('summary.verified')}</div>
    </div>
    <div class="bg-partial-bg border border-partial/20 rounded p-3.5 text-center animate-fade-in-up" style="opacity:0">
      <div class="font-display text-2xl font-bold text-partial">{summary.partial}</div>
      <div class="text-[11px] text-partial/70 mt-0.5 uppercase tracking-wider">{t('summary.partial')}</div>
    </div>
    <div class="bg-fake-bg border border-fake/20 rounded p-3.5 text-center animate-fade-in-up" style="opacity:0">
      <div class="font-display text-2xl font-bold text-fake">{summary.notFound}</div>
      <div class="text-[11px] text-fake/70 mt-0.5 uppercase tracking-wider">{t('summary.notFound')}</div>
    </div>
  </div>

  <!-- Duplicate warning -->
  {#if data.duplicates && data.duplicates.length > 0}
    <div class="bg-partial-bg border border-partial/20 rounded p-3.5 flex items-start gap-2.5 text-sm text-partial">
      <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
      </svg>
      <div>
        <p class="font-medium">{t('dup.title')}</p>
        <ul class="mt-1 text-xs text-partial/80 space-y-0.5">
          {#each data.duplicates as group}
            <li>{t('dup.refsLabel')} {group.indices.map(i => i + 1).join(', ')} {t('dup.sameSource')} ({(group.similarity * 100).toFixed(0)}% {t('dup.similarity')})</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  <!-- Citation block -->
  <CitationBlock {data} />

  <!-- Results list -->
  <div class="space-y-2">
    {#each data.results as result, i}
      {@const ref = result.reference}
      <div class="bg-surface-card border border-border rounded overflow-hidden hover:border-accent/30 transition-colors">
        <!-- Main row -->
        <button
          class="w-full text-left px-4 py-3.5 flex items-start gap-3 cursor-pointer"
          onclick={() => toggleExpand(i)}
        >
          <span class="text-text-light text-xs font-mono mt-0.5 shrink-0 w-5 text-right">{i + 1}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-text leading-snug line-clamp-2">{ref.raw}</p>
            <div class="flex items-center gap-2.5 mt-2">
              <StatusBadge status={result.status} score={result.score} />
              {#if ref.format !== 'unknown'}
                <span class="text-[10px] uppercase tracking-wider text-text-light font-medium px-1.5 py-0.5 bg-surface-warm rounded border border-border-light">{ref.format}</span>
              {/if}
            </div>
          </div>
          <svg
            class="w-4 h-4 text-text-light shrink-0 mt-1 transition-transform duration-200 {expandedIndex === i ? 'rotate-180' : ''}"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>

        <!-- COinS metadata for Zotero auto-detection -->
        {#if result.matches.length > 0}
          {@const coinsCitation = buildCitationData(result.reference, result.matches[0])}
          <span class="Z3988" title={buildCoinsTitle(coinsCitation)}></span>
        {/if}

        <!-- Expanded details -->
        {#if expandedIndex === i}
          <div class="px-4 pb-4 border-t border-border-light pt-3 space-y-2.5 animate-fade-in ml-8">
            <p class="text-xs text-text-muted italic">{tCoded(result.messageCode, result.messageParams, result.message)}</p>

            {#if result.suggestions && result.suggestions.length > 0}
              <div class="space-y-1.5 mb-2">
                {#each result.suggestions as sug}
                  <div class="flex items-start gap-2 bg-partial-bg/50 border border-partial/15 rounded px-3 py-2 text-xs">
                    <svg class="w-3.5 h-3.5 text-partial shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div>
                      <p class="text-partial font-medium">{tCoded(sug.messageCode, sug.messageParams, sug.message)}</p>
                      {#if sug.suggestedValue && sug.field !== 'title'}
                        <p class="text-text-muted mt-0.5">{t('matches.suggestion')} <span class="font-mono text-text">{sug.suggestedValue}</span></p>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {#if ref.title}
                <span class="font-medium text-text">{t('fields.title')}</span>
                <span class="text-text-muted">{ref.title}</span>
              {/if}
              {#if ref.authors.length > 0}
                <span class="font-medium text-text">{t('fields.authors')}</span>
                <span class="text-text-muted">{ref.authors.join(', ')}</span>
              {/if}
              {#if ref.year}
                <span class="font-medium text-text">{t('fields.year')}</span>
                <span class="text-text-muted">{ref.year}</span>
              {/if}
              {#if ref.doi}
                <span class="font-medium text-text">DOI</span>
                <a href="https://doi.org/{ref.doi}" target="_blank" class="text-accent hover:underline">{ref.doi}</a>
              {/if}
              {#if ref.isbn}
                <span class="font-medium text-text">ISBN</span>
                <span class="text-text-muted">{ref.isbn}</span>
              {/if}
            </div>

            {#if result.matches.length > 0}
              <div class="mt-2">
                <h4 class="text-[11px] font-semibold text-text mb-1.5 uppercase tracking-wider">{t('matches.title')}</h4>
                <div class="space-y-1.5">
                  {#each result.matches as match}
                    <div class="bg-surface-warm/50 rounded border border-border-light px-3 py-2 text-xs">
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-medium text-text truncate flex-1">{match.title}</span>
                        <span class="text-text-light shrink-0 font-mono text-[11px]">{(match.similarity * 100).toFixed(0)}%</span>
                      </div>
                      <div class="text-text-muted mt-0.5">
                        {match.authors.slice(0, 3).join(', ')}{match.authors.length > 3 ? ' et al.' : ''} {match.year ? `(${match.year})` : ''}
                      </div>
                      {#if isSafeUrl(match.url)}
                        <a href={match.url} target="_blank" class="text-accent hover:underline mt-1 inline-flex items-center gap-1">
                          {t('matches.viewSource')}
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        </a>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
