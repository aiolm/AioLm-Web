import { describe, expect, it } from "vitest";
import { validatePublicBenchmark } from "@aiolm/benchmark-contracts";
import { syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";

describe("CPU topology in public benchmark summaries", () => {
  it("keeps physical cores distinct from logical threads through publication and summarization", () => {
    const benchmark = syntheticSubmission();
    benchmark.environment!.cpu = { name: "Synthetic CPU", physical_cores: 8, logical_cores: 16 };
    const validated = validatePublicBenchmark(benchmark);
    expect(summarizeBenchmark(validated).setup).toMatchObject({
      cpu: "Synthetic CPU", physical_cores: 8, cores: 16,
    });
  });

  it("accepts old publications without inventing their physical core count", () => {
    const benchmark = syntheticSubmission();
    benchmark.environment!.cpu = { name: "Legacy CPU", logical_cores: 16 };
    const validated = validatePublicBenchmark(benchmark);
    expect(summarizeBenchmark(validated).setup).toMatchObject({ physical_cores: null, cores: 16 });
  });

  it("preserves an explicitly unknown physical count", () => {
    const benchmark = syntheticSubmission();
    benchmark.environment!.cpu = { name: "Synthetic CPU", physical_cores: null, logical_cores: 16 };
    expect(summarizeBenchmark(validatePublicBenchmark(benchmark)).setup).toMatchObject({
      physical_cores: null, cores: 16,
    });
  });
});
