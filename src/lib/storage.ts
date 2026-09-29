// Typed wrapper around chrome.storage.local, used by popup, options, and the
// content script alike. Single source of truth (see docs/design/phase1-design.md §4).

import { STORAGE_KEY } from '@/shared/constants';
import { createEmptyStore, CURRENT_SCHEMA_VERSION, type TextStore } from './types';

export async function getStore(): Promise<TextStore> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY] as TextStore | undefined;
  if (!raw) return createEmptyStore();
  return migrate(raw);
}

export async function setStore(store: TextStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}

/** Read-modify-write helper. `updater` receives the current store and returns the next one. */
export async function updateStore(
  updater: (current: TextStore) => TextStore
): Promise<TextStore> {
  const current = await getStore();
  const next = updater(current);
  await setStore(next);
  return next;
}

/** Subscribe to live changes from any surface (popup/options/content script). */
export function subscribeToStore(callback: (store: TextStore) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    callback(migrate(change.newValue as TextStore));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** Placeholder for future schema migrations (Phase 2+). No-op today since v1 is current. */
function migrate(store: TextStore): TextStore {
  if (store.schemaVersion === CURRENT_SCHEMA_VERSION) return store;
  // Future versions: switch on store.schemaVersion and upgrade step by step.
  return { ...store, schemaVersion: CURRENT_SCHEMA_VERSION };
}
