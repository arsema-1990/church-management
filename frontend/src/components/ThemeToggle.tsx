import { translateText } from '../i18n/context';
import { useEffect, useState } from 'react';

export function ThemeToggle({ compact = false }: { compact?: boolean } = {}) {
  const [dark, setDark] = useState(() => localStorage.getItem('cms-theme') === 'dark');

  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cms-theme', theme);
  }, [dark]);

  return (
    <button type="button" className={`theme-toggle${compact ? ' theme-toggle-compact' : ''}`} onClick={() => setDark(value => !value)} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} title={dark ? translateText("Light mode") : translateText("Dark mode")}>
      {compact ? (dark ? '☀' : '☾') : dark ? translateText("Light mode") : translateText("Dark mode")}
    </button>
  );
}
