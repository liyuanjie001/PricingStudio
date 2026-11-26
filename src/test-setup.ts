import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Isolate browser storage from Node 25's experimental native localStorage.
const entries = new Map<string,string>();
vi.stubGlobal('localStorage', {
  get length() { return entries.size; },
  clear: () => entries.clear(),
  getItem: (key: string) => entries.get(key) ?? null,
  key: (index: number) => [...entries.keys()][index] ?? null,
  removeItem: (key: string) => { entries.delete(key); },
  setItem: (key: string, value: string) => { entries.set(key, String(value)); },
} satisfies Storage);
