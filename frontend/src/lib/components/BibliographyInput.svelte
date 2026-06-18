<script lang="ts">
  interface Props {
    onsubmit: (text: string) => void;
    loading: boolean;
  }

  let { onsubmit, loading }: Props = $props();
  let text = $state('');

  const sampleBibliography = `1. García, J., & López, M. (2019). Machine learning approaches for text classification in academic documents. Journal of Information Science, 45(3), 312-328. https://doi.org/10.1177/0165551518761012

2. Smith, R. K. (2021). The Complete Guide to Modern Web Development. O'Reilly Media. ISBN 978-1-492-05572-0

3. Johnson, A. B., & Williams, C. D. (2020). A fabricated study on quantum teleportation in neural networks. Fake Journal of Computer Science, 12(1), 45-67.

4. Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention is all you need. Advances in Neural Information Processing Systems, 30.`;

  function handleSubmit() {
    if (text.trim()) onsubmit(text.trim());
  }

  function loadSample() {
    text = sampleBibliography;
  }
</script>

<div class="space-y-3">
  <div class="relative group">
    <textarea
      bind:value={text}
      placeholder="Pega aquí tu bibliografía completa...&#10;&#10;Cada referencia puede estar numerada, con guiones, separada por líneas en blanco, o una por línea."
      rows="10"
      class="w-full px-4 py-3.5 rounded border border-border bg-surface-card text-text placeholder:text-text-light/60 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 resize-y text-sm leading-relaxed font-mono transition-all"
      disabled={loading}
    ></textarea>
    {#if !text.trim()}
      <button
        type="button"
        onclick={loadSample}
        class="absolute bottom-3 right-3 text-xs text-accent hover:text-accent-light font-medium px-2.5 py-1 rounded bg-surface-warm/80 hover:bg-surface-warm border border-border-light transition-all"
      >
        Cargar ejemplo
      </button>
    {/if}
  </div>

  <div class="flex items-center justify-between">
    <p class="text-[11px] text-text-light tracking-wide">
      APA · MLA · Chicago · Vancouver · Formato libre
    </p>
    <button
      onclick={handleSubmit}
      disabled={!text.trim() || loading}
      class="px-5 py-2.5 bg-primary text-white font-semibold rounded hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-sm"
    >
      {#if loading}
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Verificando...
      {:else}
        Verificar referencias
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
        </svg>
      {/if}
    </button>
  </div>
</div>
