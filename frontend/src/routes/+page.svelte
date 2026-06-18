<script lang="ts">
  import type { VerifyResponse } from '@bibliohelp/shared';
  import BibliographyInput from '$lib/components/BibliographyInput.svelte';
  import ResultsTable from '$lib/components/ResultsTable.svelte';
  import { appConfig } from '$lib/config';
  import { getHistory, addToHistory, removeFromHistory, clearHistory, type HistoryEntry } from '$lib/history';
  import { generateReport } from '$lib/report';

  let loading = $state(false);
  let results = $state<VerifyResponse | null>(null);
  let error = $state<string | null>(null);
  let addingMore = $state(false);
  let showInstructions = $state(false);
  let history = $state<HistoryEntry[]>([]);
  let showHistory = $state(false);

  $effect(() => {
    history = getHistory();
  });

  function mergeResults(existing: VerifyResponse, incoming: VerifyResponse): VerifyResponse {
    const mergedResults = [...existing.results, ...incoming.results];
    // incoming.duplicates indices are 0-based into incoming.results, so shift
    // them by the number of pre-existing results before merging.
    const offset = existing.results.length;
    const incomingDuplicates = (incoming.duplicates || []).map(group => ({
      ...group,
      indices: group.indices.map(i => i + offset),
    }));
    return {
      results: mergedResults,
      totalReferences: mergedResults.length,
      verified: mergedResults.filter(r => r.status === 'verified').length,
      partial: mergedResults.filter(r => r.status === 'partial').length,
      notFound: mergedResults.filter(r => r.status === 'not_found').length,
      likelyFake: mergedResults.filter(r => r.status === 'likely_fake').length,
      duplicates: [...(existing.duplicates || []), ...incomingDuplicates],
    };
  }

  async function handleVerify(text: string) {
    loading = true;
    error = null;

    if (!addingMore) {
      results = null;
    }

    try {
      const res = await fetch(`${appConfig.apiUrl}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch {
          // Response wasn't JSON (e.g. nginx 502 HTML page)
        }
        throw new Error(msg);
      }

      const newResults: VerifyResponse = await res.json();

      if (results && addingMore) {
        results = mergeResults(results, newResults);
      } else {
        results = newResults;
      }

      addingMore = false;

      if (results) {
        addToHistory(text, results);
        history = getHistory();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al verificar las referencias';
    } finally {
      loading = false;
    }
  }

  function reset() {
    results = null;
    error = null;
    addingMore = false;
  }

  function loadFromHistory(entry: HistoryEntry) {
    results = entry.results;
    showHistory = false;
  }

  function handleDeleteEntry(id: string) {
    removeFromHistory(id);
    history = getHistory();
  }

  function handleClearHistory() {
    clearHistory();
    history = [];
    showHistory = false;
  }

  function downloadReport() {
    if (!results) return;
    const html = generateReport(results, appConfig.appName);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verificacion-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>{appConfig.appName} — Verificador de Referencias Bibliograficas</title>
</svelte:head>

<div class="space-y-8">
  <!-- Hero -->
  {#if !results && !addingMore}
    <div class="text-center space-y-4 py-6 animate-fade-in-up">
      <h1 class="font-display text-3xl sm:text-4xl font-bold text-text tracking-tight leading-tight">
        Verifica tu bibliografía
      </h1>
      <p class="text-text-muted max-w-xl mx-auto text-sm leading-relaxed">
        Pega tus referencias y {appConfig.appName} verificará si existen en bases de datos académicas
        como <span class="font-medium text-text">CrossRef</span>, <span class="font-medium text-text">OpenAlex</span>,
        <span class="font-medium text-text">Open Library</span>, <span class="font-medium text-text">Internet Archive</span>, entre otras.
        Además, te sugiere cómo formatearlas correctamente en APA, MLA, Chicago o Vancouver.
      </p>
    </div>
  {/if}

  <!-- Input (initial) -->
  {#if !results && !addingMore}
    <div class="animate-fade-in-up" style="animation-delay: 100ms; opacity: 0;">
      <BibliographyInput onsubmit={handleVerify} {loading} />
    </div>
  {/if}

  <!-- Add more input (shown above results when addingMore) -->
  {#if addingMore && results}
    <div class="animate-fade-in space-y-2">
      <div class="flex items-center justify-between">
        <p class="text-sm text-text-muted">Agrega más referencias para verificar:</p>
        <button
          onclick={() => { addingMore = false; }}
          class="text-xs text-text-light hover:text-text transition-colors"
        >
          Cancelar
        </button>
      </div>
      <BibliographyInput onsubmit={handleVerify} {loading} />
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="bg-fake-bg border border-fake/20 rounded p-4 text-sm text-fake animate-fade-in flex items-start gap-2.5">
      <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
      </svg>
      {error}
    </div>
  {/if}

  <!-- Results -->
  {#if results}
    <div class="space-y-5 animate-fade-in">
      <div class="flex items-center justify-between">
        <h2 class="font-display text-xl font-bold text-text">Resultados</h2>
        <div class="flex items-center gap-2">
          {#if !addingMore}
            <button
              onclick={() => { addingMore = true; }}
              class="text-sm text-text-muted hover:text-text font-medium px-3 py-1.5 rounded hover:bg-surface-warm border border-border transition-colors flex items-center gap-1.5"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Agregar referencias
            </button>
          {/if}
          <button
            onclick={downloadReport}
            class="text-sm text-text-muted hover:text-text font-medium px-3 py-1.5 rounded hover:bg-surface-warm border border-border transition-colors flex items-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Descargar informe
          </button>
          <button
            onclick={reset}
            class="text-sm text-accent hover:text-accent-light font-medium px-3 py-1.5 rounded hover:bg-accent/5 transition-colors flex items-center gap-1.5"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
            Nueva verificación
          </button>
        </div>
      </div>
      <ResultsTable data={results} />
    </div>
  {/if}

  <!-- History -->
  {#if !results && !loading && !addingMore && history.length > 0}
    <div class="border-t border-border-light pt-6 mt-2 animate-fade-in-up" style="animation-delay: 150ms; opacity: 0;">
      <div class="flex items-center justify-between mb-3">
        <button
          onclick={() => showHistory = !showHistory}
          class="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-text transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Verificaciones recientes ({history.length})
          <svg
            class="w-3.5 h-3.5 transition-transform duration-200 {showHistory ? 'rotate-180' : ''}"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        {#if showHistory}
          <button
            onclick={handleClearHistory}
            class="text-[11px] text-text-light hover:text-fake transition-colors"
          >
            Borrar historial
          </button>
        {/if}
      </div>

      {#if showHistory}
        <div class="space-y-1.5 animate-fade-in">
          {#each history as entry}
            <div class="flex items-center gap-2 bg-surface-card border border-border rounded px-3 py-2.5 hover:border-accent/30 transition-colors group">
              <button
                onclick={() => loadFromHistory(entry)}
                class="flex-1 min-w-0 text-left"
              >
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-text-light font-mono shrink-0">
                    {new Date(entry.timestamp).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span class="text-text-muted truncate">
                    {entry.results.totalReferences} ref{entry.results.totalReferences !== 1 ? 's' : ''} — {entry.results.verified} verificada{entry.results.verified !== 1 ? 's' : ''}
                  </span>
                </div>
                <p class="text-xs text-text-light truncate mt-0.5">
                  {entry.inputText.slice(0, 120)}{entry.inputText.length > 120 ? '...' : ''}
                </p>
              </button>
              <button
                onclick={() => handleDeleteEntry(entry.id)}
                class="shrink-0 p-1 text-text-light hover:text-fake opacity-0 group-hover:opacity-100 transition-all"
                title="Eliminar"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- How it works -->
  {#if !results && !loading && !addingMore}
    <div class="border-t border-border-light pt-8 mt-4 animate-fade-in-up" style="animation-delay: 200ms; opacity: 0;">
      <h3 class="font-display text-sm font-bold text-text mb-5 text-center tracking-wide uppercase">Cómo funciona</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-5 stagger">
        <div class="text-center space-y-2.5 animate-fade-in-up" style="opacity:0">
          <div class="w-9 h-9 rounded bg-accent/10 text-accent flex items-center justify-center mx-auto font-display font-bold text-sm">1</div>
          <p class="text-xs text-text-muted leading-relaxed">Pega tu bibliografía completa — numerada, con guiones o separada por líneas</p>
        </div>
        <div class="text-center space-y-2.5 animate-fade-in-up" style="opacity:0; animation-delay: 80ms">
          <div class="w-9 h-9 rounded bg-accent/10 text-accent flex items-center justify-center mx-auto font-display font-bold text-sm">2</div>
          <p class="text-xs text-text-muted leading-relaxed">Buscamos cada referencia en bases de datos académicas verificadas</p>
        </div>
        <div class="text-center space-y-2.5 animate-fade-in-up" style="opacity:0; animation-delay: 160ms">
          <div class="w-9 h-9 rounded bg-accent/10 text-accent flex items-center justify-center mx-auto font-display font-bold text-sm">3</div>
          <p class="text-xs text-text-muted leading-relaxed">Recibes un informe detallado y citas formateadas listas para usar</p>
        </div>
      </div>
    </div>

    <!-- Word Add-in section -->
    <div class="border-t border-border-light pt-8 mt-4 animate-fade-in-up" style="animation-delay: 300ms; opacity: 0;">
      <div class="bg-surface-card rounded border border-border p-6 text-center space-y-4">
        <div class="flex items-center justify-center gap-3">
          <svg class="w-7 h-7 text-[#2b579a]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 2H8.6c-.4 0-.8.2-.9.5L2.1 9.8c-.2.3-.1.7.1.9l5.6 5.6c.1.1.3.2.5.2h.1l7.1-1.4c.3-.1.5-.3.5-.6V2.5c0-.3-.2-.5-.5-.5zM14 13.1l-5.1 1L4.5 10l4.1-5.5H14v8.6z"/>
            <path d="M21.9 2H15.5v2h5.5v16h-5.5v2h6.4c.3 0 .6-.2.6-.5V2.5c0-.3-.3-.5-.6-.5z"/>
            <text x="6" y="13" font-size="7" font-weight="bold" fill="currentColor">W</text>
          </svg>
          <h3 class="font-display text-sm font-bold text-text">Plugin para Microsoft Word</h3>
        </div>
        <p class="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
          Verifica tus referencias directamente desde Word. Selecciona el texto en tu documento
          y {appConfig.appName} lo analiza sin salir del editor.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="{appConfig.apiUrl}/api/manifest"
            download="{appConfig.appName.toLowerCase().replace(/\s+/g, '-')}-manifest.xml"
            class="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-white bg-[#2b579a] hover:bg-[#1e3f6f] transition-colors"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            Descargar manifest.xml
          </a>
          <button
            onclick={() => showInstructions = !showInstructions}
            class="text-xs text-accent hover:text-accent-light font-medium transition-colors"
          >
            {showInstructions ? 'Ocultar instrucciones' : 'Ver instrucciones de instalación'}
          </button>
        </div>

        {#if showInstructions}
          <div class="text-left bg-surface-warm rounded p-4 text-xs text-text-muted space-y-2 mt-3 animate-slide-down">
            <p class="font-semibold text-text">Cómo instalar el plugin (sideload):</p>
            <ol class="list-decimal list-inside space-y-1.5">
              <li>Descarga el archivo <code class="bg-border/40 px-1.5 py-0.5 rounded text-text font-mono text-[11px]">manifest.xml</code></li>
              <li>Abre Word y ve a <strong>Insertar &rarr; Complementos &rarr; Mis complementos</strong></li>
              <li>Selecciona <strong>Cargar mi complemento</strong> (esquina inferior izquierda)</li>
              <li>Sube el archivo <code class="bg-border/40 px-1.5 py-0.5 rounded text-text font-mono text-[11px]">manifest.xml</code> descargado</li>
              <li>{appConfig.appName} aparecerá en la barra lateral de Word</li>
            </ol>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
