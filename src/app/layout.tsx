import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServiceOrigin } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getServiceOrigin()),
  title: {
    default: "AioLM — Local models. One workspace.",
    template: "%s · AioLM",
  },
  description:
    "AioLM is a desktop workspace for llama.cpp: discover GGUF models, manage runtimes, chat locally, and measure performance. Browse self-reported public benchmarks with their full setup.",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to main content</a>
        <SiteHeader />
        {/* tabIndex makes the skip link actually move focus, not just scroll.
            The global outline is :focus-visible only, so a click never shows it. */}
        <main id="main" tabIndex={-1}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
