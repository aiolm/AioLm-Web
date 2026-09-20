"use client";

import { useI18n } from '@/i18n/client';
import { localizedPath } from '@/i18n/config';
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "site.home" },
  { href: "/benchmarks", label: "site.benchmarks" },
  { href: "/manage", label: "site.manage" },
] as const;

/** Native locale-aware links with accessible current-page state. */
export function SiteNav(): React.JSX.Element {
  const pathname = usePathname();
  const { locale, t } = useI18n();

  return (
    <nav className="site-nav" aria-label={t('site.primary')}>
      {LINKS.map((link) => {
        const href = localizedPath(locale, link.href);
        const current =
          link.href === "/" ? pathname === href || pathname === href + "/" : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            className="site-nav-link"
            key={link.href}
            href={href}
            aria-current={current ? "page" : undefined}
          >
            {t(link.label)}
          </Link>
        );
      })}
    </nav>
  );
}
