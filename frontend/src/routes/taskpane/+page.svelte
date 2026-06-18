<script lang="ts">
  import type { VerifyResponse } from '@bibliohelp/shared';
  import { buildCitationData } from '@bibliohelp/shared';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import TaskpaneCitationBlock from '$lib/components/TaskpaneCitationBlock.svelte';
  import { appConfig } from '$lib/config';
  import { t } from '$lib/i18n.svelte';

  let loading = $state(false);
  let results = $state<VerifyResponse | null>(null);
  let error = $state<string | null>(null);
  let officeReady = $state(false);
  let selectedText = $state('');
  let expandedIndex = $state<number | null>(null);

  // Initialize Office.js
  $effect(() => {
    if (typeof window !== 'undefined' && (window as any).Office) {
      (window as any).Office.onReady(() => {
        officeReady = true;
      });
    }
  });

  function toggleExpand(i: number) {
    expandedIndex = expandedIndex === i ? null : i;
  }

  function isSafeUrl(url: string | null): boolean {
    if (!url) return false;
    try { return new URL(url).protocol.startsWith('http'); }
    catch { return false; }
  }

  async function readSelection() {
    error = null;
    if (!officeReady) {
      error = t('tp.officeNotReady');
      return;
    }

    try {
      const result = await new Promise<string>((resolve, reject) => {
        (window as any).Office.context.document.getSelectedDataAsync(
          (window as any).Office.CoercionType.Text,
          (res: any) => {
            if (res.status === 'succeeded') {
              resolve(res.value);
            } else {
              reject(new Error(res.error.message));
            }
          }
        );
      });

      if (!result.trim()) {
        error = t('tp.noSelection');
        return;
      }

      selectedText = result;
      await verify(result);
    } catch (err) {
      error = err instanceof Error ? err.message : t('tp.readError');
    }
  }

  async function verify(text: string) {
    loading = true;
    error = null;
    results = null;

    try {
      const res = await fetch(`${appConfig.apiUrl}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Error ${res.status}`);
      }

      results = await res.json();
    } catch (err) {
      error = err instanceof Error ? err.message : t('tp.verifyError');
    } finally {
      loading = false;
    }
  }

  function reset() {
    results = null;
    error = null;
    selectedText = '';
    expandedIndex = null;
  }

  async function insertToDocument(html: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      (window as any).Office.context.document.setSelectedDataAsync(
        html,
        { coercionType: (window as any).Office.CoercionType.Html },
        (result: any) => {
          if (result.status === 'succeeded') resolve();
          else reject(new Error(result.error?.message || 'Error al insertar'));
        }
      );
    });
  }
</script>

<svelte:head>
  <title>{appConfig.appName} - Word Add-in</title>
</svelte:head>

<div class="space-y-3">
  {#if !results}
    <p class="text-[11px] text-text-muted leading-relaxed">
      {t('tp.instruction')}
    </p>

    <button
      onclick={readSelection}
      disabled={loading}
      class="w-full py-2.5 px-4 rounded text-sm font-medium text-white bg-primary hover:bg-primary-light disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
    >
      {#if loading}
        <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        {t('input.verifying')}
      {:else}
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
        {t('tp.readAndVerify')}
      {/if}
    </button>
  {/if}

  {#if error}
    <div class="bg-fake-bg border border-fake/20 rounded p-3 text-[11px] text-fake flex items-start gap-2">
      <svg class="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
      </svg>
      {error}
    </div>
  {/if}

  {#if results}
    <div class="space-y-3 animate-fade-in">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-text">{t('results.title')}</h2>
        <button
          onclick={reset}
          class="text-[11px] text-accent hover:text-accent-light font-medium flex items-center gap-1"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          {t('actions.newVerification')}
        </button>
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-4 gap-1.5">
        <div class="bg-surface-card rounded p-2 text-center border border-border">
          <div class="text-base font-bold text-text">{results.totalReferences}</div>
          <div class="text-[9px] text-text-muted uppercase tracking-wider">{t('summary.total')}</div>
        </div>
        <div class="bg-verified-bg rounded p-2 text-center border border-verified/20">
          <div class="text-base font-bold text-verified">{results.verified}</div>
          <div class="text-[9px] text-verified/70 uppercase tracking-wider">OK</div>
        </div>
        <div class="bg-partial-bg rounded p-2 text-center border border-partial/20">
          <div class="text-base font-bold text-partial">{results.partial}</div>
          <div class="text-[9px] text-partial/70 uppercase tracking-wider">{t('tp.partialShort')}</div>
        </div>
        <div class="bg-fake-bg rounded p-2 text-center border border-fake/20">
          <div class="text-base font-bold text-fake">{results.notFound + results.likelyFake}</div>
          <div class="text-[9px] text-fake/70 uppercase tracking-wider">{t('tp.noShort')}</div>
        </div>
      </div>

      <!-- Reference list -->
      <div class="space-y-1.5">
        {#each results.results as item, i}
          <div class="bg-surface-card border border-border rounded overflow-hidden hover:border-accent/30 transition-colors">
            <!-- Header row -->
            <button
              class="w-full text-left px-3 py-2.5 flex items-start gap-2 cursor-pointer"
              onclick={() => toggleExpand(i)}
            >
              <span class="text-text-light text-[10px] font-mono mt-0.5 shrink-0 w-4 text-right">{i + 1}</span>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] text-text leading-snug line-clamp-2">{item.reference.raw}</p>
                <div class="flex items-center gap-1.5 mt-1.5">
                  <StatusBadge status={item.status} score={item.score} />
                  {#if item.reference.format !== 'unknown'}
                    <span class="text-[9px] uppercase tracking-wider text-text-light font-medium px-1 py-0.5 bg-surface-warm rounded border border-border-light">{item.reference.format}</span>
                  {/if}
                </div>
              </div>
              <svg
                class="w-3.5 h-3.5 text-text-light shrink-0 mt-1 transition-transform duration-200 {expandedIndex === i ? 'rotate-180' : ''}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            <!-- Expanded details -->
            {#if expandedIndex === i}
              <div class="px-3 pb-3 border-t border-border-light pt-2.5 space-y-2 animate-fade-in ml-6">
                <p class="text-[10px] text-text-muted italic">{item.message}</p>

                <!-- Correction suggestions -->
                {#if item.suggestions && item.suggestions.length > 0}
                  <div class="space-y-1 mb-1.5">
                    {#each item.suggestions as sug}
                      <div class="flex items-start gap-1.5 bg-partial-bg/50 border border-partial/15 rounded px-2.5 py-1.5 text-[10px]">
                        <svg class="w-3 h-3 text-partial shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        <div>
                          <p class="text-partial font-medium">{sug.message}</p>
                          {#if sug.suggestedValue && sug.field !== 'title'}
                            <p class="text-text-muted mt-0.5">{t('matches.suggestion')} <span class="font-mono text-text">{sug.suggestedValue}</span></p>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}

                <!-- Parsed fields -->
                <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                  {#if item.reference.title}
                    <span class="font-medium text-text">{t('fields.title')}</span>
                    <span class="text-text-muted">{item.reference.title}</span>
                  {/if}
                  {#if item.reference.authors.length > 0}
                    <span class="font-medium text-text">{t('fields.authors')}</span>
                    <span class="text-text-muted">{item.reference.authors.join(', ')}</span>
                  {/if}
                  {#if item.reference.year}
                    <span class="font-medium text-text">{t('fields.year')}</span>
                    <span class="text-text-muted">{item.reference.year}</span>
                  {/if}
                  {#if item.reference.doi}
                    <span class="font-medium text-text">DOI</span>
                    <a href="https://doi.org/{item.reference.doi}" target="_blank" class="text-accent hover:underline truncate">{item.reference.doi}</a>
                  {/if}
                  {#if item.reference.isbn}
                    <span class="font-medium text-text">ISBN</span>
                    <span class="text-text-muted">{item.reference.isbn}</span>
                  {/if}
                </div>

                <!-- Matches -->
                {#if item.matches.length > 0}
                  <div>
                    <h4 class="text-[10px] font-semibold text-text mb-1 uppercase tracking-wider">{t('matches.title')}</h4>
                    <div class="space-y-1">
                      {#each item.matches as match}
                        <div class="bg-surface-warm/50 rounded border border-border-light px-2.5 py-1.5 text-[11px]">
                          <div class="flex items-center justify-between gap-1">
                            <span class="font-medium text-text truncate flex-1">{match.title}</span>
                            <span class="text-text-light shrink-0 font-mono text-[10px]">{(match.similarity * 100).toFixed(0)}%</span>
                          </div>
                          <div class="text-text-muted text-[10px] mt-0.5">
                            {match.authors.slice(0, 2).join(', ')}{match.authors.length > 2 ? ' et al.' : ''}
                            {match.year ? `(${match.year})` : ''}
                          </div>
                          {#if isSafeUrl(match.url)}
                            <a href={match.url} target="_blank" class="text-accent hover:underline text-[10px] inline-flex items-center gap-0.5 mt-0.5">
                              {t('matches.viewSource')}
                              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                            </a>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}

                <!-- Citation suggestions -->
                {#if (item.status === 'verified' || item.status === 'partial') && item.matches.length > 0}
                  {@const citationData = buildCitationData(item.reference, item.matches[0])}
                  {#if citationData.title && citationData.authors.length > 0}
                    <TaskpaneCitationBlock
                      {citationData}
                      onInsert={insertToDocument}
                    />
                  {/if}
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
