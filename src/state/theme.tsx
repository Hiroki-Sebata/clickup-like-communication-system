/**
 * Light or dark. Follows the system setting unless the person picks one, and the
 * choice is remembered on this device.
 */
import { useCallback, useEffect, useState } from 'react';
import { storage } from '../lib/storage';

export type ThemeChoice = 'light' | 'dark' | 'system';

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => storage.getTheme() ?? 'system');

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    storage.setTheme(choice);
  }, [choice]);

  /** Click order: system -> light -> dark -> system. */
  const cycle = useCallback(() => {
    setChoice((c) => (c === 'system' ? 'light' : c === 'light' ? 'dark' : 'system'));
  }, []);

  return { choice, setChoice, cycle };
}
