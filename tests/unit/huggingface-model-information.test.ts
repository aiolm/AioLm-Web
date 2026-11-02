import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelInformationEvidence } from "@/lib/model-information";
import { createHuggingFaceModelInformationLookup } from "@/server/huggingface-model-information";

const HASH = "a".repeat(64);
const REVISION = "b".repeat(40);
const evidence = (overrides: Partial<ModelInformationEvidence> = {}): ModelInformationEvidence => ({
  sha256: HASH, size_bytes: 1234,
  name: "example-model", repository: null, format: "gguf", ...overrides,
});
const file = (overrides = {}) => ({ rfilename: "weights.gguf", size: 1234, lfs: { sha256: HASH, size: 1234 }, ...overrides });
const model = (id: string, siblings = [file()], cardData: unknown = {}) => ({ id, private: false, sha: REVISION, siblings, cardData });
const json = (value: unknown) => Response.json(value);

afterEach(() => vi.useRealTimers());

describe("public Hugging Face model information lookup", () => {
  it("discovers candidates by name but retains every independently pinned byte match", async () => {
    const calls: Array<{ url: URL; init: RequestInit | undefined }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname === "/api/models") return json([{ id: "mirror/model" }, { id: "source/model" }, { id: "mirror/model" }]);
      const repo = url.pathname.includes("/mirror/") ? "mirror/model" : "source/model";
      return json(model(repo, [file(), file({ rfilename: "copy.gguf" }), file({ rfilename: "README.md", lfs: undefined })], {
        base_model: ["upstream/base", "https://unsafe.example/base"], license: ["apache-2.0", "mit"],
        license_name: "Declared license", quantized_by: repo === "source/model" ? "Explicit Quantizer" : undefined,
      }));
    });
    const lookup = createHuggingFaceModelInformationLookup({ fetch: fetcher });
    const result = await lookup(evidence());
    expect(result.status).toBe("matched");
    expect(result.matches.map(match => `${match.repository}/${match.artifact}`)).toEqual([
      "mirror/model/copy.gguf", "mirror/model/weights.gguf", "source/model/copy.gguf", "source/model/weights.gguf",
    ]);
    expect(result.matches[0]).toMatchObject({ repository_owner: "mirror", quantized_by: null, base_models: ["upstream/base"], licenses: ["apache-2.0", "mit"] });
    expect(result.matches[2].quantized_by).toBe("Explicit Quantizer");
    for (const match of result.matches) {
      expect(match.model_card_url).toBe(`https://huggingface.co/${match.repository}/blob/${REVISION}/README.md`);
      expect(match.artifact_url).toBe(`https://huggingface.co/${match.repository}/blob/${REVISION}/${match.artifact}`);
    }
    expect(calls[0].url.searchParams.get("filter")).toBe("gguf");
    expect(calls.filter(call => call.url.pathname.includes(`/revision/${REVISION}`))).toHaveLength(2);
    for (const { url, init } of calls) {
      expect(url.origin).toBe("https://huggingface.co");
      expect(init).toMatchObject({ redirect: "error", credentials: "omit", cache: "no-store" });
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
    }
  });
  it.each([
    { sha256: null, reason: "missing_checksum" },
    { sha256: "incomplete", reason: "missing_checksum" },
    { size_bytes: null, reason: "missing_size" },
    { name: null, reason: "missing_hint" },
    { name: "../private-model", repository: "https://example.org/model", reason: "missing_hint" },
  ])("does not look up missing or unsafe recorded evidence: %j", async ({ reason, ...overrides }) => {
    const fetcher = vi.fn();
    const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(evidence(overrides));
    expect(result).toMatchObject({ status: "unidentified", reason, checked_at: null, matches: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves a recorded zero-byte size and still requires an exact pinned size match", async () => {
    const fetcher = vi.fn(async () => json(model("source/model", [file({ size: 0, lfs: { sha256: HASH, size: 0 } })])));
    const lookup = createHuggingFaceModelInformationLookup({ fetch: fetcher });
    const result = await lookup(evidence({ size_bytes: 0, repository: "source/model", name: null }));
    expect(result).toMatchObject({ status: "matched", size_bytes: 0 });
    expect(result.matches[0]).toMatchObject({ size_bytes: 0, artifact: "weights.gguf" });
    const mismatched = await lookup(evidence({ size_bytes: 1, repository: "source/model", name: null }));
    expect(mismatched.matches).toEqual([]);
  });

  it.each([
    file({ lfs: { sha256: "c".repeat(64), size: 1234 } }),
    file({ size: 1235, lfs: { sha256: HASH, size: 1235 } }),
    file({ size: 1235 }),
    file({ lfs: { size: 1234 } }),
    file({ lfs: undefined, blobId: HASH, sha256: HASH }),
    file({ rfilename: "../weights.gguf" }),
    file({ rfilename: "https://example.org/weights.gguf" }),
    file({ rfilename: "weights%2fsecret.gguf" }),
  ])("does not accept a pinned file without exact safe hash and size evidence: %j", async sibling => {
    const fetcher = vi.fn(async () => json(model("source/model", [sibling])));
    const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(
      evidence({ repository: "source/model", name: null }),
    );
    expect(result).toMatchObject({ status: "not_found", matches: [] });
  });

  it("never promotes head evidence when the revision-pinned file or revision differs", async () => {
    for (const pinned of [
      model("source/model", [file({ lfs: { sha256: "c".repeat(64), size: 1234 } })]),
      { ...model("source/model"), sha: "d".repeat(40) },
    ]) {
      const fetcher = vi.fn(async (input: string | URL | Request) =>
        json(String(input).includes("/revision/") ? pinned : model("source/model")));
      const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(
        evidence({ repository: "source/model", name: null }),
      );
      expect(result.status).not.toBe("matched");
      expect(result.matches).toEqual([]);
    }
  });

  it("uses only the pinned card and handles scalar declarations without inferring a quantizer", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => json(model("source/model", [file()],
      String(input).includes("/revision/")
        ? { base_model: "upstream/base", license: "apache-2.0", quantized_by: { name: "unsupported" }, license_name: "unsafe\nname" }
        : { base_model: "stale/base", license: "stale-license", quantized_by: "stale quantizer" })));
    const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(
      evidence({ repository: "source/model", name: null }),
    );
    expect(result.matches[0]).toMatchObject({
      base_models: ["upstream/base"], licenses: ["apache-2.0"], license_name: null, quantized_by: null,
    });
    expect(result.matches[0].model_card_url).toBe(`https://huggingface.co/source/model/tree/${REVISION}`);
  });

  it("ignores untrusted search URLs and does not apply a GGUF filter to other formats", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://huggingface.co");
      expect(url.searchParams.has("filter")).toBe(false);
      return json([{ id: "https://unsafe.example/model" }, { id: "../private" }, { id: "org/../model" }]);
    });
    const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(evidence({ format: "hf-safetensors" }));
    expect(result).toMatchObject({ status: "not_found", matches: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caps candidate scans and globally limits upstream requests to four", async () => {
    let active = 0;
    let peak = 0;
    const repos = new Set<string>();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      if (url.pathname === "/api/models") return json(Array.from({ length: 20 }, (_, i) => ({ id: `mirror/model-${i}` })));
      const repo = url.pathname.split("/").slice(3, 5).join("/");
      repos.add(repo);
      return json(model(repo));
    });
    const lookup = createHuggingFaceModelInformationLookup({ fetch: fetcher });
    const results = await Promise.all([lookup(evidence()), lookup(evidence({ name: "another-model", repository: "recorded/model" }))]);
    expect(results.every(result => result.status === "matched")).toBe(true);
    expect(repos.has("recorded/model")).toBe(true);
    expect(repos.has("mirror/model-8")).toBe(false);
    expect(results[0].matches).toHaveLength(8);
    expect(results[1].matches).toHaveLength(8);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it.each([302, 401, 429, 500])("represents upstream HTTP %i as unavailable without retrying", async status => {
    const fetcher = vi.fn(async () => new Response(null, { status, headers: { location: "https://unsafe.example/" } }));
    const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(evidence());
    expect(result).toMatchObject({ status: "unavailable", matches: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancels oversized streamed metadata and bounds declared response lengths", async () => {
    for (const declared of [false, true]) {
      const cancel = vi.fn();
      const fetcher = vi.fn(async () => new Response(new ReadableStream({
        start(controller) { if (!declared) controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
        cancel,
      }), { headers: declared ? { "content-length": String(2 * 1024 * 1024 + 1) } : {} }));
      const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(evidence());
      expect(result.status).toBe("unavailable");
      expect(cancel).toHaveBeenCalledTimes(1);
    }
  });

  it("bounds the whole scan to eight seconds, including response streaming", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new Error("Aborted")), { once: true });
      },
    })));
    const lookup = createHuggingFaceModelInformationLookup({ fetch: fetcher });
    const result = lookup(evidence());
    await vi.advanceTimersByTimeAsync(8000);
    expect((await result).status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized file lists and match sets rather than returning arbitrary winners", async () => {
    for (const siblings of [
      Array.from({ length: 4097 }, (_, i) => file({ rfilename: `weights-${i}.gguf` })),
      Array.from({ length: 65 }, (_, i) => file({ rfilename: `weights-${i}.gguf` })),
    ]) {
      const fetcher = vi.fn(async () => json(model("source/model", siblings)));
      const result = await createHuggingFaceModelInformationLookup({ fetch: fetcher })(
        evidence({ name: null, repository: "source/model" }),
      );
      expect(result).toMatchObject({ status: "unavailable", matches: [] });
    }
  });

  it("deduplicates simultaneous public evidence lookups and expires positive cache after one day", async () => {
    let time = 100000;
    const fetcher = vi.fn(async () => json(model("source/model")));
    const lookup = createHuggingFaceModelInformationLookup({ fetch: fetcher, now: () => time });
    const input = evidence({ name: null, repository: "source/model" });
    const [first, second] = await Promise.all([lookup(input), lookup({ ...input })]);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledTimes(2);
    time += 86400000 - 1;
    await lookup(input);
    expect(fetcher).toHaveBeenCalledTimes(2);
    time++;
    const refreshed = await lookup(input);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(refreshed.checked_at).not.toBe(first.checked_at);
    // A different recorded size must not reuse a hash-only cached match.
    expect((await lookup({ ...input, size_bytes: 1235 })).status).toBe("not_found");
  });

  it.each([{ status: "not_found", ttl: 900000 }, { status: "unavailable", ttl: 15000 }])(
    "expires $status evidence after its shorter cache lifetime", async ({ status, ttl }) => {
      let time = 100000;
      const fetcher = vi.fn(async () => status === "not_found" ? json([]) : new Response(null, { status: 503 }));
      const lookup = createHuggingFaceModelInformationLookup({ fetch: fetcher, now: () => time });
      expect((await lookup(evidence())).status).toBe(status);
      time += ttl - 1;
      await lookup(evidence());
      expect(fetcher).toHaveBeenCalledTimes(1);
      time++;
      await lookup(evidence());
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it("bounds the public cache and pending lookup admission without evicting active single-flight work", async () => {
    const fetcher = vi.fn(async () => json([]));
    const lookup = createHuggingFaceModelInformationLookup({ fetch: fetcher });
    for (let i = 0; i < 129; i++) await lookup(evidence({ name: `model-${i}` }));
    await lookup(evidence({ name: "model-128" }));
    expect(fetcher).toHaveBeenCalledTimes(129);
    await lookup(evidence({ name: "model-0" }));
    expect(fetcher).toHaveBeenCalledTimes(130);

    const { promise, resolve } = Promise.withResolvers<void>();
    const blockedFetcher = vi.fn(async () => { await promise; return json([]); });
    const bounded = createHuggingFaceModelInformationLookup({ fetch: blockedFetcher });
    const active = Array.from({ length: 16 }, (_, i) => bounded(evidence({ name: `pending-${i}` })));
    const duplicate = bounded(evidence({ name: "pending-0" }));
    const overflow = await bounded(evidence({ name: "overflow" }));
    expect(overflow.status).toBe("unavailable");
    expect(blockedFetcher).toHaveBeenCalledTimes(4);
    resolve();
    expect((await Promise.all([...active, duplicate])).every(result => result.status === "not_found")).toBe(true);
    expect(blockedFetcher).toHaveBeenCalledTimes(16);
  });
});
