import Image from "next/image";
import { GITHUB_DOCS_URL, GITHUB_LICENSE_URL, GITHUB_REPOSITORY_URL } from "@/components/site-links";

/**
 * Site-wide footer. Every destination is a real project URL; there is no
 * community link, no invented copyright line and no release or download link.
 */
export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer-inner">
        <div className="site-footer-identity">
          <Image
            className="site-footer-mark"
            src="/brand/aio-monogram.png"
            alt=""
            width={28}
            height={28}
          />
          <span className="site-footer-name">AioLM</span>
          <span className="site-footer-tagline">A desktop workspace for llama.cpp local language models.</span>
        </div>

        <nav className="site-footer-links" aria-label="Project">
          <a href={GITHUB_REPOSITORY_URL}>GitHub</a>
          <a href={GITHUB_DOCS_URL}>Documentation</a>
          <a href={GITHUB_LICENSE_URL}>MIT licensed</a>
        </nav>
      </div>
    </footer>
  );
}
