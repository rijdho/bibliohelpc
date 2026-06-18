/**
 * Dependency-free i18n for BiblioHelp (EN/ES).
 * Module-level $state requires the `.svelte.ts` extension.
 *
 * Language is auto-detected from localStorage → navigator.language → 'en',
 * and persisted on change. `t()` reads the reactive `current`, so any markup
 * that calls it re-renders when the language changes.
 */

export type Lang = 'en' | 'es';

const STORAGE_KEY = 'bh-lang';

function detect(): Lang {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')) {
    return 'es';
  }
  return 'en';
}

let current = $state<Lang>(detect());

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  current = l;
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, l);
}

export function toggleLang(): void {
  setLang(current === 'en' ? 'es' : 'en');
}

/** 'es-CL' / 'en-US' for Intl date formatting. */
export function dateLocale(): string {
  return current === 'es' ? 'es-CL' : 'en-US';
}

type Dict = Record<string, string>;

const strings: Record<Lang, Dict> = {
  es: {
    // Layout / nav
    'nav.tagline': 'Verificador de referencias',
    // Page head + hero
    'page.titleSuffix': 'Verificador de Referencias Bibliográficas',
    'hero.title': 'Verifica tu bibliografía',
    'hero.desc1': 'Pega tus referencias y',
    'hero.desc2': 'verificará si existen en bases de datos académicas como',
    'hero.desc3': ', entre otras. Además, te sugiere cómo formatearlas correctamente en APA, MLA, Chicago o Vancouver.',
    // Add more / actions
    'addMore.prompt': 'Agrega más referencias para verificar:',
    'common.cancel': 'Cancelar',
    'common.copy': 'Copiar',
    'common.copied': 'Copiado',
    'results.title': 'Resultados',
    'actions.addRefs': 'Agregar referencias',
    'actions.download': 'Descargar informe',
    'actions.newVerification': 'Nueva verificación',
    'error.verify': 'Error al verificar las referencias',
    // History
    'history.recent': 'Verificaciones recientes',
    'history.clear': 'Borrar historial',
    'history.delete': 'Eliminar',
    'history.ref': 'ref|refs',
    'history.verified': 'verificada|verificadas',
    // How it works
    'how.title': 'Cómo funciona',
    'how.step1': 'Pega tu bibliografía completa — numerada, con guiones o separada por líneas',
    'how.step2': 'Buscamos cada referencia en bases de datos académicas verificadas',
    'how.step3': 'Recibes un informe detallado y citas formateadas listas para usar',
    // Word add-in section
    'word.title': 'Plugin para Microsoft Word',
    'word.desc1': 'Verifica tus referencias directamente desde Word. Selecciona el texto en tu documento y',
    'word.desc2': 'lo analiza sin salir del editor.',
    'word.download': 'Descargar manifest.xml',
    'word.toggleShow': 'Ver instrucciones de instalación',
    'word.toggleHide': 'Ocultar instrucciones',
    'word.howTitle': 'Cómo instalar el plugin (sideload):',
    'word.step1pre': 'Descarga el archivo',
    'word.step1post': '',
    'word.step2pre': 'Abre Word y ve a',
    'word.step2menu': 'Insertar → Complementos → Mis complementos',
    'word.step3pre': 'Selecciona',
    'word.step3strong': 'Cargar mi complemento',
    'word.step3post': '(esquina inferior izquierda)',
    'word.step4pre': 'Sube el archivo',
    'word.step4post': 'descargado',
    'word.step5post': 'aparecerá en la barra lateral de Word',
    // Bibliography input
    'input.placeholder': 'Pega aquí tu bibliografía completa...\n\nCada referencia puede estar numerada, con guiones, separada por líneas en blanco, o una por línea.',
    'input.loadSample': 'Cargar ejemplo',
    'input.formats': 'APA · MLA · Chicago · Vancouver · Formato libre',
    'input.verifying': 'Verificando...',
    'input.verify': 'Verificar referencias',
    // Status badge
    'status.verified': 'Verificado',
    'status.partial': 'Parcial',
    'status.notFound': 'No encontrado',
    'status.likelyFake': 'Probablemente falsa',
    // Citation block
    'cite.title': 'Citas sugeridas',
    'cite.ref': 'referencia|referencias',
    'cite.copyAll': 'Copiar todo',
    'tpcite.title': 'Cita sugerida',
    'tpcite.insert': 'Insertar en Word',
    'tpcite.inserted': 'Insertado',
    // Results table
    'summary.total': 'Total',
    'summary.verified': 'Verificadas',
    'summary.partial': 'Parciales',
    'summary.notFound': 'No encontradas',
    'dup.title': 'Posibles duplicados detectados',
    'dup.refsLabel': 'Referencias',
    'dup.sameSource': 'parecen ser la misma fuente',
    'dup.similarity': 'similitud',
    'fields.title': 'Título',
    'fields.authors': 'Autores',
    'fields.year': 'Año',
    'matches.title': 'Coincidencias',
    'matches.suggestion': 'Sugerencia:',
    'matches.viewSource': 'Ver fuente',
    // Taskpane
    'tp.officeNotReady': 'Office.js no está listo. Asegúrate de abrir esto desde Word.',
    'tp.noSelection': 'No hay texto seleccionado en el documento.',
    'tp.readError': 'Error al leer la selección',
    'tp.verifyError': 'Error al verificar',
    'tp.instruction': 'Selecciona las referencias en tu documento de Word y haz clic en el botón para verificarlas.',
    'tp.readAndVerify': 'Leer selección y verificar',
    'tp.partialShort': 'Parcial',
    'tp.noShort': 'No',
    // Report (downloadable HTML)
    'report.title': 'Informe de verificación bibliográfica',
    'report.generatedBy': 'Generado por',
    'report.on': 'el',
    'report.detail': 'Detalle por referencia',
    'report.bestMatch': 'Mejor coincidencia',
    'report.duplicates': 'Posibles duplicados',
    'report.footer': 'Verificación automática de referencias bibliográficas',
    'report.statusVerified': 'Verificada',
    'report.statusPartial': 'Parcial',
    'report.statusNotFound': 'No encontrada',
    'report.fileName': 'verificacion',
  },
  en: {
    'nav.tagline': 'Reference verifier',
    'page.titleSuffix': 'Bibliographic Reference Verifier',
    'hero.title': 'Verify your bibliography',
    'hero.desc1': 'Paste your references and',
    'hero.desc2': 'will check whether they exist in academic databases such as',
    'hero.desc3': ', among others. It also suggests how to format them correctly in APA, MLA, Chicago, or Vancouver.',
    'addMore.prompt': 'Add more references to verify:',
    'common.cancel': 'Cancel',
    'common.copy': 'Copy',
    'common.copied': 'Copied',
    'results.title': 'Results',
    'actions.addRefs': 'Add references',
    'actions.download': 'Download report',
    'actions.newVerification': 'New verification',
    'error.verify': 'Error verifying the references',
    'history.recent': 'Recent verifications',
    'history.clear': 'Clear history',
    'history.delete': 'Delete',
    'history.ref': 'ref|refs',
    'history.verified': 'verified|verified',
    'how.title': 'How it works',
    'how.step1': 'Paste your full bibliography — numbered, with dashes, or separated by lines',
    'how.step2': 'We search each reference in verified academic databases',
    'how.step3': 'You get a detailed report and ready-to-use formatted citations',
    'word.title': 'Microsoft Word add-in',
    'word.desc1': 'Verify your references directly from Word. Select the text in your document and',
    'word.desc2': 'analyzes it without leaving the editor.',
    'word.download': 'Download manifest.xml',
    'word.toggleShow': 'View installation instructions',
    'word.toggleHide': 'Hide instructions',
    'word.howTitle': 'How to install the add-in (sideload):',
    'word.step1pre': 'Download the',
    'word.step1post': 'file',
    'word.step2pre': 'Open Word and go to',
    'word.step2menu': 'Insert → Add-ins → My Add-ins',
    'word.step3pre': 'Select',
    'word.step3strong': 'Upload My Add-in',
    'word.step3post': '(bottom-left corner)',
    'word.step4pre': 'Upload the downloaded',
    'word.step4post': 'file',
    'word.step5post': 'will appear in the Word sidebar',
    'input.placeholder': 'Paste your full bibliography here...\n\nEach reference can be numbered, dashed, separated by blank lines, or one per line.',
    'input.loadSample': 'Load example',
    'input.formats': 'APA · MLA · Chicago · Vancouver · Free-form',
    'input.verifying': 'Verifying...',
    'input.verify': 'Verify references',
    'status.verified': 'Verified',
    'status.partial': 'Partial',
    'status.notFound': 'Not found',
    'status.likelyFake': 'Likely fabricated',
    'cite.title': 'Suggested citations',
    'cite.ref': 'reference|references',
    'cite.copyAll': 'Copy all',
    'tpcite.title': 'Suggested citation',
    'tpcite.insert': 'Insert into Word',
    'tpcite.inserted': 'Inserted',
    'summary.total': 'Total',
    'summary.verified': 'Verified',
    'summary.partial': 'Partial',
    'summary.notFound': 'Not found',
    'dup.title': 'Possible duplicates detected',
    'dup.refsLabel': 'References',
    'dup.sameSource': 'appear to be the same source',
    'dup.similarity': 'similarity',
    'fields.title': 'Title',
    'fields.authors': 'Authors',
    'fields.year': 'Year',
    'matches.title': 'Matches',
    'matches.suggestion': 'Suggestion:',
    'matches.viewSource': 'View source',
    'tp.officeNotReady': 'Office.js is not ready. Make sure you open this from Word.',
    'tp.noSelection': 'No text is selected in the document.',
    'tp.readError': 'Error reading the selection',
    'tp.verifyError': 'Verification error',
    'tp.instruction': 'Select the references in your Word document and click the button to verify them.',
    'tp.readAndVerify': 'Read selection and verify',
    'tp.partialShort': 'Partial',
    'tp.noShort': 'No',
    'report.title': 'Bibliographic verification report',
    'report.generatedBy': 'Generated by',
    'report.on': 'on',
    'report.detail': 'Detail by reference',
    'report.bestMatch': 'Best match',
    'report.duplicates': 'Possible duplicates',
    'report.footer': 'Automated bibliographic reference verification',
    'report.statusVerified': 'Verified',
    'report.statusPartial': 'Partial',
    'report.statusNotFound': 'Not found',
    'report.fileName': 'verification',
  },
};

export function t(key: string): string {
  return strings[current][key] ?? strings.en[key] ?? key;
}

/** Pick singular/plural from a "singular|plural" dict entry by count. */
export function plural(n: number, key: string): string {
  const raw = strings[current][key] ?? strings.en[key] ?? '';
  const [one, many] = raw.split('|');
  return n === 1 ? one : (many ?? one);
}
