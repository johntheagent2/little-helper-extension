import { useEffect, useState } from 'react';
import { getStore, subscribeToStore } from './storage';
import type { TextStore } from './types';

/** React hook that keeps a component in sync with the TextStore, live. */
export function useTextStore(): TextStore | null {
  const [store, setStore] = useState<TextStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStore().then((s) => {
      if (!cancelled) setStore(s);
    });
    const unsubscribe = subscribeToStore((next) => {
      if (!cancelled) setStore(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return store;
}
