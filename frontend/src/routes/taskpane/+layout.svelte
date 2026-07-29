<script>
  import '@fontsource-variable/inter/wght.css'; // self-hosted Inter — no external CDN
  import '../../app.css';
  import { appConfig } from '$lib/config';
  import { getLang, setLang } from '$lib/i18n.svelte';
  let { children } = $props();
</script>

<svelte:head>
  <script src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"></script>
</svelte:head>

<div class="min-h-screen bg-surface p-4">
  <div class="flex items-center gap-2 mb-4 pb-3 border-b border-border">
    <svg class="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
    </svg>
    <span class="text-sm font-bold text-text">{appConfig.appName}</span>
    <button
      onclick={() => setLang(getLang() === 'en' ? 'es' : 'en')}
      class="ml-auto flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text border border-border rounded px-1.5 py-0.5 transition-colors"
      title="English / Español"
      aria-label="Toggle language"
    >
      {getLang() === 'en' ? 'EN' : 'ES'}
    </button>
  </div>
  {@render children()}
</div>
