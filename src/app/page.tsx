import { BenchmarkBrowser } from "@/components/benchmark-browser";

export const dynamic = "force-dynamic";

export default function Home(): React.JSX.Element {
  return (
    <div className="grid">
      <section aria-labelledby="page-title">
        <h1 id="page-title">Public benchmark results</h1>
        <p className="muted">
          Self-reported measurements published anonymously from the app. Filter by model, hardware,
          method, or workload. There is no combined leaderboard; configurations differ.
        </p>
      </section>
      <BenchmarkBrowser />
    </div>
  );
}
