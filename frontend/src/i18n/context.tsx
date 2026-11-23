import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import enRaw from './locales/en.json';
import amRaw from './locales/am.json';

type Language = 'en' | 'am';

/**
 * Flatten a nested JSON object into a single-level key→value map.
 * Namespace keys are exposed two ways:
 *   1. "manager.Dashboard"  (namespaced — preferred for new code)
 *   2. "Dashboard"          (flat — backward-compatible with legacy t() calls)
 *
 * When two namespaces share the same leaf key, the last one wins for the flat form,
 * but namespace-qualified lookups are always exact.
 */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_meta' || !k.trim()) continue;
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out[full] = v;       // namespaced key  e.g. "manager.Dashboard"
      if (k.trim() && !(k in out)) {
        out[k] = v;        // flat key        e.g. "Dashboard"  (backward compat)
      }
    } else if (typeof v === 'object' && v !== null) {
      const nested = flatten(v as Record<string, unknown>, full);
      for (const [nk, nv] of Object.entries(nested)) {
        if (!nk.trim()) continue;
        out[nk] = nv;
      }
    }
  }
  delete out[''];
  return out;
}

const en = flatten(enRaw as Record<string, unknown>);
const am = flatten(amRaw as Record<string, unknown>);

const translations: Record<Language, Record<string, string>> = { en, am };
let activeLanguage: Language = typeof window !== 'undefined' && window.sessionStorage.getItem('church-language') === 'am' ? 'am' : 'en';

/** Translate static JSX text and accessible form labels using the same catalog as t(). */
export function translateText(value: string): string {
  if (activeLanguage !== 'am' || !value) return value;
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const key = value.trim().replace(/\s+/g, ' ');
  if (!key) return value;

  // Direct match first (handles full sentences, keys with punctuation/quotes)
  if (key in am && am[key]) {
    return `${leading}${am[key]}${trailing}`;
  }

  // If text starts with punctuation or symbol (e.g. "• Worship"), strip prefix and translate core phrase
  const prefix = key.match(/^[\p{P}\p{S}\s]+/u)?.[0] ?? '';
  const plainKey = key.slice(prefix.length).trim();
  if (plainKey && plainKey in am && am[plainKey]) {
    return `${leading}${prefix}${am[plainKey]}${trailing}`;
  }

  return value;
}

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (v: Language) => void;
  t: (key: string) => string;
}>({ language: 'en', setLanguage: () => undefined, t: key => key });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(
    () => (sessionStorage.getItem('church-language') === 'am' ? 'am' : 'en'),
  );
  const value = useMemo(() => ({
    language,
    setLanguage: (next: Language) => {
      activeLanguage = next;
      sessionStorage.setItem('church-language', next);
      setLanguage(next);
    },
    t: (key: string) => translations[language][key] ?? translations['en'][key] ?? key,
  }), [language]);
  useEffect(() => {
    document.documentElement.lang = language === 'am' ? 'am' : 'en';
  }, [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
