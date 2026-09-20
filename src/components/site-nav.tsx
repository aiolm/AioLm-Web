"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/manage", label: "Manage" },
] as const;

/**
 * Primary navigation. The only client component in the site shell, and only so
 * that the current page carries aria-current — which is what both the
 * highlighted state and screen reader announcement depend on.
 */
export function SiteNav(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="Primary">
      {LINKS.map((link) => {
        const current =
          link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            className="site-nav-link"
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
