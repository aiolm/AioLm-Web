"use client";
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './config';
import type { MessageCatalog, Translator } from './types';
import { createTranslator } from './translate';
type Context = { locale: Locale; messages: MessageCatalog; t: Translator };
const I18nContext = createContext<Context | null>(null);
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: MessageCatalog; children: ReactNode }) {
  const parent = useContext(I18nContext);
  const value = useMemo(() => {
    const merged = { ...parent?.messages, ...messages };
    return { locale: parent?.locale ?? locale, messages: merged, t: createTranslator(merged) };
  }, [parent, locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n(): { locale: Locale; t: Translator } {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n requires I18nProvider');
  return context;
}
