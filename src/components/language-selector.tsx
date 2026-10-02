"use client";
import { useId } from 'react';
import { useI18n } from '@/i18n/client';
import { isLocale, localeCookie, locales, localizedPath } from '@/i18n/config';
import { UiSelect } from './ui-select';
const names = { en: 'English', ko: '한국어', ja: '日本語', zh: '简体中文' };
export function LanguageSelector() {
  const { locale, t } = useI18n();
  const id = useId();
  return <div className="language-selector">
    <svg className="language-selector-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.4" /><ellipse cx="10" cy="10" rx="3" ry="7.25" stroke="currentColor" strokeWidth="1.4" /><path d="M3 7.5h14M3 12.5h14" stroke="currentColor" strokeWidth="1.4" /></svg>
    <label className="sr-only" id={id + '-label'} htmlFor={id}>{t('site.language')}</label>
    <span className="sr-only" id={id + '-hint'}>{t('site.languageHint')}</span>
    <UiSelect id={id} name="locale" value={locale} labelledBy={id + '-label'} describedBy={id + '-hint'}
      options={locales.map(language => ({ value: language, label: names[language], lang: language }))} onChange={next => {
      if (!isLocale(next)) return;
      try {
        document.cookie = localeCookie + '=' + next + '; Path=/; Max-Age=31536000; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
      } catch {
        // Navigation still works when the browser disallows preference storage.
      }
      // Full navigation refreshes server HTML and preserves sensitive fragments locally.
      window.location.assign(localizedPath(next, window.location.pathname + window.location.search + window.location.hash));
    }} />
  </div>;
}
