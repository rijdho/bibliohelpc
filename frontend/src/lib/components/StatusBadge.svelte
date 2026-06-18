<script lang="ts">
  import type { VerificationStatus } from '@bibliohelp/shared';

  interface Props {
    status: VerificationStatus;
    score: number;
  }

  let { status, score }: Props = $props();

  const config = $derived({
    verified: { label: 'Verificado', bg: 'bg-verified-bg', text: 'text-verified', border: 'border-verified/25' },
    partial: { label: 'Parcial', bg: score >= 60 ? 'bg-partial-bg' : 'bg-warning-bg', text: score >= 60 ? 'text-partial' : 'text-warning', border: score >= 60 ? 'border-partial/25' : 'border-warning/25' },
    not_found: { label: 'No encontrado', bg: 'bg-fake-bg', text: 'text-fake', border: 'border-fake/25' },
    likely_fake: { label: 'Probablemente falsa', bg: 'bg-fake-bg', text: 'text-fake', border: 'border-fake/25' },
  }[status]);
</script>

<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border {config.bg} {config.text} {config.border}">
  {#if status === 'verified'}
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
  {:else if status === 'partial'}
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01"/></svg>
  {:else}
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
  {/if}
  {config.label}
  <span class="opacity-60 font-mono text-[10px]">{score}%</span>
</span>
