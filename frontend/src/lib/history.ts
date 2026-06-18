import type { VerifyResponse } from '@bibliohelp/shared';

export interface HistoryEntry {
  id: string;
  timestamp: number;
  inputText: string;
  results: VerifyResponse;
}

const STORAGE_KEY = 'bibliohelpc_history';
const MAX_ENTRIES = 10;

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToHistory(inputText: string, results: VerifyResponse): void {
  const history = getHistory();
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    inputText,
    results,
  };
  history.unshift(entry);
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function removeFromHistory(id: string): void {
  const history = getHistory().filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
