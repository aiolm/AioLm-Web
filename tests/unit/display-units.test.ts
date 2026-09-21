import { describe, expect, it } from "vitest";
import { formatLatency, formatLatencySpread, formatVramGb, runtimeVersionLabel } from "@/components/benchmark-explorer-format";
import { buildRowColumns } from "@/components/benchmark-detail-rows";

describe("shared display conventions", () => {
  it("shows a reported llama.cpp release and labels legacy build-only data honestly", () => {
    expect(runtimeVersionLabel("0.3.0-dev (build 10638, commit abc123)", "b10638")).toBe("0.3.0-dev");
    expect(runtimeVersionLabel("version: 0.4.1 (build 123)\ncompiler: test")).toBe("0.4.1");
    expect(runtimeVersionLabel(null, "b123")).toBe("build 123");
    expect(runtimeVersionLabel("b123-abcdef")).toBe("build 123-abcdef");
    expect(runtimeVersionLabel(null, null)).toBeNull();
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
