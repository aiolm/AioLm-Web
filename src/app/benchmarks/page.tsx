import type { Metadata } from "next";
import { Suspense } from "react";
import { BenchmarkBrowser } from "@/components/benchmark-browser";

export const metadata: Metadata = {
  title: "Benchmark explorer",
  description:
    "Explore self-reported AioLM benchmark results with the hardware, workload and measurement method they were produced with.",
};

export default function BenchmarksPage(): React.JSX.Element {
  return (
    <div className="site-shell page">
      <div className="page-intro">
        <div className="page-intro-copy">
          <h1 className="page-title">Benchmark explorer</h1>
          <p className="page-subtitle">
            Explore community results with their hardware, workload and measurement method.
          </p>
        </div>
        <p className="page-intro-note">Self-reported results</p>
      </div>
      <noscript>Enable JavaScript to load, filter and compare published benchmarks.</noscript>
      <Suspense fallback={<p role="status">Loading benchmark explorer…</p>}>
        <BenchmarkBrowser />
      </Suspense>
    </div>
  );
}
