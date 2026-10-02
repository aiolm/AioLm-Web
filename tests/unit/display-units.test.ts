import { describe, expect, it } from "vitest";
import { formatLatency, formatLatencySpread, formatVramGb, runtimeVersionLabel } from "@/components/benchmark-explorer-format";
import { buildRowColumns } from "@/components/benchmark-detail-rows";

describe("shared display conventions", () => {
  it("labels a llama.cpp runtime as version(build), with ? for the missing half", () => {
    const llama = (version: unknown, build?: unknown) => runtimeVersionLabel({ name: "llama.cpp", version, build });
    expect(llama("0.3.0-dev", "b10638")).toBe("0.3.0-dev(10638)");
    expect(llama("0.3.0-dev", 10638)).toBe("0.3.0-dev(10638)");
    // The build the reported banner names is the one that ran; a stale fallback never replaces it.
    expect(llama("version: 0.3.0-dev (build 10638, commit abc1234)", "b10600")).toBe("0.3.0-dev(10638)");
    expect(llama("version: 0.4.1 (build 123)\ncompiler: test")).toBe("0.4.1(123)");
    expect(llama("0.3.0-dev")).toBe("0.3.0-dev(?)");
    expect(llama(null, "b10638")).toBe("?(10638)");
    expect(llama("b4589-abcdef")).toBe("?(4589)");
    // Build 0 is llama.cpp's no-git sentinel, so a local or PR build keeps its own id.
    expect(llama("0.0.0-dev (build 0, commit unknown)", "pr12345")).toBe("0.0.0-dev(pr12345)");
    expect(llama(null, null)).toBeNull();
    expect(runtimeVersionLabel(null)).toBeNull();
  });
  it("keeps distinct llama.cpp builds of one release apart", () => {
    const label = (build: string) => runtimeVersionLabel({ name: "llama.cpp", version: "0.3.0-dev", build });
    expect(label("b10638")).not.toBe(label("b10640"));
  });
  it("keeps other engines version text as reported and never applies llama.cpp parsing", () => {
    expect(runtimeVersionLabel({ name: "vllm", version: "0.6.2", build: null })).toBe("0.6.2");
    expect(runtimeVersionLabel({ name: "vllm", version: "0.6.2", build: "abc123" })).toBe("0.6.2(abc123)");
    expect(runtimeVersionLabel({ name: "MLX", version: "mlx-lm 0.21.0 (build 5)", build: "b7" })).toBe("mlx-lm 0.21.0 (build 5)(b7)");
    // An unnamed runtime is not assumed to be llama.cpp.
    expect(runtimeVersionLabel({ name: null, version: "version: 0.3.0-dev (build 10638, commit abc)" })).toBe("version: 0.3.0-dev (build 10638, commit abc)");
    expect(runtimeVersionLabel({ version: "b4589" })).toBe("b4589");
  });
  it("reads non-text runtime fields as absent", () => {
    expect(runtimeVersionLabel({ name: "llama.cpp", version: 3, build: { id: 1 } })).toBeNull();
  });
  it("scales integrated and discrete GPU memory with the same binary units", () => {
    expect(formatVramGb(512)).toBe("512.0 MiB");
    expect(formatVramGb(24576)).toBe("24.00 GiB");
    expect(formatVramGb(0)).toBe("0 B");
  });
  it("keeps small latency values in milliseconds across summaries and individual rows", () => {
    expect(formatLatency(0.4)).toBe("0.4");
    expect(formatLatencySpread({median:0.4,min:0.2,max:0.6})).toBe("0.2–0.6");
    const columns = buildRowColumns([{ttft_ms:620,tpot_ms:0.4,e2e_ms:2560}], true);
    expect(columns.find(c=>c.key==="ttft_ms")).toMatchObject({unit:"ms"});
    expect(columns.find(c=>c.key==="tpot_ms")?.format(0.4)).toBe("0.4");
    expect(columns.find(c=>c.key==="e2e_ms")).toMatchObject({unit:"s"});
  });
});
