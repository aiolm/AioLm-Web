import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/v1/benchmark-runs/[id]/model-information/route";
import { syntheticServingSubmission, syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import type { BenchmarkStore, StoredRun } from "@/server/repository";
import { __setTestStore } from "@/server/store";
import { freshStore, setupTestEnv } from "./helpers";

setupTestEnv();
const HASH = "e".repeat(64);
const REVISION = "f".repeat(40);
const ID = "synthetic123";
const ctx = { params: Promise.resolve({ id: ID }) };
const request = () => new Request(`http://localhost:3000/v1/benchmark-runs/${ID}/model-information`, {
  headers: { authorization: "Bearer must-not-leave-service", cookie: "private-session=must-not-leave-service" },
});

function save(benchmark: PublicBenchmarkSubmission) {
  const store = freshStore();
  const run: StoredRun = {
    submission_id: benchmark.submission_id, public_id: ID, owner_hash: "private-owner-hash", body_sha256: "1".repeat(64),
    benchmark, description_md: "", revision: 1, hidden: false, deleted: false,
    summary: summarizeBenchmark(benchmark), byte_size: 1000, row_count: 1,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  };
  store.runs.set(run.submission_id, run);
  store.byPublic.set(ID, run.submission_id);
  return { store, run };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __setTestStore(null);
});

describe("GET public model information", () => {
  it("enriches only recorded published evidence without returning or rewriting private or frozen data", async () => {
    const benchmark = syntheticServingSubmission({ model: {
      status: "sha256", sha256: HASH, size_bytes: 1234, format: "hf-safetensors",
      source: { kind: "huggingface", repository: "public-source/synthetic-model", revision: "a".repeat(40) },
    } });
    const frozen = JSON.stringify(benchmark);
    const { store, run } = save(benchmark);
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toMatch(/^https:\/\/huggingface\.co\/api\/models\/public-source\/synthetic-model/);
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
      return Response.json({
        id: "public-source/synthetic-model", sha: REVISION, private: false,
        siblings: [{ rfilename: "weights.safetensors", size: 1234, lfs: { sha256: HASH, size: 1234 } }],
        cardData: { base_model: "base/model", license: "mit" },
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await response.json();
    expect(result).toMatchObject({ status: "matched", sha256: HASH, size_bytes: 1234, match_basis: "recorded_sha256_and_size" });
    expect(result.matches[0]).toMatchObject({ revision: REVISION, artifact: "weights.safetensors", repository_owner: "public-source", quantized_by: null });
    const publicJson = JSON.stringify(result);
    for (const privateValue of [run.submission_id, run.owner_hash, "must-not-leave-service", "measurements", "submission_id", "body_sha256"]) {
      expect(publicJson).not.toContain(privateValue);
    }
    expect(JSON.stringify(benchmark)).toBe(frozen);
    expect(fetcher).toHaveBeenCalledTimes(2);
    // Catalog cache must not bypass a fresh moderation decision, even for an authenticated request.
    await store.setHidden(run.submission_id, true);
    const hidden = await GET(request(), ctx);
    expect(hidden.status).toBe(404);
    expect(hidden.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("leaves an older no-checksum record unidentified rather than borrowing a live checksum", async () => {
    const benchmark = syntheticSubmission({ model: {
      status: "unidentified", sha256: null, size_bytes: 1234,
      metadata: {
        format: "GGUF", name: "synthetic-model", architecture: null, size_label: null, quantization: null, file_type: null,
        quantized_by: null, repository: "public-source/synthetic-model", base_models: [], artifact: null, source: "gguf",
      },
    } });
    save(benchmark);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request(), ctx);
    expect(await response.json()).toMatchObject({ status: "unidentified", reason: "missing_checksum", sha256: null, matches: [] });
    expect(fetcher).not.toHaveBeenCalled();
    expect(benchmark.model.sha256).toBeNull();
  });

  it.each(["missing", "hidden", "deleted"])("returns 404 for a %s published record without contacting HF", async kind => {
    const { store, run } = save(syntheticServingSubmission());
    if (kind === "missing") store.byPublic.clear();
    else if (kind === "hidden") await store.setHidden(run.submission_id, true);
    else await store.deleteRun(run.submission_id);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request(), ctx);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a retryable service error when stored publication evidence is unavailable", async () => {
    __setTestStore(new Proxy({} as BenchmarkStore, { get: () => async () => { throw new Error("private database failure"); } }));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request(), ctx);
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(await response.json()).toEqual({ error: { code: "service_unavailable", message: "Service unavailable." } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps upstream outages inside a successful public DTO response", async () => {
    save(syntheticServingSubmission({ model: {
      status: "sha256", sha256: "2".repeat(64), size_bytes: 1234, format: "mlx",
      source: { kind: "huggingface", repository: "public-source/unavailable-model", revision: REVISION },
    } }));
    const fetcher = vi.fn(async () => { throw new Error("HF unavailable"); });
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(request(), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "unavailable", matches: [] });
  });
});
