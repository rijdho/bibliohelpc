<script>
  import '../app.css';
  import { base } from '$app/paths';
  import { appConfig } from '$lib/config';
  import { t, getLang, setLang } from '$lib/i18n.svelte';
  let { children } = $props();
</script>

<div class="relative min-h-screen flex flex-col">
  <!-- Header -->
  <header class="border-b border-border bg-surface-card/90 backdrop-blur-sm sticky top-0 z-50">
    <div class="max-w-3xl mx-auto px-6 py-3.5 flex items-center justify-between">
      <a href="{base}/" class="flex items-center gap-2.5 group" data-sveltekit-reload>
        <div class="w-8 h-8 rounded bg-primary flex items-center justify-center transition-all group-hover:rounded-lg">
          <svg class="w-4.5 h-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <div>
          <span class="font-display text-base font-bold text-text tracking-tight">{appConfig.appName}</span>
        </div>
      </a>
      <div class="flex items-center gap-3">
        <span class="text-xs text-text-light tracking-wide uppercase">{t('nav.tagline')}</span>
        <button
          onclick={() => setLang(getLang() === 'en' ? 'es' : 'en')}
          class="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-text border border-border rounded px-2 py-1 transition-colors"
          title="English / Español"
          aria-label="Toggle language"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/>
          </svg>
          {getLang() === 'en' ? 'EN' : 'ES'}
        </button>
      </div>
    </div>
  </header>

  <!-- Main -->
  <main class="flex-1 max-w-3xl mx-auto w-full px-6 py-8 relative z-10">
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="border-t border-border-light py-5 text-center relative z-10">
    <p class="text-xs text-text-light">
      {@html appConfig.footerHtml}
    </p>
  </footer>
</div>
