import type { Locale } from '@/i18n/config';
import { localizedPath } from '@/i18n/config';
import type { Translator } from '@/i18n/types';
import { LanguageSelector } from './language-selector';
import Link from "next/link";
import { GITHUB_REPOSITORY_URL, GitHubMark } from "@/components/site-links";
import { SiteNav } from "@/components/site-nav";

/**
 * Site-wide server-rendered header. SiteNav is a small client component that marks
 * the current route; all destinations remain native links.
 */
export function SiteHeader({ locale, t }: { locale: Locale; t: Translator }): React.JSX.Element {
  return (
    <header className="site-header">
      <div className="site-shell site-header-inner">
        <Link className="site-brand" href={localizedPath(locale, '/')}>
          <span className="site-brand-mark themed-brand-mark" aria-hidden="true" />
          <span className="site-brand-name">AioLM</span>
        </Link>

        <SiteNav />

        <a className="site-header-github" href={GITHUB_REPOSITORY_URL}>
          <GitHubMark />
          <span>{t('site.github')}</span>
        </a>
        <LanguageSelector />
      </div>
    </header>
  );
}
