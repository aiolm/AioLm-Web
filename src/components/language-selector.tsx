"use client";
import { useId } from 'react';
import { useI18n } from '@/i18n/client';
import { isLocale, localeCookie, locales, localizedPath } from '@/i18n/config';
const names = { en: 'English', ko: '한국어', ja: '日本語', zh: '简体中文' };
export function LanguageSelector() {
  const { locale, t } = useI18n();
  const id = useId();
  return <div className="language-selector">
    <label className="sr-only" htmlFor={id}>{t('site.language')}</label>
    <span className="sr-only" id={id + '-hint'}>{t('site.languageHint')}</span>
    <select id={id} name="locale" value={locale} aria-describedby={id + '-hint'} onChange={event => {
      const next = event.target.value;
      if (!isLocale(next)) return;
      try {
        document.cookie = localeCookie + '=' + next + '; Path=/; Max-Age=31536000; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
      } catch {
        // Navigation still works when the browser disallows preference storage.
      }
      // Full navigation refreshes server HTML and preserves sensitive fragments locally.
      window.location.assign(localizedPath(next, window.location.pathname + window.location.search + window.location.hash));
    }}>
      {locales.map(language => <option key={language} value={language} lang={language}>{names[language]}</option>)}
    </select>
  </div>;
}
