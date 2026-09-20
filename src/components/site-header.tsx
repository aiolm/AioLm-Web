import Image from "next/image";
import Link from "next/link";
import { GITHUB_REPOSITORY_URL, GitHubMark } from "@/components/site-links";
import { SiteNav } from "@/components/site-nav";

/**
 * Site-wide server-rendered header. SiteNav is a small client component that marks
 * the current route; all destinations remain native links.
 */
export function SiteHeader(): React.JSX.Element {
  return (
    <header className="site-header">
      <div className="site-shell site-header-inner">
        <Link className="site-brand" href="/">
          {/* Rendered at 32px; Next serves a 1x/2x pair from the 1254px source. */}
          <Image
            className="site-brand-mark"
            src="/brand/aio-monogram.png"
            alt=""
            width={32}
            height={32}
            priority
          />
          <span className="site-brand-name">AioLM</span>
        </Link>

        <SiteNav />

        <a className="site-header-github" href={GITHUB_REPOSITORY_URL}>
          <GitHubMark />
          <span>View on GitHub</span>
        </a>
      </div>
    </header>
  );
}
