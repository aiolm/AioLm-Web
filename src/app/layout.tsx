import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AioLM Benchmarks",
  description: "Anonymous public benchmark results: self-reported measurements, environment, and descriptions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link className="brand" href="/">AioLM Benchmarks</Link>
            <nav className="nav" aria-label="Primary">
              <Link href="/">Browse</Link>
              <Link href="/manage">Manage</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
