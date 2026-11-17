import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import { randomBase64Url32, sha256HexUtf8 } from "@/lib/crypto";
import { syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark, type BenchmarkSummary } from "@/lib/summary";
import { weightBits } from "@/lib/weight-bits";
import weightEncodings from "@/lib/weight-encodings.json";
import { normalizeModelInfo, type BenchmarkModelInfo } from "@/lib/model-info";
import { mintUploadPermit, ownerHashFor, permitExpiryForSession } from "@/lib/permits";
import { applyMigrations } from "@/server/migrations";
import { PostgresBenchmarkStore } from "@/server/postgres-store";
import type { AcceptArgs } from "@/server/repository";
import { REQUIRED_MIGRATIONS } from "@/server/repository";
import { __setTestStore } from "@/server/store";
import { POST as createUploadSession } from "@/app/v1/upload-sessions/route";
import { POST as verifyUploadSession } from "@/app/v1/upload-sessions/[id]/verify/route";
import { GET as pollUploadSession } from "@/app/v1/upload-sessions/[id]/route";
import { GET as listBenchmarkRuns, POST as submitBenchmarkRun } from "@/app/v1/benchmark-runs/route";
import { GET as getReadiness } from "@/app/v1/readiness/route";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { parseFilters, canonicalSettingDescriptor, type BenchmarkSetup, type SettingDescriptor, type SettingValue, type BenchmarkFilters } from "@/lib/benchmark-discovery";
import { decodeDiscoveryCursor, type ListCursor } from "@/lib/pagination";

/**
 * Live-Postgres integration on an isolated database. The connection comes from
 * PG_VALIDATION_CONNECTION_FILE (an explicitly provisioned scratch cluster) or
 * DATABASE_URL (the CI service).
 *
 * When neither is configured the whole suite is reported as SKIPPED by Vitest —
 * never as passing, so an unconfigured run can't be mistaken for a green one.
 * When PG_VALIDATION_CONNECTION_FILE *is* set, a missing, unreadable, or
 * malformed file is a hard failure: an explicit request for a real database
 * must never silently downgrade to a skip.
 *
 * Never touches production; the scratch databases and login roles are dropped
 * afterwards. Connection credentials are read but never logged.
 */

const PERMIT_SECRET = "it-permit-secret-0123456789abcdef";
const QUOTA_SECRET = "it-quota-secret-0123456789abcdef";
const MGMT_SECRET = "it-mgmt-secret-0123456789abcdef";
void MGMT_SECRET;

function resolveAdminUrl(): string | null {
  const file = process.env["PG_VALIDATION_CONNECTION_FILE"];
  if (file) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch (err) {
      throw new Error(
        `PG_VALIDATION_CONNECTION_FILE is set but could not be read: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    let parsed: { url?: unknown };
    try {
      parsed = JSON.parse(raw) as { url?: unknown };
    } catch {
      throw new Error("PG_VALIDATION_CONNECTION_FILE is set but does not contain valid JSON.");
    }
    if (typeof parsed.url !== "string" || parsed.url.length === 0) {
      throw new Error('PG_VALIDATION_CONNECTION_FILE is set but has no usable "url" field.');
    }
    return parsed.url;
  }
  return process.env["DATABASE_URL"] ?? null;
}

const ADMIN_URL = resolveAdminUrl();
if (!ADMIN_URL) {
  console.warn("SKIP postgres integration: set PG_VALIDATION_CONNECTION_FILE or DATABASE_URL.");
}

function acceptArgs(submissionId: string, ownerSecret: string, permit: string, quota: AcceptArgs["quota"]): AcceptArgs {
  const benchmark = syntheticSubmission({ submission_id: submissionId });
  const body = JSON.stringify({ benchmark, description_md: "integration" });
  return {
    submission_id: submissionId,
    public_id: `b${randomUUID().replace(/-/g, "").slice(0, 11)}`,
    owner_hash: ownerHashFor(ownerSecret),
    body_sha256: sha256HexUtf8(body),
    benchmarkMeta: { ...benchmark, measurements: { ...benchmark.measurements, rows: [] } },
    rows: benchmark.measurements.rows,
    description_md: "integration",
    summary: summarizeBenchmark(benchmark),
    byte_size: Buffer.byteLength(body),
    row_count: benchmark.measurements.rows.length,
    permit,
    permitSecret: PERMIT_SECRET,
    quotaSecret: QUOTA_SECRET,
    ip: "10.20.30.40",
    nowMs: Date.now(),
    quota,
    capacity: { bytes: null, rows: null, strictMissing: false },
  };
}

const GENEROUS_QUOTA: AcceptArgs["quota"] = {
  perIpHour: 1000, perIpDay: 1000, globalDay: 1000,
  globalBytesDay: 1_000_000_000, globalRowsDay: 10_000_000,
  sessionCreatePerMinIp: 1000, invalidManagePerMinIp: 1000, reportPerHourIp: 1000,
};

// Reported as SKIPPED by Vitest when no database is configured; never passed.
describe.skipIf(ADMIN_URL === null)("postgres integration", () => {
  let admin: postgres.Sql | null = null;
  let db: postgres.Sql | null = null;
  let store: PostgresBenchmarkStore | null = null;
  let dbName = "";
  let ownerUrl = "";
  let runtimeUrl = "";
  let moderationUrl = "";
  const users: string[] = [];

  beforeAll(async () => {
    const adminUrl = ADMIN_URL!;
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false });
    dbName = `aiolm_web_it_${Date.now().toString(36)}`;
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    const dbUrl = new URL(adminUrl);
    dbUrl.pathname = `/${dbName}`;
    ownerUrl = dbUrl.toString();
    db = postgres(ownerUrl, { max: 4, prepare: false, ssl: false });
    await applyMigrations(db);
    // Least-privilege login roles inheriting the NOLOGIN privilege roles.
    const mkUser = async (grant: string): Promise<string> => {
      const name = `it_${grant}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/-/g, "");
      const password = randomBase64Url32();
      await admin!.unsafe(`CREATE USER "${name}" PASSWORD '${password}'`);
      await admin!.unsafe(`GRANT "${grant}" TO "${name}"`);
      users.push(name);
      const userUrl = new URL(adminUrl);
      userUrl.username = name;
      userUrl.password = password;
      userUrl.pathname = `/${dbName}`;
      return userUrl.toString();
    };
    runtimeUrl = await mkUser("aiolm_web_runtime");
    moderationUrl = await mkUser("aiolm_web_moderation");
    store = new PostgresBenchmarkStore(db);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.end({ timeout: 5 });
    if (admin) {
      try {
        if (dbName) {
          await admin.unsafe(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
          );
          await admin.unsafe(`DROP DATABASE "${dbName}"`);
        }
        for (const user of users) await admin.unsafe(`DROP USER "${user}"`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
    admin = null;
    db = null;
    store = null;
  }, 120_000);

  // Inside this describe the database is always configured (the suite is
  // skipped outright otherwise); need() exists only to narrow the nullable
  // handle that beforeAll assigns.
  const need = (): PostgresBenchmarkStore | null => store;

  async function verifiedSession(submissionId: string, ownerSecret: string, bodySha: string): Promise<string> {
    const s = need();
    if (!s) throw new Error("integration database unavailable");
    const sessionId = randomUUID();
    const ownerHash = ownerHashFor(ownerSecret);
    await s.createUploadSession({
      session_id: sessionId, submission_id: submissionId, body_sha256: bodySha,
      owner_hash: ownerHash, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const verified = await s.markSessionVerified(sessionId);
    expect(verified?.status).toBe("verified");
    const permitExpiry = permitExpiryForSession(Date.parse(verified!.expires_at), Date.parse(verified!.verified_at!));
    return mintUploadPermit({
      permitSecret: PERMIT_SECRET, sessionId, submissionId, bodySha256: bodySha,
      ownerHash, expiresAtMs: permitExpiry,
    }).permit;
  }

  describe("benchmark discovery against PostgreSQL", () => {
    type Summary = ReturnType<typeof summarizeBenchmark>;
    type Page = { items: Array<{ public_id: string; summary: Summary }>; next_cursor: string | null };
    let runtimeDb: postgres.Sql;
    const baseline = summarizeBenchmark(syntheticSubmission());
    const setup: BenchmarkSetup = {
      ...baseline.setup,
      os: "TestOS", arch: "x64", cpu: "Test CPU", cores: 8, physical_cores: 4,
      ram_bytes: 16 * 1024 ** 3, vendors: ["Vendor A"], gpus: ["GPU A"], vram_mb: 8192,
      runtime: "test-runtime", runtime_version: "1", backend: "test-backend", mode: "selected",
      max_input_bytes: 4096, max_concurrency: 1, max_output_tokens: 128,
      repetitions: 1, warmup: false, request_usage: false,
      inputs: [{ bytes: 4096, sha256: "a".repeat(64) }], concurrencies: [1],
    };

    // A summary carrying current model metadata, exactly as normalizeModelInfo
    // stores it at acceptance. Empty strings and malformed values stay null.
    const modelInfo = (overrides: Partial<BenchmarkModelInfo> = {}): BenchmarkModelInfo => ({
      format: "GGUF", name: "Example 8B", architecture: "qwen2", size_label: "8B", quantization: "Q4_K_M",
      file_type: 15, quantized_by: "Quantizer Org", repository: "Publisher-Org/example-8B-GGUF",
      revision: null, base_models: ["Upstream-Org/example-8B", "Other-Org/mixin-2B"],
      artifact: "q4/example-8B-Q4_K_M.gguf", source: "gguf+huggingface",
      publisher: "Publisher-Org", sha256: "c".repeat(64), identity_status: "sha256",
      ...overrides,
    });

    type SummaryOverrides = Partial<Omit<Summary, "setup">> & { setup?: Partial<BenchmarkSetup> };

    async function seed(
      id: string,
      group: string,
      overrides: SummaryOverrides = {},
      flags: { hidden?: boolean; deleted?: boolean; created?: string } = {},
      benchmarkOverrides: Partial<PublicBenchmarkSubmission> = {},
    ): Promise<void> {
      if (!db) throw new Error("integration database unavailable");
      const benchmark = syntheticSubmission(benchmarkOverrides);
      const stored = summarizeBenchmark(benchmark);
      const mergedSetup: BenchmarkSetup = { ...setup, ...overrides.setup };
      benchmark.runtime = {
        name: mergedSetup.runtime, version: mergedSetup.runtime_version, backend: mergedSetup.backend,
        build: mergedSetup.runtime_build, variant: mergedSetup.runtime_variant,
        plugin_version: mergedSetup.runtime_plugin_version,
      };
      if (benchmark.environment) {
        benchmark.environment.execution = {
          mode: (mergedSetup.mode ?? "unknown") as NonNullable<PublicBenchmarkSubmission["environment"]>["execution"]["mode"],
          selection_complete: mergedSetup.execution_selection_complete ?? true,
          selected_gpus: mergedSetup.gpus.map((name, index) => ({
            name, vendor: mergedSetup.vendors[index] ?? mergedSetup.vendors[0] ?? null,
            vram_mb: null, driver: null, integrated: false,
          })),
        };
      }
      const summary: Summary = {
        ...stored,
        ...overrides,
        model_label: group,
        identity: {
          ...stored.identity,
          engine_name: benchmark.runtime.name,
          engine_version: benchmark.runtime.version,
          engine_variant: benchmark.runtime.variant,
          engine_build: benchmark.runtime.build,
          engine_plugin_version: benchmark.runtime.plugin_version,
          ...(overrides.identity ?? {}),
        },
        setup: mergedSetup,
      };
      await db`insert into bench.benchmark_runs
        (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, hidden, deleted, created_at)
        values (${randomUUID()}, ${id}, ${"0".repeat(64)}, ${"1".repeat(64)},
          ${db.json(JSON.parse(JSON.stringify(benchmark)) as postgres.JSONValue)},
          ${db.json(JSON.parse(JSON.stringify(summary)) as postgres.JSONValue)}, ${flags.hidden ?? false},
          ${flags.deleted ?? false}, ${flags.created ?? "2026-01-01T00:00:00.000Z"})`;
    }

    async function request(query: Record<string, string>, options = false): Promise<Response> {
      const url = `http://localhost:3000/v1/benchmark-runs${options ? "/options" : ""}?${new URLSearchParams(query)}`;
      if (options) {
        const { GET } = await import("@/app/v1/benchmark-runs/options/route");
        return GET(new Request(url));
      }
      return listBenchmarkRuns(new Request(url));
    }

    async function page(query: Record<string, string>): Promise<Page> {
      const response = await request(query);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      return await response.json() as Page;
    }

    async function options(query: Record<string, string>) {
      const response = await request(query, true);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      return await response.json() as { options: Array<{ value: string; count: number }>; has_more: boolean };
    }

    beforeAll(async () => {
      runtimeDb = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
      const ranges = {
        low: { input: 1024, cap: 32, concurrency: 1, vram: 1024, cores: 2, physical: 1, ram: 1024 ** 3, modelSize: 1_000_000 },
        hit: { input: 4096, cap: 64, concurrency: 4, vram: 8192, cores: 8, physical: 4, ram: 16 * 1024 ** 3, modelSize: 8_000_000_000 },
        high: { input: 16384, cap: 128, concurrency: 16, vram: 16384, cores: 16, physical: 8, ram: 32 * 1024 ** 3, modelSize: 16_000_000_000 },
        unknown: { input: null, cap: 1, concurrency: 64, vram: null, cores: null, physical: null, ram: null, modelSize: null },
      };
      for (const [label, values] of Object.entries(ranges)) {
        await seed(`discovery-range-${label}`, "discovery-range", {
          setup: {
            ...setup,
            max_input_bytes: values.input as number,
            max_output_tokens: values.cap,
            max_concurrency: values.concurrency,
            vram_mb: values.vram,
            cores: values.cores,
            physical_cores: values.physical,
            ram_bytes: values.ram,
          },
          identity: { ...baseline.identity, model_size_bytes: values.modelSize },
        }, {}, { model: { ...syntheticSubmission().model, size_bytes: values.modelSize } });
      }
      await seed("discovery-point-maxima", "discovery-point", { setup: { ...setup, max_input_bytes: 16384 } });
      await seed("discovery-vendor-pair", "discovery-vendor-pair", { setup: { ...setup,
        vendors: ["Vendor A", "Vendor B"], gpus: ["Mixed GPU A", "Mixed GPU B"] } });
      for (let i = 0; i < 35; i++) {
        await seed(`discovery-option-${i}`, "discovery-options", { setup: { ...setup,
          gpus: [`Option ${String(i).padStart(2, "0")}`], vendors: [i === 34 ? "Vendor B" : "Vendor A"] } });
      }
      await seed("discovery-option-repeat", "discovery-options", { setup: { ...setup, gpus: ["Option 00", "Option 00"] } });
      await seed("discovery-option-hidden", "discovery-options", { setup: { ...setup, gpus: ["Hidden GPU"] } }, { hidden: true });
      await seed("discovery-option-deleted", "discovery-options", { setup: { ...setup, gpus: ["Deleted GPU"] } }, { deleted: true });
      for (const [id, value, created] of [
        ["a", 1000, "2026-01-01"], ["b", 1000, "2026-01-01"],
        ["c", 1000, "2026-01-02"], ["d", 2000, "2026-01-01"], ["e", null, "2026-01-03"],
        ["f", null, "2026-01-03"],
      ] as const) {
        // The speed sorts read one serving point, so the value under test lives
        // on that point. "e" measured the point but reported no value and "f"
        // never measured it; both sort last for the point metrics.
        const stat = value === null ? null : { median: value, min: value, max: value, samples: 1 };
        await seed(`discovery-sort-${id}`, "discovery-sort", {
          setup: { ...setup, max_input_bytes: value as number, vram_mb: value },
          serving_points: id === "f" ? [] : [{
            ...baseline.serving_points[0]!,
            reported_tokens_per_second: stat, output_bytes_per_second: stat, e2e_ms: stat,
          }],
        }, { created: `${created}T00:00:00.000Z` });
      }
      await seed("discovery-model-described", "discovery-model", { model_info: modelInfo() });
      await seed("discovery-model-other", "discovery-model", { model_info: modelInfo({
        repository: "Other-Org/example-8B-GGUF", publisher: "Other-Org", quantization: "Q8_0", file_type: 7 }) });
      await seed("discovery-model-undescribed", "discovery-model");
      for (const [id, label] of [["percent", "100%"], ["underscore", "a_b"], ["slash", "a\\b"],
        ["quote", "x' OR true --"], ["decoy", "1000 axb"]]) {
        await seed(`discovery-literal-${id}`, "discovery-literal", { setup: { ...setup, cpu: label } });
      }
    });
    beforeEach(() => __setTestStore(new PostgresBenchmarkStore(runtimeDb)));
    afterEach(() => __setTestStore(null));
    afterAll(async () => { if (runtimeDb) await runtimeDb.end({ timeout: 5 }); });

    it.each([
      ["input_bytes", 4096], ["vram", 8192], ["cores", 8], ["physical_cores", 4],
      ["ram", 16 * 1024 ** 3], ["model_size", 8_000_000_000],
    ])("applies inclusive %s ranges and excludes unknown values", async (field, value) => {
      const text = String(value);
      const result = await page({ model: "discovery-range", [`${field}_min`]: text, [`${field}_max`]: text });
      expect(result.items.map((item) => item.public_id)).toEqual(["discovery-range-hit"]);
      const lower = await page({ model: "discovery-range", [`${field}_min`]: text });
      const upper = await page({ model: "discovery-range", [`${field}_max`]: text });
      expect(lower.items.map((item) => item.public_id)).not.toContain("discovery-range-unknown");
      expect(upper.items.map((item) => item.public_id)).not.toContain("discovery-range-unknown");
      expect(lower.items.map((item) => item.public_id)).toContain("discovery-range-high");
      expect(upper.items.map((item) => item.public_id)).not.toContain("discovery-range-high");
    });

    it.each([["max_output_tokens", 64], ["max_concurrency", 4]])(
      "applies inclusive %s ranges against configured maxima", async (field, value) => {
        const text = String(value);
        expect((await page({ model: "discovery-range", [`${field}_min`]: text, [`${field}_max`]: text }))
          .items.map((item) => item.public_id)).toEqual(["discovery-range-hit"]);
        const lower = await page({ model: "discovery-range", [`${field}_min`]: text });
        const upper = await page({ model: "discovery-range", [`${field}_max`]: text });
        expect(lower.items.map((item) => item.public_id)).toContain("discovery-range-high");
        expect(upper.items.map((item) => item.public_id)).not.toContain("discovery-range-high");
      });

    it("filters configured input maxima independently from measured operating points", async () => {
      expect((await page({ model: "discovery-point", input_bytes_min: "16384" })).items
        .map((item) => item.public_id)).toEqual(["discovery-point-maxima"]);
      expect((await page({ model: "discovery-point", point_bytes: "16384", point_concurrency: "1",
        point_max_tokens: "128", point_only: "1" })).items).toEqual([]);
      expect((await page({ model: "discovery-point", point_bytes: "4096", point_concurrency: "1",
        point_max_tokens: "128", point_only: "1" })).items.map((item) => item.public_id))
        .toEqual(["discovery-point-maxima"]);
      expect((await request({ point_bytes: "4096", point_concurrency: "1", point_max_tokens: "129" })).status).toBe(400);
    });

    it.each(["NaN", "Infinity", "1.5", "9007199254740992", "-2"])("rejects invalid numeric filter %s", async (value) => {
      expect((await request({ input_bytes_min: value })).status).toBe(400);
      expect((await request({ field: "gpu", input_bytes_min: value }, true)).status).toBe(400);
    });

    it("rejects inverted ranges and unsupported option fields", async () => {
      expect((await request({ max_concurrency_min: "8", max_concurrency_max: "2" })).status).toBe(400);
      expect((await request({ field: "owner_hash" }, true)).status).toBe(400);
    });

    it("searches options beyond the first page, excludes its own field, and counts visible runs", async () => {
      expect((await page({ model: "discovery-options", limit: "1" })).items).toHaveLength(1);
      const first = await options({ field: "gpu", model: "discovery-options", gpu: "not present" });
      expect(first.options).toHaveLength(30);
      expect(first.has_more).toBe(true);
      expect(first.options.find((item) => item.value === "Option 00")?.count).toBe(2);
      expect(first.options.some((item) => /Hidden|Deleted/.test(item.value))).toBe(false);
      expect(await options({ field: "gpu", model: "discovery-options", option_query: "34" }))
        .toEqual({ options: [{ value: "Option 34", count: 1 }], has_more: false });
      expect((await options({ field: "gpu", model: "discovery-options", vendor: "Vendor B", gpu: "Option 00" })).options)
        .toEqual([{ value: "Option 34", count: 1 }]);
      expect((await options({ field: "gpu", model: "discovery-options", q: "no matching run" })).options).toEqual([]);
    });

    it("filters, suggests and searches model metadata the way the in-memory store does", async () => {
      const ids = async (query: Record<string, string>) =>
        (await page({ model: "discovery-model", ...query })).items.map((item) => item.public_id).sort();
      expect(await ids({ publisher: "publisher-org" })).toEqual(["discovery-model-described"]);
      // general.quantized_by is not a publisher, and a run without metadata is not a match.
      expect(await ids({ publisher: "quantizer" })).toEqual([]);
      expect(await ids({ quantization: "q8" })).toEqual(["discovery-model-other"]);
      expect(await ids({ base_model: "upstream-org/example" }))
        .toEqual(["discovery-model-described", "discovery-model-other"]);
      // A base model matches within one entry, never across two neighbouring ones.
      expect(await ids({ base_model: "example-8BOther-Org" })).toEqual([]);
      // Percent, underscore and quote are ordinary characters in every model filter.
      for (const literal of ["%", "_", "'", "' OR true --"]) {
        expect(await ids({ publisher: literal })).toEqual([]);
        expect(await ids({ base_model: literal })).toEqual([]);
      }
      for (const q of ["q4/example-8B-Q4_K_M.gguf", "qwen2", "quantizer org", "upstream-org/example-8B", "c".repeat(64)]) {
        expect(await ids({ q })).toEqual(["discovery-model-described", "discovery-model-other"]);
      }
      expect(await options({ field: "publisher", model: "discovery-model" })).toEqual({
        options: [{ value: "Other-Org", count: 1 }, { value: "Publisher-Org", count: 1 }], has_more: false });
      expect((await options({ field: "quantization", model: "discovery-model", publisher: "other" })).options)
        .toEqual([{ value: "Q8_0", count: 1 }]);
      expect((await options({ field: "base_model", model: "discovery-model", option_query: "upstream" })).options)
        .toEqual([{ value: "Upstream-Org/example-8B", count: 2 }]);
      expect((await options({ field: "publisher", model: "discovery-model", option_query: "%" })).options).toEqual([]);
    });

    it("filters exact weight-bit families and suggests only classified formats in numeric order", async () => {
      for (const [id, quantization, file_type] of [["q4", "Q4_K_M", 15], ["q8", "Q8_0", 7], ["iq4", "IQ4_XS", 30], ["nvfp4", "NVFP4", 39], ["bf16", "BF16", 32], ["awq", "AWQ", null], ["conflict", "Q4_K_M", 7]] as const) {
        await seed(`discovery-weight-${id}`, "discovery-weight", { model_info: modelInfo({ quantization, file_type }) });
      }
      expect((await page({ model: "discovery-weight", weight_bits: "4" })).items.map(item => item.public_id).sort()).toEqual(["discovery-weight-iq4", "discovery-weight-nvfp4", "discovery-weight-q4"]);
      expect((await page({ model: "discovery-weight", weight_bits: "8" })).items.map(item => item.public_id)).toEqual(["discovery-weight-q8"]);
      expect((await page({ model: "discovery-weight", weight_bits: "4", quantization: "nvfp4" })).items.map(item => item.public_id)).toEqual(["discovery-weight-nvfp4"]);
      expect((await options({ field: "weight_bits", model: "discovery-weight", weight_bits: "8" })).options).toEqual([{ value: "4", count: 3 }, { value: "8", count: 1 }, { value: "16", count: 1 }]);
    });

    it("searches and suggests model_query over the label and model identifiers only, like the in-memory store", async () => {
      const ids = async (query: Record<string, string>) =>
        (await page({ model: "discovery-model", ...query })).items.map((item) => item.public_id).sort();
      const both = ["discovery-model-described", "discovery-model-other"];
      for (const model_query of ["example 8b", "q4/example-8B-Q4_K_M.gguf", "c".repeat(64)]) expect(await ids({ model_query })).toEqual(both);
      expect(await ids({ model_query: "publisher-org/example-8b-gguf" })).toEqual(["discovery-model-described"]);
      expect(await ids({ model_query: "other-org/" })).toEqual(["discovery-model-other"]);
      // The label is searched too, and a run without metadata has nothing else.
      expect(await ids({ model_query: "discovery-model" })).toEqual([...both, "discovery-model-undescribed"].sort());
      // Hardware, runtime and descriptive model text belong to q, not to model_query.
      for (const text of ["testos", "gpu a", "vendor a", "test-runtime", "qwen2", "quantizer org"]) {
        expect(await ids({ model_query: text }), text).toEqual([]);
      }
      expect(await ids({ q: "test-runtime" })).toHaveLength(3);
      expect(await ids({ q: "qwen2" })).toEqual(both);
      // Conditions are ANDed with model_query.
      expect(await ids({ model_query: "example 8b", publisher: "other" })).toEqual(["discovery-model-other"]);
      expect(await ids({ model_query: "example 8b", gpu: "no such gpu" })).toEqual([]);
      const suggestions = async (query: Record<string, string>) =>
        (await options({ field: "model_query", model: "discovery-model", ...query })).options;
      const offered = await suggestions({});
      expect(offered).toEqual([
        { value: "Example 8B", count: 2 }, { value: "Other-Org/example-8B-GGUF", count: 1 }, { value: "Publisher-Org/example-8B-GGUF", count: 1 },
        { value: "c".repeat(64), count: 2 }, { value: "discovery-model", count: 3 }, { value: "q4/example-8B-Q4_K_M.gguf", count: 2 },
      ]);
      // Every suggestion matches again when selected, for as many runs as it was counted for.
      for (const { value, count } of offered) expect(await ids({ model_query: value }), value).toHaveLength(count);
      expect((await suggestions({ publisher: "other" })).map((item) => item.value))
        .toEqual(["Example 8B", "Other-Org/example-8B-GGUF", "c".repeat(64), "discovery-model", "q4/example-8B-Q4_K_M.gguf"]);
      expect(await suggestions({ model_query: "ignored" })).toEqual(offered);
      expect(await suggestions({ option_query: "test-runtime" })).toEqual([]);
      expect(await suggestions({ option_query: "%" })).toEqual([]);
    });

    it("narrows GPU suggestions to matching devices in a mixed-vendor run", async () => {
      expect((await options({ field: "gpu", model: "discovery-vendor-pair", vendor: "vendor b" })).options)
        .toEqual([{ value: "Mixed GPU B", count: 1 }]);
      expect((await options({ field: "gpu", model: "discovery-vendor-pair", vendor: "vendor a" })).options)
        .toEqual([{ value: "Mixed GPU A", count: 1 }]);
    });

    it.each([["percent", "%"], ["underscore", "a_b"], ["slash", "\\"], ["quote", "' OR true --"]])(
      "treats %s as literal text in filters and option search", async (id, text) => {
        expect((await page({ model: "discovery-literal", cpu: text })).items.map((item) => item.public_id))
          .toEqual([`discovery-literal-${id}`]);
        expect((await page({ model: "discovery-literal", q: text })).items.map((item) => item.public_id))
          .toEqual([`discovery-literal-${id}`]);
        expect((await options({ field: "cpu", model: "discovery-literal", option_query: text })).options).toHaveLength(1);
      });

    it.each([
      ["newest", "fecdba"], ["oldest", "abdcef"],
      ["input_bytes_asc", "cbadfe"], ["input_bytes_desc", "dcbafe"],
      ["vram_asc", "cbadfe"], ["vram_desc", "dcbafe"],
      ["token_rate_desc", "dcbafe"], ["output_rate_desc", "dcbafe"], ["duration_asc", "cbadfe"],
    ])("pages %s across value, timestamp, ID and null ties without gaps", async (sort, order) => {
      const ids: string[] = [];
      let cursor: string | null = null;
      // Ranking measured speed names the serving point it ranks at; the other
      // orders read configured setup and need none.
      const basis: Record<string, string> = ["token_rate_desc", "output_rate_desc", "duration_asc"].includes(sort)
        ? { point_bytes: "4096", point_concurrency: "1", point_max_tokens: "128" } : {};
      for (let i = 0; i < 8; i++) {
        const result = await page({ model: "discovery-sort", sort, limit: "1", ...basis, ...(cursor ? { cursor } : {}) });
        ids.push(...result.items.map((item) => item.public_id));
        cursor = result.next_cursor;
        if (!cursor) break;
      }
      expect(cursor).toBeNull();
      expect(ids).toEqual([...order].map((id) => `discovery-sort-${id}`));
      expect(new Set(ids).size).toBe(6);
    });

    it("rejects cursors reused with a different sort or filter", async () => {
      const first = await page({ model: "discovery-sort", sort: "input_bytes_asc", limit: "1" });
      expect(first.next_cursor).toBeTruthy();
      for (const changed of ([{ sort: "input_bytes_desc", model: "discovery-sort" },
        { sort: "input_bytes_asc", model: "discovery-range" },
        { sort: "input_bytes_asc", model: "discovery-sort", cores_min: "2" }] as Array<Record<string, string>>)) {
        expect((await request({ ...changed, cursor: first.next_cursor! })).status).toBe(400);
      }
    });
  });

  it("retires every pre-contract benchmark record and the legacy discovery indexes", async () => {
    if (!admin) throw new Error("integration database unavailable");
    const scratchName = `aiolm_web_retire_${randomUUID().replace(/-/g, "")}`;
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`);
    const scratchUrl = new URL(ADMIN_URL!);
    scratchUrl.pathname = `/${scratchName}`;
    const scratch = postgres(scratchUrl.toString(), { max: 1, prepare: false, ssl: false });
    try {
      await scratch`create schema bench`;
      await scratch`create table bench.schema_migrations (filename text primary key, sha256 text not null)`;
      for (const name of REQUIRED_MIGRATIONS.filter((name) => name < "016_single_benchmark_method.sql")) {
        await scratch.unsafe(readFileSync(join(process.cwd(), "sql", "migrations", name), "utf8"));
      }
      const benchmark = syntheticSubmission();
      const submissionId = randomUUID();
      await scratch`insert into bench.benchmark_runs
        (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, row_count, byte_size)
        values (${submissionId}, ${"retired"}, ${"0".repeat(64)}, ${"1".repeat(64)},
          ${scratch.json(JSON.parse(JSON.stringify(benchmark)) as postgres.JSONValue)},
          ${scratch.json(JSON.parse(JSON.stringify(summarizeBenchmark(benchmark))) as postgres.JSONValue)}, 1, 4096)`;
      await scratch`insert into bench.benchmark_chunks (submission_id, chunk_index, rows)
        values (${submissionId}, 0, ${scratch.json(JSON.parse(JSON.stringify(benchmark.measurements.rows)) as postgres.JSONValue)})`;
      await scratch`insert into bench.upload_sessions
        (session_id, submission_id, body_sha256, owner_hash, status, expires_at)
        values (${randomUUID()}, ${submissionId}, ${"1".repeat(64)}, ${"0".repeat(64)}, 'verified', now() + interval '5 minutes')`;
      await scratch`insert into bench.reports (id, target_submission_id, reason)
        values (${randomUUID()}, ${submissionId}, 'retired')`;
      await scratch`insert into bench.audit_log (actor, action, target) values ('operator', 'hide', ${submissionId})`;
      await scratch`insert into bench.quota_buckets (key, count, bytes, rows, window_start, expires_at)
        values ('it:retired', 1, 0, 0, now(), now() + interval '1 hour')`;
      const before = (await scratch<Array<{ indexname: string }>>`
        select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`)
        .map((row) => row.indexname);
      expect(before).toContain("benchmark_discovery_prompt_length_asc");

      await scratch.unsafe(readFileSync(join(process.cwd(), "sql", "migrations", "016_single_benchmark_method.sql"), "utf8"));

      const counts = (await scratch<Array<{ runs: number; chunks: number; sessions: number; reports: number; audits: number; quotas: number }>>`
        select
          (select count(*)::int from bench.benchmark_runs) as runs,
          (select count(*)::int from bench.benchmark_chunks) as chunks,
          (select count(*)::int from bench.upload_sessions) as sessions,
          (select count(*)::int from bench.reports) as reports,
          (select count(*)::int from bench.audit_log) as audits,
          (select count(*)::int from bench.quota_buckets) as quotas`)[0]!;
      expect(counts).toEqual({ runs: 0, chunks: 0, sessions: 0, reports: 0, audits: 1, quotas: 1 });

      const after = (await scratch<Array<{ indexname: string }>>`
        select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`)
        .map((row) => row.indexname);
      for (const name of ["benchmark_discovery_throughput_desc", "benchmark_discovery_duration_asc",
        "benchmark_discovery_parallel_asc", "benchmark_discovery_threads_asc", "benchmark_discovery_gpu_layers_asc",
        "benchmark_discovery_prompt_length_asc", "benchmark_discovery_prompt_length_desc",
        "benchmark_discovery_flash_attention_trgm", "benchmark_discovery_cache_type_k_trgm",
        "benchmark_discovery_cache_type_v_trgm", "benchmark_discovery_split_mode_trgm"]) {
        expect(after).not.toContain(name);
      }
      for (const name of ["benchmark_runs_serving_method_visible", "benchmark_runs_model_size_visible",
        "benchmark_runs_recorded_settings_visible"]) expect(after).toContain(name);
    } finally {
      await scratch.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE "${scratchName}"`);
    }
  });
  it("enriches summaries that recorded model metadata and leaves every other run exactly as it was", async () => {
    if (!admin) throw new Error("integration database unavailable");
    const MIGRATION = "010_model_metadata.sql";
    const scratchName = `aiolm_web_model_${randomUUID().replace(/-/g, "")}`;
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`);
    const scratchUrl = new URL(ADMIN_URL!);
    scratchUrl.pathname = `/${scratchName}`;
    const scratch = postgres(scratchUrl.toString(), { max: 1, prepare: false, ssl: false });
    try {
      await scratch`create schema bench`;
      await scratch`create table bench.schema_migrations (filename text primary key, sha256 text not null)`;
      for (const name of REQUIRED_MIGRATIONS.filter((name) => name < MIGRATION)) {
        await scratch.unsafe(readFileSync(join(process.cwd(), "sql", "migrations", name), "utf8"));
      }

      // Contract 0.3.0 metadata attached directly: the vendored 0.2.0 types do not
      // carry the optional block yet, and validating it is the contracts package's job.
      const withMetadata = (metadata: unknown) => syntheticSubmission({
        model: { format: "gguf", status: "sha256", sha256: "c".repeat(64), size_bytes: 4096, metadata } as never });
      const complete = withMetadata({
        format: "GGUF", name: "Example 8B", architecture: "qwen2", size_label: "8B", quantization: "Q4_K_M",
        file_type: 15, quantized_by: "Quantizer Org", repository: "Publisher-Org/example-8B-GGUF",
        base_models: ["Upstream-Org/example-8B", "Other-Org/mixin-2B"],
        artifact: "q4/example-8B-Q4_K_M.gguf", source: "gguf+huggingface" });
      // Every field here is out of contract in a different way, and every one of them
      // must land as unknown rather than as a repaired or invented value.
      const messy = withMetadata({
        format: "GGUF", name: "vendor/model", architecture: "\u0001qwen2", size_label: "x".repeat(257),
        quantization: "host:Q4", file_type: 65536, quantized_by: "org@host", repository: "Publisher-Org//example",
        base_models: ["Upstream-Org/example-8B", "Upstream-Org/example-8B", "not-a-repo", "org/a", "org/b",
          "org/c", "org/d", "org/e", "org/f", "org/g", "org/h"],
        artifact: "../escape.gguf", source: "filename" });
      // A Windows share path is not a repo-relative artifact.
      const backslash = withMetadata({ format: "GGUF", name: "Example 8B",
        artifact: "share" + String.fromCharCode(92) + "example-8B-Q4_K_M.gguf" });
      // A well-shaped filename with no repository and no registry source proves
      // no download origin: the name is kept, the artifact stays unknown.
      const sourceless = withMetadata({ format: "GGUF", name: "Example 8B",
        artifact: "q4/example-8B-Q4_K_M.gguf" });
      const undescribed = syntheticSubmission();

      const metaOf = (b: typeof undescribed) => JSON.parse(JSON.stringify({ ...b, measurements: { ...b.measurements, rows: [] } }));
      // What a pre-010 row looks like: an operator-curated label and no model_info key.
      const curated = (b: typeof undescribed, label: string) => {
        const { model_info, ...rest } = summarizeBenchmark(b);
        void model_info;
        return { ...rest, model_label: label };
      };

      const submissionIds = new Map<string, string>();
      for (const [publicId, benchmark, label] of [
        ["described", complete, "Curated Model A"], ["messy", messy, "Curated Model B"],
        ["backslash", backslash, "Curated Model C"], ["undescribed", undescribed, "Curated Model D"],
        ["sourceless", sourceless, "Curated Model E"],
      ] as const) {
        const submissionId = randomUUID();
        submissionIds.set(publicId, submissionId);
        await scratch`insert into bench.benchmark_runs
          (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, hidden, row_count, byte_size)
          values (${submissionId}, ${publicId}, ${"0".repeat(64)}, ${"1".repeat(64)},
            ${scratch.json(metaOf(benchmark) as unknown as postgres.JSONValue)}, ${scratch.json(curated(benchmark, label) as unknown as postgres.JSONValue)},
            ${publicId === "described"}, ${benchmark.measurements.rows.length}, ${4096})`;
        await scratch`insert into bench.benchmark_chunks (submission_id, chunk_index, rows) values (${submissionId}, 0,
          ${scratch.json(JSON.parse(JSON.stringify(benchmark.measurements.rows)) as postgres.JSONValue)})`;
      }
      await scratch`insert into bench.benchmark_runs
        (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, deleted)
        values (${randomUUID()}, 'tombstone', ${"2".repeat(64)}, ${"3".repeat(64)}, null, null, true)`;

      await scratch.unsafe(readFileSync(join(process.cwd(), "sql", "migrations", MIGRATION), "utf8"));

      type Stored = { public_id: string; summary: ReturnType<typeof summarizeBenchmark> | null; benchmark: unknown;
        owner_hash: string; body_sha256: string; row_count: number; byte_size: number };
      const stored = new Map((await scratch<Stored[]>`
        select public_id, summary, benchmark, owner_hash, body_sha256, row_count, byte_size
        from bench.benchmark_runs`).map((r) => [r.public_id, r]));

      // The backfill reproduces the application helper field for field, on the hidden
      // run too, and the operator-curated label survives the merge untouched.
      expect(stored.get("described")!.summary).toEqual({ ...summarizeBenchmark(complete), model_label: "Curated Model A" });
      expect(stored.get("described")!.summary!.model_info).toEqual(normalizeModelInfo(complete));
      expect(stored.get("described")!.summary!.model_info).toMatchObject({
        publisher: "Publisher-Org", quantized_by: "Quantizer Org", identity_status: "sha256", sha256: "c".repeat(64) });

      // Out-of-contract fields are unknown, never repaired: no publisher is read from
      // the unusable repository, and no quantization or name from the artifact.
      expect(stored.get("messy")!.summary).toEqual({ ...summarizeBenchmark(messy), model_label: "Curated Model B" });
      expect(stored.get("messy")!.summary!.model_info).toEqual(normalizeModelInfo(messy));
      expect(stored.get("messy")!.summary!.model_info).toMatchObject({
        name: null, architecture: null, size_label: null, quantization: null, file_type: null,
        quantized_by: null, repository: null, publisher: null, artifact: null, source: null });
      expect(stored.get("messy")!.summary!.model_info!.base_models)
        .toEqual(["Upstream-Org/example-8B", "org/a", "org/b", "org/c", "org/d", "org/e", "org/f", "org/g"]);

      expect(stored.get("backslash")!.summary).toEqual({ ...summarizeBenchmark(backslash), model_label: "Curated Model C" });
      expect(stored.get("backslash")!.summary!.model_info).toMatchObject({ artifact: null, name: "Example 8B" });

      // A well-shaped filename with no repository and no registry source proves
      // no download origin: the application helper and the backfill agree that
      // the name is kept, the artifact is unknown, and the curated label wins.
      expect(stored.get("sourceless")!.summary).toEqual({ ...summarizeBenchmark(sourceless), model_label: "Curated Model E" });
      expect(stored.get("sourceless")!.summary!.model_info).toEqual(normalizeModelInfo(sourceless));
      expect(stored.get("sourceless")!.summary!.model_info).toMatchObject({
        name: "Example 8B", repository: null, publisher: null, artifact: null, source: null });

      // A run that recorded no metadata is not written at all: no model_info key
      // appears, so it reads as "never recorded" rather than as an empty model.
      expect(stored.get("undescribed")!.summary).toEqual(curated(undescribed, "Curated Model D"));
      expect(Object.hasOwn(stored.get("undescribed")!.summary!, "model_info")).toBe(false);

      // Prior migrations, raw metadata, chunks, hashes, capacity counters and the
      // tombstone are all left exactly as they were.
      for (const publicId of ["described", "messy", "backslash", "sourceless", "undescribed"]) {
        const row = stored.get(publicId)!;
        expect(row.summary!.setup!.max_input_bytes).toBe(4096);
        expect(row.summary!.setup!.max_output_tokens).toBe(128);
        expect(row.summary!.setup!.max_concurrency).toBe(1);
        expect(row.summary!.serving_points).toHaveLength(1);
        expect(row.owner_hash).toBe("0".repeat(64));
        expect(row.body_sha256).toBe("1".repeat(64));
        expect(row.row_count).toBe(1);
        expect(row.byte_size).toBe(4096);
      }
      expect(stored.get("described")!.benchmark).toEqual(metaOf(complete));
      expect(stored.get("messy")!.benchmark).toEqual(metaOf(messy));
      expect(stored.get("sourceless")!.benchmark).toEqual(metaOf(sourceless));
      expect(stored.get("tombstone")!.summary).toBeNull();
      expect(stored.get("tombstone")!.benchmark).toBeNull();
      const chunks = await scratch<Array<{ rows: unknown[] }>>`
        select rows from bench.benchmark_chunks where submission_id = ${submissionIds.get("described")!}`;
      expect(chunks.flatMap((c) => c.rows)).toEqual(JSON.parse(JSON.stringify(complete.measurements.rows)));

      // The backfill validators are scaffolding, not runtime API: they are gone again.
      const functions = await scratch<Array<{ proname: string }>>`
        select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'bench'`;
      expect(functions.map((f) => f.proname)).toEqual(["discovery_array_text"]);

      const extension = await scratch<Array<{ n: string }>>`select count(*)::text as n from pg_extension where extname = 'pg_trgm'`;
      if (extension[0]!.n !== "0") {
        const indexes = (await scratch<Array<{ indexname: string }>>`
          select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`)
          .map((r) => r.indexname);
        for (const name of ["benchmark_discovery_publisher_trgm", "benchmark_discovery_quantization_trgm",
          "benchmark_discovery_base_models_trgm"]) expect(indexes).toContain(name);
      }
    } finally {
      await scratch.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE "${scratchName}"`);
    }
  });

  it("backfills only recorded system RAM and preserves measurement data", async () => {
    if (!admin) throw new Error("integration database unavailable");
    const scratchName = `aiolm_web_ram_${randomUUID().replace(/-/g, "")}`;
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`);
    const scratchUrl = new URL(ADMIN_URL!);
    scratchUrl.pathname = `/${scratchName}`;
    const scratch = postgres(scratchUrl.toString(), { max: 1, prepare: false, ssl: false });
    try {
      await applyMigrations(scratch);
      const base = syntheticSubmission();
      const recorded = syntheticSubmission({ environment: { ...base.environment!, system_memory_bytes: 32 * 1024 ** 3 } });
      for (const [id, benchmark] of [["recorded", recorded], ["legacy", base]] as const) {
        const summary = summarizeBenchmark(benchmark);
        delete (summary.setup as Partial<typeof summary.setup>).ram_bytes;
        await scratch`insert into bench.benchmark_runs (submission_id,public_id,owner_hash,body_sha256,benchmark,summary)
          values (${randomUUID()},${id},${"0".repeat(64)},${"1".repeat(64)},
          ${scratch.json(JSON.parse(JSON.stringify(benchmark)))},${scratch.json(JSON.parse(JSON.stringify(summary)))})`;
      }
      await scratch.unsafe(readFileSync(join(process.cwd(), "sql", "migrations", "011_system_memory.sql"), "utf8"));
      const rows = await scratch`select public_id,benchmark,summary,owner_hash,body_sha256 from bench.benchmark_runs order by public_id`;
      expect(rows[0]!.summary.setup.ram_bytes).toBeNull();
      expect(rows[1]!.summary.setup.ram_bytes).toBe(32 * 1024 ** 3);
      expect(rows[0]!.benchmark).toEqual(JSON.parse(JSON.stringify(base)));
      expect(rows[1]!.benchmark).toEqual(JSON.parse(JSON.stringify(recorded)));
      expect(rows[1]!.summary).toEqual(summarizeBenchmark(recorded));
      expect(rows.every(row => row.owner_hash === "0".repeat(64) && row.body_sha256 === "1".repeat(64))).toBe(true);
    } finally {
      await scratch.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE "${scratchName}"`);
    }
  });

  it("backfills counted GPU labels without changing submissions or other summary fields", async () => {
    if (!db) throw new Error("integration database unavailable");
    const migration = readFileSync(join(process.cwd(), "sql/migrations/013_gpu_hardware_labels.sql"), "utf8");
    await db.begin(async tx => {
      const ids: string[] = [];
      for (const [names, mode, hidden] of [
        [["R9700", "R9700"], "selected", false],
        [["RTX 4090", "R9700", "RTX 4090", "R9700", "RTX 4090"], "selected", true],
        [["R9700", "RTX 4090"], "selected", false],
        [["R9700", "R9700"], "cpu", false],
        [[], "automatic", false],
      ] as const) {
        const benchmark = syntheticSubmission();
        benchmark.environment!.execution = { mode, selection_complete: true, selected_gpus: names.map(name => ({ name, vendor: "Vendor", vram_mb: 4096, driver: null, integrated: false })) };
        const summary = summarizeBenchmark(benchmark);
        const legacyLabel = mode === "cpu" ? "cpu" : names.length ? names.join(" + ") : mode;
        const submissionId = randomUUID();
        ids.push(submissionId);
        await tx`insert into bench.benchmark_runs (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, hidden)
          values (${submissionId}, ${submissionId}, ${"0".repeat(64)}, ${"1".repeat(64)},
            ${tx.json(JSON.parse(JSON.stringify(benchmark)))}, ${tx.json({ ...summary, hardware_label: legacyLabel } as unknown as postgres.JSONValue)}, ${hidden})`;
      }
      const tombstone = randomUUID();
      ids.push(tombstone);
      await tx`insert into bench.benchmark_runs (submission_id, public_id, owner_hash, body_sha256, deleted)
        values (${tombstone}, ${tombstone}, ${"0".repeat(64)}, ${"1".repeat(64)}, true)`;
      const before = await tx`select * from bench.benchmark_runs where submission_id in ${tx(ids)}`;
      await tx.unsafe(migration);
      const after = await tx`select * from bench.benchmark_runs where submission_id in ${tx(ids)}`;
      for (const row of before) {
        const expected = row.summary ? { ...row, summary: { ...row.summary, hardware_label: summarizeBenchmark(row.benchmark).hardware_label } } : row;
        expect(after.find(item => item.submission_id === row.submission_id)).toEqual(expected);
      }
      // No second update: repeated migration runs are harmless.
      expect((await tx.unsafe(migration)).count).toBe(0);
    });
  });

  it("uses identical weight-bit rules in PostgreSQL and the app, including invalid metadata", async () => {
    if (!db) throw new Error("integration database unavailable");
    const cases: unknown[] = weightEncodings.flatMap(encoding => [
      { format: "GGUF", file_type: encoding.file_type },
      ...encoding.labels.map(quantization => ({ format: "GGUF", quantization: ` ${quantization.toLowerCase()} ` })),
    ]);
    cases.push(null, {}, [], { format: "other", quantization: "NVFP4" },
      { format: "GGUF", quantization: "AWQ" }, { format: "GGUF", quantization: "GPTQ" },
      { format: "GGUF", quantization: "Q4_K_M", file_type: 7 },
      { format: "GGUF", quantization: "Q4_K_M", file_type: 1024 },
      { format: "GGUF", file_type: "15" }, { format: "GGUF", file_type: "invalid" },
      { format: "GGUF", file_type: true }, { format: "GGUF", file_type: 15.5 },
      { format: "GGUF", quantization: "TQ1_0", file_type: 36 },
      { format: "GGUF", quantization: "IQ1_S", file_type: 24 },
      { format: "GGUF", quantization: "IQ1_M", file_type: 31 },
      { format: "GGUF", quantization: "IQ1_M", file_type: 15 },
      { format: "GGUF", quantization: "Q4_K_M", file_type: 36 },
      { format: "GGUF", name: "Model-Q4_K_M", artifact: "model-Q4_K_M.gguf" });
    for (const info of cases) {
      const [row] = await db`select bench.model_weight_bits(${db.json(info as postgres.JSONValue)}) as bits`;
      expect(row!.bits, JSON.stringify(info)).toBe(weightBits(info));
    }
  });

  it("applies migrations exactly once", async () => {
    if (!db) return;
    expect(await applyMigrations(db)).toEqual([]);
    const rows = await db`select filename from bench.schema_migrations order by filename`;
    expect(rows.map((r) => r.filename)).toEqual([
      "001_init.sql", "002_roles.sql", "003_least_privilege.sql",
      "004_filter_indexes.sql", "005_retention_grants.sql", "006_trgm_filter_indexes.sql",
      "007_readiness_grant.sql", "008_benchmark_discovery.sql", "009_input_context.sql",
      "010_model_metadata.sql", "011_system_memory.sql", "012_operating_points.sql",
      "013_gpu_hardware_labels.sql",
      "014_weight_bits.sql",
      "015_engine_neutral_benchmarks.sql",
      "016_single_benchmark_method.sql",
    ]);
  });

  it("backs list filters and pagination with indexes", async () => {
    if (!db) return;
    const idx = await db`select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`;
    const names = idx.map((r) => r.indexname as string);
    // Keyset pagination ordering is index-backed.
    expect(names).toContain("benchmark_runs_created_idx");
    // Current setup, canonical identity and recorded-settings filters stay indexed.
    expect(names).toContain("benchmark_discovery_vram_asc");
    expect(names).toContain("benchmark_discovery_cores_asc");
    expect(names).toContain("benchmark_runs_serving_method_visible");
    expect(names).toContain("benchmark_runs_model_size_visible");
    expect(names).toContain("benchmark_runs_recorded_settings_visible");
    // 016 removed indexes over summaries that no current record carries.
    for (const legacy of ["benchmark_discovery_throughput_desc", "benchmark_discovery_duration_asc",
      "benchmark_discovery_parallel_asc", "benchmark_discovery_threads_asc", "benchmark_discovery_gpu_layers_asc",
      "benchmark_discovery_prompt_length_asc", "benchmark_discovery_prompt_length_desc"]) {
      expect(names).not.toContain(legacy);
    }
    const ext = await db`select count(*)::text as n from pg_extension where extname = 'pg_trgm'`;
    if ((ext[0]!.n as string) !== "0") {
      for (const name of [
        "benchmark_runs_model_trgm",
        "benchmark_runs_hardware_trgm",
        "benchmark_runs_method_trgm",
        "benchmark_runs_workload_trgm",
      ]) {
        expect(names).toContain(name);
      }
    }
  });

  it("serializes concurrent acceptance to one receipt", async () => {
    const s = need();
    if (!s) return;
    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const benchmark = syntheticSubmission({ submission_id: submissionId });
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const permit = await verifiedSession(submissionId, ownerSecret, sha256HexUtf8(body));
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => s.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))),
    );
    expect(outcomes.filter((o) => o.outcome === "created")).toHaveLength(1);
    expect(outcomes.filter((o) => o.outcome === "replay")).toHaveLength(7);

    const wrongOwner = await s.acceptRunAtomic(acceptArgs(submissionId, randomBase64Url32(), permit, GENEROUS_QUOTA));
    expect(wrongOwner.outcome).toBe("conflict-owner");
    const otherBody = { ...acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA), body_sha256: "c".repeat(64) };
    expect((await s.acceptRunAtomic(otherBody)).outcome).toBe("conflict-body");
  });

  it("keeps delete+upload races terminal", async () => {
    const s = need();
    if (!s) return;
    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const benchmark = syntheticSubmission({ submission_id: submissionId });
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const permit = await verifiedSession(submissionId, ownerSecret, sha256HexUtf8(body));
    const first = await s.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA));
    expect(first.outcome).toBe("created");
    await s.deleteRun(submissionId);
    const racing = await Promise.all(
      Array.from({ length: 4 }, () => s.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))),
    );
    expect(racing.every((o) => o.outcome === "deleted")).toBe(true);
  });

  it("enforces quotas atomically under concurrency", async () => {
    const s = need();
    if (!s) return;
    const tight = { ...GENEROUS_QUOTA, perIpHour: 3 };
    const setups = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const submissionId = randomUUID();
        const ownerSecret = randomBase64Url32();
        const benchmark = syntheticSubmission({ submission_id: submissionId });
        const body = JSON.stringify({ benchmark, description_md: "integration" });
        const permit = await verifiedSession(submissionId, ownerSecret, sha256HexUtf8(body));
        return acceptArgs(submissionId, ownerSecret, permit, tight);
      }),
    );
    // Same IP across all six: exactly three win, three hit the quota.
    const withSameIp = setups.map((a) => ({ ...a, ip: "10.99.99.99" }));
    const outcomes = await Promise.all(withSameIp.map((a) => s.acceptRunAtomic(a)));
    expect(outcomes.filter((o) => o.outcome === "created")).toHaveLength(3);
    expect(outcomes.filter((o) => o.outcome === "quota")).toHaveLength(3);
  });

  it("stores metadata once and reads only requested chunks", async () => {
    const s = need();
    if (!s || !db) return;
    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const row = syntheticSubmission().measurements.rows[0]!;
    const benchmark = syntheticSubmission({
      submission_id: submissionId,
      measurements: { status: "complete", rows: Array.from({ length: 2500 }, () => ({ ...row })) },
    });
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const bodySha = sha256HexUtf8(body);
    const permit = await verifiedSession(submissionId, ownerSecret, bodySha);
    const created = await s.acceptRunAtomic({ ...acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA),
      // The permit binds the EXACT 2500-row body: override the 1-row
      // acceptArgs hash/summary to match the minted session binding.
      body_sha256: bodySha,
      summary: summarizeBenchmark(benchmark),
      benchmarkMeta: { ...benchmark, measurements: { ...benchmark.measurements, rows: [] } },
      rows: benchmark.measurements.rows, byte_size: Buffer.byteLength(body), row_count: 2500 });
    expect(created.outcome).toBe("created");
    const stored = await db!`select benchmark from bench.benchmark_runs where submission_id = ${submissionId}`;
    expect((stored[0]!.benchmark as { measurements: { rows: unknown[] } }).measurements.rows).toEqual([]);
    const page = await s.getRowSlice(submissionId, 1000, 1000);
    expect(page.rows).toHaveLength(1000);
    expect(page.total).toBe(2500);
    expect(page.nextOffset).toBe(2000);
    const listed = await s.listRuns({}, 25, null);
    const item = listed.items.find((i) => i.public_id === (created as { run: { public_id: string } }).run.public_id);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("submission_id");
  });

  it("enforces least-privilege roles", async () => {
    if (!db) return;
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    const modSql = postgres(moderationUrl, { max: 1, prepare: false, ssl: false });
    const rt = new PostgresBenchmarkStore(rtSql);
    const mod = new PostgresBenchmarkStore(modSql);
    try {
      // Runtime serves the API: session + acceptance + owner delete work.
      const submissionId = randomUUID();
      const ownerSecret = randomBase64Url32();
      const benchmark = syntheticSubmission({ submission_id: submissionId });
      const body = JSON.stringify({ benchmark, description_md: "integration" });
      const sessionId = randomUUID();
      await rt.createUploadSession({
        session_id: sessionId, submission_id: submissionId, body_sha256: sha256HexUtf8(body),
        owner_hash: ownerHashFor(ownerSecret), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      await rt.markSessionVerified(sessionId);
      const session = (await rt.getUploadSession(sessionId))!;
      const permit = mintUploadPermit({
        permitSecret: PERMIT_SECRET, sessionId, submissionId, bodySha256: sha256HexUtf8(body),
        ownerHash: ownerHashFor(ownerSecret),
        expiresAtMs: permitExpiryForSession(Date.parse(session.expires_at), Date.parse(session.verified_at!)),
      }).permit;
      const created = await rt.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA));
      expect(created.outcome).toBe("created");
      // Runtime audit inserts work (sequence usage granted).
      await rt.audit("runtime", "publish", submissionId, null);
      // Runtime column grants exclude moderation writes: hidden stays operator-only.
      await expect(rt.setHidden(submissionId, true)).rejects.toThrow(/permission denied/);
      expect(await rt.deleteRun(submissionId)).not.toBeNull();

      // Runtime cannot read the audit log, run DDL, or dismiss reports.
      await expect(rtSql`select * from bench.audit_log limit 1`).rejects.toThrow();
      await expect(rtSql.unsafe("CREATE TABLE bench.it_probe (id int)")).rejects.toThrow();
      await expect(rt.deleteReport(randomUUID())).rejects.toThrow();

      // Reports enter through the public path; moderation triages but cannot create runs.
      const target = randomUUID();
      const reporter = await rt.createReport({ target_submission_id: target, reason: "triage", reporter_ip_hmac: null });
      expect((await mod.listReports(10)).some((r) => r.id === reporter.id)).toBe(true);
      await mod.setHidden(submissionId, true);
      await mod.audit("moderation-cli", "hide", submissionId, "test");
      await mod.deleteReport(reporter.id);
      await expect(mod.createUploadSession({
        session_id: randomUUID(), submission_id: randomUUID(), body_sha256: "a".repeat(64),
        owner_hash: "b".repeat(64), expires_at: new Date().toISOString(),
      })).rejects.toThrow();
      // Moderation cannot create runs or quota state either (direct SQL, least privilege).
      await expect(modSql`
        insert into bench.benchmark_runs (submission_id, public_id, owner_hash, body_sha256)
        values (${randomUUID()}, 'bxxxxxxxxxxx', ${"c".repeat(64)}, ${"d".repeat(64)})
      `).rejects.toThrow(/permission denied/);
      await expect(modSql`
        insert into bench.quota_buckets (key, count, bytes, rows, window_start, expires_at)
        values ('it:probe', 1, 0, 0, now(), now() + interval '1 hour')
      `).rejects.toThrow(/permission denied/);
    } finally {
      await rtSql.end({ timeout: 5 });
      await modSql.end({ timeout: 5 });
    }
  });

  it("prunes dead session rows under the runtime role, keeping the ledger intact", async () => {
    if (!db) return;
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    const rt = new PostgresBenchmarkStore(rtSql);
    try {
      // A run + its sessions, aged past the retention window in the database.
      const submissionId = randomUUID();
      const ownerSecret = randomBase64Url32();
      const benchmark = syntheticSubmission({ submission_id: submissionId });
      // acceptArgs() hashes this exact body; the upload session must bind it.
      const body = JSON.stringify({ benchmark, description_md: "integration" });
      const uploadId = randomUUID();
      await rt.createUploadSession({
        session_id: uploadId, submission_id: submissionId, body_sha256: sha256HexUtf8(body),
        owner_hash: ownerHashFor(ownerSecret), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      await rt.markSessionVerified(uploadId);
      const verifiedUpload = (await rt.getUploadSession(uploadId))!;
      const permit = mintUploadPermit({
        permitSecret: PERMIT_SECRET, sessionId: uploadId, submissionId, bodySha256: sha256HexUtf8(body),
        ownerHash: ownerHashFor(ownerSecret),
        expiresAtMs: permitExpiryForSession(Date.parse(verifiedUpload.expires_at), Date.parse(verifiedUpload.verified_at!)),
      }).permit;
      expect((await rt.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))).outcome).toBe("created");
      await rt.audit("runtime", "publish", submissionId, null);
      const report = await rt.createReport({ target_submission_id: submissionId, reason: "retention", reporter_ip_hmac: "hmac" });

      const expiredMgmt = randomUUID();
      const revokedMgmt = randomUUID();
      for (const id of [expiredMgmt, revokedMgmt]) {
        await rt.createManagementSession({
          id, submission_id: submissionId, csrf_token_hash: "e".repeat(64),
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        });
      }
      await rt.revokeManagementSession(revokedMgmt);
      // A live session that must survive the prune.
      const liveMgmt = randomUUID();
      await rt.createManagementSession({
        id: liveMgmt, submission_id: submissionId, csrf_token_hash: "f".repeat(64),
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });

      await db!`update bench.upload_sessions set expires_at = now() - interval '26 hours' where session_id = ${uploadId}`;
      await db!`update bench.management_sessions set expires_at = now() - interval '26 hours' where id = ${expiredMgmt}`;
      await db!`update bench.management_sessions set revoked_at = now() - interval '26 hours' where id = ${revokedMgmt}`;

      // Runtime holds exactly the DELETE grants the retention job needs (005).
      expect(await rt.pruneUploadSessions()).toBeGreaterThanOrEqual(1);
      expect(await rt.pruneManagementSessions()).toBe(2);
      expect(await rt.getUploadSession(uploadId)).toBeNull();
      expect(await rt.getManagementSession(expiredMgmt)).toBeNull();
      expect(await rt.getManagementSession(revokedMgmt)).toBeNull();
      // Still inside its TTL: untouched.
      expect(await rt.getManagementSession(liveMgmt)).not.toBeNull();

      // The ledger survives: run row, audit entries, and the report itself.
      expect(await rt.getRunBySubmission(submissionId)).not.toBeNull();
      expect((await db!`select count(*)::int as n from bench.audit_log where target = ${submissionId}`)[0]!.n).toBeGreaterThanOrEqual(1);
      expect((await db!`select count(*)::int as n from bench.reports where id = ${report.id}`)[0]!.n).toBe(1);

      // Tombstones stay after an owner delete, and the retention job cannot
      // remove runs, reports, or audit rows under the runtime role.
      expect(await rt.deleteRun(submissionId)).not.toBeNull();
      await expect(rtSql`delete from bench.benchmark_runs where submission_id = ${submissionId}`).rejects.toThrow(/permission denied/);
      await expect(rtSql`delete from bench.reports where id = ${report.id}`).rejects.toThrow(/permission denied/);
      await expect(rtSql`delete from bench.audit_log where target = ${submissionId}`).rejects.toThrow(/permission denied/);
      expect((await db!`select count(*)::int as n from bench.benchmark_runs where submission_id = ${submissionId}`)[0]!.n).toBe(1);
    } finally {
      await rtSql.end({ timeout: 5 });
    }
  });

  it("redeems a management handoff ticket exactly once under the runtime role", async () => {
    if (!db) return;
    const rtSql = postgres(runtimeUrl, { max: 2, prepare: false, ssl: false });
    const rt = new PostgresBenchmarkStore(rtSql);
    try {
      const submissionId = randomUUID();
      const ownerSecret = randomBase64Url32();
      const body = JSON.stringify({ benchmark: syntheticSubmission({ submission_id: submissionId }), description_md: "integration" });
      const uploadId = randomUUID();
      await rt.createUploadSession({
        session_id: uploadId, submission_id: submissionId, body_sha256: sha256HexUtf8(body),
        owner_hash: ownerHashFor(ownerSecret), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      await rt.markSessionVerified(uploadId);
      const verifiedUpload = (await rt.getUploadSession(uploadId))!;
      const permit = mintUploadPermit({
        permitSecret: PERMIT_SECRET, sessionId: uploadId, submissionId, bodySha256: sha256HexUtf8(body),
        ownerHash: ownerHashFor(ownerSecret),
        expiresAtMs: permitExpiryForSession(Date.parse(verifiedUpload.expires_at), Date.parse(verifiedUpload.verified_at!)),
      }).permit;
      expect((await rt.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))).outcome).toBe("created");

      const ticket = randomUUID();
      const tokenHash = "a".repeat(64);
      await rt.createManagementSession({
        id: ticket, submission_id: submissionId, csrf_token_hash: tokenHash, expires_at: new Date(Date.now() + 120_000).toISOString(),
      });
      const session = (): { id: string; csrf_token_hash: string; expires_at: string } => ({
        id: randomUUID(), csrf_token_hash: "b".repeat(64), expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      expect(await rt.redeemManagementHandoff(ticket, "c".repeat(64), session())).toEqual({ outcome: "invalid" });
      const results = await Promise.all([
        rt.redeemManagementHandoff(ticket, tokenHash, session()),
        rt.redeemManagementHandoff(ticket, tokenHash, session()),
      ]);
      const winners = results.flatMap((r) => (r.outcome === "redeemed" ? [r.session] : []));
      expect(winners).toHaveLength(1);
      expect(winners[0]!.submission_id).toBe(submissionId);
      expect(results.map((r) => r.outcome).sort()).toEqual(["invalid", "redeemed"]);
      expect((await rt.getManagementSession(ticket))!.revoked_at).not.toBeNull();
      expect(await rt.redeemManagementHandoff(ticket, tokenHash, session())).toEqual({ outcome: "invalid" });

      // Expired tickets never redeem; deletion after issue answers "deleted".
      const expired = randomUUID();
      await rt.createManagementSession({ id: expired, submission_id: submissionId, csrf_token_hash: tokenHash, expires_at: new Date(Date.now() + 120_000).toISOString() });
      await db!`update bench.management_sessions set expires_at = now() - interval '1 second' where id = ${expired}`;
      expect(await rt.redeemManagementHandoff(expired, tokenHash, session())).toEqual({ outcome: "invalid" });
      const pending = randomUUID();
      await rt.createManagementSession({ id: pending, submission_id: submissionId, csrf_token_hash: tokenHash, expires_at: new Date(Date.now() + 120_000).toISOString() });
      expect(await rt.deleteRun(submissionId)).not.toBeNull();
      expect(await rt.redeemManagementHandoff(pending, tokenHash, session())).toEqual({ outcome: "deleted" });
      expect((await db!`select count(*)::int as n from bench.management_sessions where submission_id = ${submissionId} and revoked_at is null`)[0]!.n).toBe(0);
    } finally {
      await rtSql.end({ timeout: 5 });
    }
  });

  it("creates trigram filter indexes when pg_trgm lives outside the default search_path", async () => {
    if (!admin) return;
    // A managed cluster commonly installs pg_trgm into a dedicated `extensions`
    // schema. CREATE EXTENSION IF NOT EXISTS leaves it there, so an unqualified
    // gin_trgm_ops would not resolve. Clean isolated database, nothing shared.
    const scratchName = `aiolm_web_trgm_${Date.now().toString(36)}`;
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`);
    const scratchUrl = new URL(ADMIN_URL!);
    scratchUrl.pathname = `/${scratchName}`;
    const scratch = postgres(scratchUrl.toString(), { max: 1, prepare: false, ssl: false });
    try {
      await scratch.unsafe("CREATE SCHEMA extensions");
      await scratch.unsafe("CREATE EXTENSION pg_trgm WITH SCHEMA extensions");
      const where = await scratch<Array<{ nspname: string }>>`
        select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
        where e.extname = 'pg_trgm'`;
      expect(where[0]!.nspname).toBe("extensions");
      // Sanity: the unqualified spelling really is unresolvable here.
      await expect(scratch.unsafe(
        "create index it_unqualified_probe on pg_catalog.pg_class using gin ((relname) gin_trgm_ops)",
      )).rejects.toThrow();

      expect(await applyMigrations(scratch)).toContain("006_trgm_filter_indexes.sql");
      const idx = await scratch<Array<{ indexname: string }>>`
        select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`;
      const names = idx.map((r) => r.indexname);
      for (const name of [
        "benchmark_runs_model_trgm",
        "benchmark_runs_hardware_trgm",
        "benchmark_runs_method_trgm",
        "benchmark_runs_workload_trgm",
      ]) {
        expect(names).toContain(name);
      }
      // The operator class actually used comes from the non-default schema.
      const opc = await scratch<Array<{ nspname: string }>>`
        select distinct n.nspname
        from pg_index i
        join pg_class c on c.oid = i.indexrelid
        join pg_opclass o on o.oid = any (i.indclass::oid[])
        join pg_namespace n on n.oid = o.opcnamespace
        where c.relname = 'benchmark_runs_model_trgm'`;
      expect(opc.map((r) => r.nspname)).toContain("extensions");
    } finally {
      await scratch.end({ timeout: 5 });
      await admin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${scratchName}' AND pid <> pg_backend_pid()`,
      );
      await admin.unsafe(`DROP DATABASE "${scratchName}"`);
    }
  }, 120_000);

  it("prunes expired quotas and clears old report IP HMACs", async () => {
    const s = need();
    if (!s || !db) return;
    await s.quotaGateAtomic("it:prune", 60_000, 10, 1_000);
    expect(await s.quotaPrune(2_000)).toBe(0);
    expect(await s.quotaPrune(61_001)).toBeGreaterThanOrEqual(1);

    const report = await s.createReport({ target_submission_id: randomUUID(), reason: "old", reporter_ip_hmac: "hmac" });
    await db!`update bench.reports set created_at = now() - interval '25 hours' where id = ${report.id}`;
    expect(await s.clearExpiredReportIpHmacs()).toBeGreaterThanOrEqual(1);
    const rows = await db!`select reporter_ip_hmac from bench.reports where id = ${report.id}`;
    expect(rows[0]!.reporter_ip_hmac).toBeNull();
  });

  it("answers the readiness probe under the least-privilege runtime role", async () => {
    if (!db) return;
    // GET /v1/readiness reads the migration ledger to prove the schema is
    // really there AND that every required file was applied. The web function
    // only ever holds the runtime role, so the probe is worthless unless 007
    // granted it SELECT on that table.
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    try {
      const rt = new PostgresBenchmarkStore(rtSql);
      const applied = await rt.appliedMigrations();
      expect([...applied].sort()).toEqual([...REQUIRED_MIGRATIONS]);
      // The grant is SELECT and nothing more: the ledger stays immutable.
      await expect(rtSql`delete from bench.schema_migrations where filename = '001_init.sql'`)
        .rejects.toThrow(/permission denied/);
      await expect(rtSql`insert into bench.schema_migrations (filename, sha256) values ('x', 'y')`)
        .rejects.toThrow(/permission denied/);
    } finally {
      await rtSql.end({ timeout: 5 });
    }
  });

  it("keeps readiness unavailable until migration 015 is present under the runtime role", async () => {
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    const migration = "015_engine_neutral_benchmarks.sql";
    const [saved] = await db!`select sha256 from bench.schema_migrations where filename = ${migration}`;
    expect(saved).toBeDefined();
    __setTestStore(new PostgresBenchmarkStore(rtSql));
    try {
      expect((await getReadiness()).status).toBe(200);
      await db!`delete from bench.schema_migrations where filename = ${migration}`;
      expect((await getReadiness()).status).toBe(503);
    } finally {
      await db!`insert into bench.schema_migrations (filename, sha256) values (${migration}, ${saved!.sha256}) on conflict (filename) do nothing`;
      expect((await getReadiness()).status).toBe(200);
      __setTestStore(null);
      await rtSql.end({ timeout: 5 });
    }
  });

  it("bounds the readiness read inside PostgreSQL and leaves no timeout behind", async () => {
    if (!db) return;
    // A client-side promise race only stops the caller waiting; the statement
    // keeps running and keeps a pooled backend busy. The probe sets
    // statement_timeout so the SERVER aborts it - including while it is blocked
    // on a lock, which is exactly what a migration in flight looks like.
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    const locker = postgres(ownerUrl, { max: 1, prepare: false, ssl: false });
    let releaseLock: () => void = () => {};
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let lockAcquired: () => void = () => {};
    const lockHeld = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const holding = locker.begin(async (tx) => {
      await tx`lock table bench.schema_migrations in access exclusive mode`;
      lockAcquired();
      await lockReleased;
    });
    try {
      await lockHeld;
      const rt = new PostgresBenchmarkStore(rtSql);
      const started = Date.now();
      // The message, not just the SQLSTATE, is the assertion that matters.
      // postgres.js raises 57014 for its own client-side cancel too ("due to
      // user request"), so matching the code alone would still pass with the
      // server-side bound removed. "due to statement timeout" can only come
      // from PostgreSQL ending the statement itself.
      await expect(rt.appliedMigrations(250)).rejects.toMatchObject({
        code: "57014",
        message: expect.stringContaining("statement timeout") as unknown as string,
      });
      // Bounded by the server at ~250ms, not by the 750ms client backstop and
      // not by a client that simply walked away.
      expect(Date.now() - started).toBeLessThan(700);
    } finally {
      releaseLock();
      await holding;
      await locker.end({ timeout: 5 });
    }

    try {
      const rt = new PostgresBenchmarkStore(rtSql);
      // The connection is immediately reusable - nothing was left running.
      expect([...(await rt.appliedMigrations())].sort()).toEqual([...REQUIRED_MIGRATIONS]);
      // set_config(..., is_local => true) scoped the timeout to the probe's own
      // transaction. A transaction pooler hands this same backend to the next
      // client the moment that transaction commits, so a session-level SET
      // would silently become somebody else's statement_timeout.
      const leaked = await rtSql<Array<{ setting: string }>>`
        select current_setting('statement_timeout') as setting`;
      expect(leaked[0]!.setting).toBe("0");
    } finally {
      await rtSql.end({ timeout: 5 });
    }
  }, 60_000);

  it("installs the scheduled retention job and matches the TypeScript prune semantics", async () => {
    if (!db) return;
    const script = readFileSync(join(process.cwd(), "sql", "operations", "retention-pg_cron.sql"), "utf8");
    // The script wraps the function install in BEGIN/COMMIT, exactly as
    // `psql -f` will run it, so it needs a reserved single connection.
    const owner = postgres(ownerUrl, { max: 1, prepare: false, ssl: false });
    try {
      // This cluster has no pg_cron, which is the point: the operational script
      // must still install bench.run_retention() and only skip the scheduling.
      await owner.unsafe(script);
      const cron = await owner`select count(*)::int as n from pg_extension where extname = 'pg_cron'`;
      expect(cron[0]!.n).toBe(0);
      // Re-runnable: create-or-replace plus the same job name, no duplicates.
      await owner.unsafe(script);
    } finally {
      await owner.end({ timeout: 5 });
    }

    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const benchmark = syntheticSubmission({ submission_id: submissionId });
    // acceptArgs() hashes this exact body; the upload session must bind it.
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const bodySha = sha256HexUtf8(body);
    const s2 = need();
    if (!s2) return;
    const permit = await verifiedSession(submissionId, ownerSecret, bodySha);
    expect((await s2.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))).outcome).toBe("created");
    await s2.audit("moderation-cli", "hide", submissionId, "cron-retention");
    const report = await s2.createReport({ target_submission_id: submissionId, reason: "cron", reporter_ip_hmac: "hmac" });

    const deadUpload = randomUUID();
    await s2.createUploadSession({
      session_id: deadUpload, submission_id: submissionId, body_sha256: bodySha,
      owner_hash: ownerHashFor(ownerSecret), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const expiredMgmt = randomUUID();
    const revokedMgmt = randomUUID();
    const liveMgmt = randomUUID();
    for (const id of [expiredMgmt, revokedMgmt, liveMgmt]) {
      await s2.createManagementSession({
        id, submission_id: submissionId, csrf_token_hash: "a".repeat(64),
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
    }
    await s2.revokeManagementSession(revokedMgmt);
    await db!`update bench.upload_sessions set expires_at = now() - interval '26 hours' where session_id = ${deadUpload}`;
    await db!`update bench.management_sessions set expires_at = now() - interval '26 hours' where id = ${expiredMgmt}`;
    await db!`update bench.management_sessions set revoked_at = now() - interval '26 hours' where id = ${revokedMgmt}`;
    await db!`update bench.reports set created_at = now() - interval '26 hours' where id = ${report.id}`;
    await db!`insert into bench.quota_buckets (key, count, bytes, rows, window_start, expires_at)
      values ('cron-retention-bucket', 1, 0, 0, now() - interval '2 hours', now() - interval '1 hour')`;

    const pass = await db!`select bench.run_retention() as counters`;
    const counters = pass[0]!.counters as Record<string, number>;
    expect(counters["prunedQuotaBuckets"]).toBeGreaterThanOrEqual(1);
    expect(counters["clearedReportIpHmacs"]).toBeGreaterThanOrEqual(1);
    expect(counters["prunedManagementSessions"]).toBe(2);
    expect(counters["prunedUploadSessions"]).toBeGreaterThanOrEqual(1);

    expect(await s2.getUploadSession(deadUpload)).toBeNull();
    expect(await s2.getManagementSession(expiredMgmt)).toBeNull();
    expect(await s2.getManagementSession(revokedMgmt)).toBeNull();
    // Inside its TTL, so the pass leaves it alone.
    expect(await s2.getManagementSession(liveMgmt)).not.toBeNull();
    // The ledgers survive: the run row, the audit trail and the report itself.
    expect(await s2.getRunBySubmission(submissionId)).not.toBeNull();
    expect((await db!`select count(*)::int as n from bench.audit_log where target = ${submissionId}`)[0]!.n)
      .toBeGreaterThanOrEqual(1);
    const survivingReport = await db!`select reporter_ip_hmac from bench.reports where id = ${report.id}`;
    expect(survivingReport).toHaveLength(1);
    expect(survivingReport[0]!.reporter_ip_hmac).toBeNull();

    // A second pass with nothing eligible removes nothing.
    const idle = (await db!`select bench.run_retention() as counters`)[0]!.counters as Record<string, number>;
    expect(idle["prunedManagementSessions"]).toBe(0);
    expect(idle["prunedUploadSessions"]).toBe(0);

    // Least privilege: the roles that serve traffic and moderate cannot start
    // a retention pass, even though the runtime role holds the DELETE grants.
    for (const url of [runtimeUrl, moderationUrl]) {
      const restricted = postgres(url, { max: 1, prepare: false, ssl: false });
      try {
        await expect(restricted`select bench.run_retention()`).rejects.toThrow(/permission denied/);
      } finally {
        await restricted.end({ timeout: 5 });
      }
    }
  }, 120_000);

  it("measures a real storage footprint", async () => {
    const s = need();
    if (!s) return;
    const footprint = await s.storageFootprint();
    expect(footprint.bytes).toBeGreaterThan(0);
    expect(footprint.rows).toBeGreaterThan(0);
  });
  it.each(["llama.cpp", "vllm", "mlx-vlm", "sglang", null].map((engine, index) => ({ engine, ip: `10.30.30.${index + 1}` })))(
    "serves the authenticated $engine HTTP publish flow against the real database",
    async ({ engine, ip }) => {
      const s = need();
      if (!s || !db) return;
      // Route handlers read deployment config from the environment; point them
      // at this test's secrets/origin for the duration of the flow.
      const saved = new Map<string, string | undefined>();
      const setEnv = (key: string, value: string): void => {
        if (!saved.has(key)) saved.set(key, process.env[key]);
        process.env[key] = value;
      };
      setEnv("NODE_ENV", "test");
      setEnv("SYNTHETIC_TEST_MODE", "1");
      setEnv("SERVICE_ORIGIN", "http://localhost:3000");
      setEnv("PERMIT_HMAC_SECRET", PERMIT_SECRET);
      setEnv("QUOTA_HMAC_SECRET", QUOTA_SECRET);
      setEnv("MANAGEMENT_HMAC_SECRET", MGMT_SECRET);
      setEnv("TEST_FIXTURE_TURNSTILE_TOKEN", "test-turnstile-ok");
      __setTestStore(s);
      try {
        const submissionId = randomUUID();
        const ownerSecret = randomBase64Url32();
        const benchmark = syntheticSubmission({
          submission_id: submissionId,
          runtime: { name: engine, version: null, backend: null, variant: null, build: null, plugin_version: null },
        });
        const body = JSON.stringify({ benchmark, description_md: "http-flow" });
        const bodySha = sha256HexUtf8(body);
        const headers = (extra: Record<string, string> = {}): Headers =>
          new Headers({ "x-synthetic-test-ip": ip, ...extra });
        const auth = { authorization: `Bearer ${ownerSecret}` };

        const created = await createUploadSession(
          new Request("http://localhost:3000/v1/upload-sessions", {
            method: "POST",
            headers: headers({ ...auth, "content-type": "application/json" }),
            body: JSON.stringify({ submission_id: submissionId, body_sha256: bodySha }),
          }),
        );
        expect(created.status).toBe(201);
        const { session_id: sessionId } = (await created.json()) as { session_id: string };

        const verified = await verifyUploadSession(
          new Request(`http://localhost:3000/v1/upload-sessions/${sessionId}/verify`, {
            method: "POST",
            headers: headers({ "content-type": "application/json" }),
            body: JSON.stringify({ token: "test-turnstile-ok" }),
          }),
          { params: Promise.resolve({ id: sessionId }) },
        );
        expect(verified.status).toBe(200);

        const polled = await pollUploadSession(
          new Request(`http://localhost:3000/v1/upload-sessions/${sessionId}`, { headers: headers(auth) }),
          { params: Promise.resolve({ id: sessionId }) },
        );
        expect(polled.status).toBe(200);
        const { permit, status } = (await polled.json()) as { permit?: string; status: string };
        expect(status).toBe("verified");
        expect(permit).toBeTruthy();

        const submit = (secret: string, withPermit: boolean): Promise<Response> =>
          submitBenchmarkRun(
            new Request("http://localhost:3000/v1/benchmark-runs", {
              method: "POST",
              headers: headers({
                authorization: `Bearer ${secret}`,
                "content-type": "application/json",
                "idempotency-key": submissionId,
                ...(withPermit ? { "x-upload-permit": permit! } : {}),
              }),
              body,
            }),
          );
        const first = await submit(ownerSecret, true);
        expect(first.status).toBe(201);
        const receipt = (await first.json()) as { id: string };
        const stored = await s.getRunByPublicId(receipt.id);
        expect(stored?.benchmark).toMatchObject({ runtime: benchmark.runtime, model: benchmark.model, execution: benchmark.execution });
        expect(stored?.summary.setup.runtime).toBe(engine);
        expect(stored?.summary.schema_version).toBe(4);
        expect(stored?.summary.method_label).toBe("openai-chat-serving@5");
        expect((await s.getRowSlice(submissionId, 0, 10)).rows).toEqual(JSON.parse(JSON.stringify(benchmark.measurements.rows)));
        const [generated] = await db`select method_version from bench.benchmark_runs where submission_id = ${submissionId}`;
        expect(generated!.method_version).toBe(5);
        // Accepted replay without a fresh permit returns the same receipt.
        const replay = await submit(ownerSecret, false);
        expect(replay.status).toBe(200);
        expect(((await replay.json()) as { id: string }).id).toBe(receipt.id);
        // Wrong owner is rejected against real stored hashes.
        expect((await submit(randomBase64Url32(), true)).status).toBe(403);
        await s.deleteRun(submissionId);
      } finally {
        __setTestStore(null);
        for (const [key, value] of saved) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  );

  describe("engine-neutral serving discovery and management", () => {
    const descriptor: SettingDescriptor = { target: "launch", scope: [], name: "batch", unit: null, role: null };
    const memory = new InMemoryBenchmarkStore();
    const ids: string[] = [];

    async function publish(benchmark: PublicBenchmarkSubmission, summary?: BenchmarkSummary) {
      const submissionId = randomUUID(), ownerSecret = randomBase64Url32();
      benchmark = { ...benchmark, submission_id: submissionId };
      const body = JSON.stringify({ benchmark, description_md: "serving-integration" });
      const hash = sha256HexUtf8(body);
      const permit = await verifiedSession(submissionId, ownerSecret, hash);
      const args: AcceptArgs = {
        ...acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA),
        body_sha256: hash,
        benchmarkMeta: { ...benchmark, measurements: { ...benchmark.measurements, rows: [] } },
        rows: benchmark.measurements.rows,
        summary: summary ?? summarizeBenchmark(benchmark),
        byte_size: Buffer.byteLength(body),
        row_count: benchmark.measurements.rows.length,
      };
      const accepted = await store!.acceptRunAtomic(args);
      expect(accepted.outcome).toBe("created");
      if (accepted.outcome !== "created") throw new Error("serving acceptance failed");
      ids.push(submissionId);
      memory.runs.set(accepted.run.submission_id, accepted.run);
      return accepted.run;
    }

    afterEach(async () => {
      for (const id of ids.splice(0)) await store!.deleteRun(id);
      memory.runs.clear();
      memory.byPublic.clear();
    });

    async function parity(filters: BenchmarkFilters) {
      const sql = await store!.listRuns(filters, 100, null);
      const local = await memory.listRuns(filters, 100, null);
      expect(sql.items.map(r => r.public_id)).toEqual(local.items.map(r => r.public_id));
      return sql;
    }

    it("filters configured workload facts without rewriting stored summaries", async () => {
      const fixture = syntheticSubmission();
      fixture.runtime.version = "workload-facts";
      fixture.workload = {
        ...fixture.workload,
        inputs: [{ bytes: 4096, sha256: "a".repeat(64) }, { bytes: 16384, sha256: "b".repeat(64) }],
        concurrencies: [1, 4],
        repetitions: 3,
        request_usage: true,
      };
      const run = await publish(fixture);
      const filters: BenchmarkFilters = {
        runtime_version: "workload-facts", input_bytes_min: 16384, max_concurrency_min: 4,
        repetitions_min: 3, repetitions_max: 3, warmup: false, request_usage: true,
      };
      expect((await parity(filters)).items.map(item => item.public_id)).toEqual([run.public_id]);
      expect((await parity({ ...filters, warmup: true })).items).toEqual([]);
      expect((await parity({ ...filters, repetitions_min: 4 })).items).toEqual([]);
      expect((await parity({ ...filters, input_bytes_min: 16385 })).items).toEqual([]);
      expect(await store!.listOptions("runtime", "", filters)).toEqual(await memory.listOptions("runtime", "", filters));
      const stored = await db!`select summary from bench.benchmark_runs where submission_id = ${run.submission_id}`;
      expect(stored[0]!.summary).toEqual(JSON.parse(JSON.stringify(run.summary)));
    });

    it("returns stored host inventory on LIST and DETAIL without rewriting payloads or selected GPU meanings", async () => {
      const hostGpu = { name: "Integrated Host Device", vendor: "Host Inventory Vendor", vram_mb: null, driver: null, integrated: true };
      const selectedGpu = { name: "Selected Compute Device", vendor: "Compute Vendor", vram_mb: 4096, driver: "compute-driver", integrated: false };
      const environment = syntheticSubmission().environment!;
      const cases: Array<[string, typeof environment | null]> = [
        ["uncollected", { ...environment, cpu: { name: "Distinct Host CPU", physical_cores: 8, logical_cores: 16 }, installed_gpus: [hostGpu], execution: { mode: "unknown", selected_gpus: [], selection_complete: false } }],
        ["selected", { ...environment, installed_gpus: [hostGpu], execution: { mode: "selected", selected_gpus: [selectedGpu], selection_complete: true } }],
        ["empty", { ...environment, installed_gpus: [] }],
        ["unavailable", null],
      ];
      const published = [];
      for (const [label, env] of cases) {
        const fixture = syntheticSubmission({ environment: env });
        fixture.runtime.version = "host-inventory-regression";
        const retained = summarizeBenchmark(fixture);
        retained.serving_points[0]!.output_bytes_per_second = { median: 321, min: 123, max: 456, samples: 7 };
        const run = await publish(fixture, retained);
        published.push({ label, run });
      }
      const before = await db!`select public_id, benchmark, summary, revision, body_sha256 from bench.benchmark_runs where submission_id = any(${ids}) order by public_id`;
      const filters = { runtime_version: "host-inventory-regression" };
      const listed = await parity(filters);
      expect(listed.items).toEqual((await memory.listRuns(filters, 100, null)).items);
      for (const { label, run } of published) {
        const item = listed.items.find(item => item.public_id === run.public_id)!;
        expect(item.summary.setup.host_gpus).toEqual(label === "unavailable" ? null : label === "empty" ? [] : [hostGpu]);
        expect(item.summary.setup.execution_selection_complete).toBe(label === "unavailable" ? null : label !== "uncollected");
        expect(item.summary.setup.gpus).toEqual(label === "selected" ? ["Selected Compute Device"] : []);
        expect(item.summary.setup.vram_mb).toBe(label === "selected" ? 4096 : null);
        expect(item.summary.setup.max_input_bytes).toBe(4096);
        expect(item.summary.serving_points[0]!.output_bytes_per_second).toEqual({ median: 321, min: 123, max: 456, samples: 7 });
        expect((await store!.getRunByPublicId(run.public_id))!.summary).toEqual(item.summary);
        expect((await store!.getRunBySubmission(run.submission_id))!.summary).toEqual(item.summary);
        expect((await memory.getRunByPublicId(run.public_id))!.summary).toEqual(item.summary);
        expect(item).not.toHaveProperty("benchmark_metadata");
        expect(item).not.toHaveProperty("benchmark");
      }
      const uncollected = published.find(p => p.label === "uncollected")!.run;
      expect(listed.items.find(item => item.public_id === uncollected.public_id)!.summary.hardware_label).toBe("Host CPU: Distinct Host CPU");
      for (const q of ["Integrated Host Device", "Host Inventory Vendor"]) expect((await parity({ ...filters, q })).items).toHaveLength(2);
      expect((await parity({ ...filters, q: "Distinct Host CPU" })).items.map(item => item.public_id)).toEqual([uncollected.public_id]);
      for (const filtersWithHostAsSelected of [{ gpu: hostGpu.name }, { vendor: hostGpu.vendor }]) expect((await parity({ ...filters, ...filtersWithHostAsSelected })).items).toEqual([]);
      for (const field of ["gpu", "vendor", "hardware"] as const) expect(await store!.listOptions(field, "", filters)).toEqual(await memory.listOptions(field, "", filters));
      const after = await db!`select public_id, benchmark, summary, revision, body_sha256 from bench.benchmark_runs where submission_id = any(${ids}) order by public_id`;
      expect(after).toEqual(before);
    });

    it.each(["llama.cpp", "vllm", "mlx-vlm", "sglang", null])("accepts and manages %s with canonical generated identity and tombstone erasure", async name => {
      const fixture = syntheticSubmission();
      fixture.runtime = { name, version: "1", variant: "arbitrary-safe", build: "build", plugin_version: "plugin", backend: null };
      fixture.model = { format: "unknown", status: "sha256", sha256: "b".repeat(64), size_bytes: 1234,
        source: { kind: "huggingface", repository: "Example/Model", revision: "c".repeat(40) } };
      const run = await publish(fixture);
      const columns = Object.keys(run.summary.identity);
      expect(columns).toHaveLength(13);
      const generated = await db!.unsafe(`select ${columns.join(", ")} from bench.benchmark_runs where submission_id = $1`, [run.submission_id]);
      expect({ ...generated[0], model_size_bytes: Number(generated[0]!.model_size_bytes) }).toEqual(run.summary.identity);
      const runtimeDb = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
      try {
        for (const column of columns) {
          const [privilege] = await runtimeDb`select has_column_privilege(current_user, 'bench.benchmark_runs', ${column}, 'UPDATE') as allowed`;
          expect(privilege!.allowed).toBe(false);
        }
        await expect(runtimeDb`update bench.benchmark_runs set app_version = 'forged' where submission_id = ${run.submission_id}`).rejects.toThrow();
      } finally {
        await runtimeDb.end({ timeout: 5 });
      }
      for (const filters of [{ model_sha256: "b".repeat(64) }, { model_query: "Example/Model" }, { q: "c".repeat(40) }]) {
        expect((await parity(filters)).items.map(item => item.public_id)).toContain(run.public_id);
      }
      expect((await store!.listOptions("runtime", "", {})).options.some(option => option.value === name)).toBe(name !== null);
      expect(await store!.updateDescription(run.submission_id, "edited", 1)).toMatchObject({ revision: 2 });
      const handoffId = randomUUID(), token = sha256HexUtf8("handoff");
      await store!.createManagementSession({ id: handoffId, submission_id: run.submission_id, csrf_token_hash: token, expires_at: new Date(Date.now() + 60_000).toISOString() });
      expect(await store!.getManagementSession(handoffId)).not.toBeNull();
      expect((await store!.getRowSlice(run.submission_id, 0, 10)).rows).toEqual(fixture.measurements.rows);
      await store!.deleteRun(run.submission_id);
      const tombstone = await db!.unsafe(`select benchmark, deleted, ${columns.join(", ")} from bench.benchmark_runs where submission_id = $1`, [run.submission_id]);
      expect(tombstone[0]!.deleted).toBe(true);
      for (const column of ["benchmark", ...columns]) expect(tombstone[0]![column]).toBeNull();
      expect((await db!`select count(*)::int as n from bench.benchmark_chunks where submission_id = ${run.submission_id}`)[0]!.n).toBe(0);
    });

    it("matches exact same-element descriptors, ordered arrays, false/zero and AND ranges in both stores", async () => {
      const values: Array<SettingValue | null> = [2, 64, false, 0, [1, 2], [2, 1], null];
      const runs = [];
      for (const value of values) {
        const fixture = syntheticSubmission();
        fixture.execution.settings.push({ ...descriptor, value: Array.isArray(value) ? [...value] : value },
          { ...descriptor, scope: ["serve"], value: 64 });
        runs.push(await publish(fixture));
      }
      for (const filters of [{ runtime: "sglang' OR true --" }, { model_query: "sglang' OR true --" }]) {
        expect((await parity(filters)).items).toEqual([]);
      }
      for (const value of values.filter(value => value !== null)) {
        expect((await parity({ setting: [{ ...descriptor, op: "eq", value: Array.isArray(value) ? [...value] : value }] })).items).toHaveLength(1);
      }
      expect((await parity({ setting: [{ ...descriptor, op: "range", min: 16, max: 64 }] })).items.map(r => r.public_id)).toEqual([runs[1]!.public_id]);
      expect((await parity({ setting: [{ ...descriptor, op: "range", min: 16 }, { ...descriptor, op: "eq", value: 2 }] })).items).toEqual([]);
      expect((await parity({ setting: [{ ...descriptor, unit: "count", op: "eq", value: 2 }] })).items).toEqual([]);
      const filters: BenchmarkFilters = { setting: [{ ...descriptor, op: "eq", value: 2 }] };
      expect(await store!.listOptions("setting", "", filters)).toEqual(await memory.listOptions("setting", "", filters));
      expect(await store!.listOptions("setting_value", "", filters, descriptor)).toEqual({ options: [{ value: "2", count: 1 }], has_more: false });
      expect(await store!.listOptions("setting_value", "", filters, descriptor)).toEqual(await memory.listOptions("setting_value", "", filters, descriptor));
      const reversed = { setting: [{ ...descriptor, op: "eq" as const, value: 2 }, { ...descriptor, scope: ["serve"], op: "eq" as const, value: 64 }] };
      const first = await store!.listRuns(reversed, 1, null);
      expect(first.items).toHaveLength(1);
      expect(canonicalSettingDescriptor(descriptor)).toBe('{"target":"launch","scope":[],"name":"batch","unit":null,"role":null}');
    });

    it("keeps context roles, scopes and units exact without aliasing typed settings into legacy fields", async () => {
      const fixture = syntheticSubmission();
      const context: SettingDescriptor = { target: "launch", scope: [], name: "ctx-size", unit: "tokens", role: "context.total_tokens" };
      fixture.execution.settings.push(
        { ...context, value: 32768 },
        { ...context, scope: ["serve"], role: "context.per_sequence_tokens", value: 8192 },
        { target: "launch", scope: [], name: "parallel", unit: "count", role: "concurrency.capacity", value: 4 },
      );
      const run = await publish(fixture);
      expect((await parity({ setting: [{ ...context, op: "eq", value: 32768 }] })).items.map(item => item.public_id)).toEqual([run.public_id]);
      for (const mismatch of [
        { ...context, role: "context.per_sequence_tokens" as const },
        { ...context, scope: ["serve"] },
        { ...context, unit: "count" as const },
        { ...context, name: "context_size" },
      ]) expect((await parity({ setting: [{ ...mismatch, op: "eq", value: 32768 }] })).items).toEqual([]);
      const listed = (await parity({ runtime_version: fixture.runtime.version! })).items.find(item => item.public_id === run.public_id)!;
      expect(listed.summary.setup).toMatchObject({ max_input_bytes: 4096, max_concurrency: 1, max_output_tokens: 128 });
      for (const legacy of ["context_size", "parallel", "cache_type_k", "cache_type_v"]) {
        expect(listed.summary.setup).not.toHaveProperty(legacy);
      }
      expect(listed.summary.setup.settings).toEqual(fixture.execution.settings);
      expect(await store!.listOptions("setting_value", "", {}, context)).toEqual({ options: [{ value: "32768", count: 1 }], has_more: false });
      expect(await store!.listOptions("setting_value", "", {}, context)).toEqual(await memory.listOptions("setting_value", "", {}, context));
    });

    it("returns thirty typed C-ordered distinct visible facet values and respects every provided condition", async () => {
      for (let i = 0; i < 31; i++) {
        const fixture = syntheticSubmission();
        fixture.execution.settings.push({ ...descriptor, value: i });
        await publish(fixture);
      }
      const fixture = syntheticSubmission();
      fixture.execution.settings.push({ ...descriptor, value: 0 });
      await publish(fixture);
      const options = await store!.listOptions("setting_value", "", {}, descriptor);
      expect(options).toEqual(await memory.listOptions("setting_value", "", {}, descriptor));
      expect(options.options).toHaveLength(30);
      expect(options.has_more).toBe(true);
      expect(options.options.find(option => option.value === "0")!.count).toBe(2);
      expect(options.options.map(option => option.value)).toEqual(options.options.map(option => option.value).sort());
      const filters: BenchmarkFilters = { setting: [{ ...descriptor, op: "range", min: 29 }] };
      expect(await store!.listOptions("setting_value", "", filters, descriptor)).toEqual(await memory.listOptions("setting_value", "", filters, descriptor));
      expect((await store!.listOptions("setting_value", "", filters, descriptor)).options.map(option => option.value)).toEqual(["29", "30"]);
    });

    it("preserves canonical numeric exponents, string whitespace, arrays and overlimit omission before facet pagination", async () => {
      const values: SettingValue[] = [1e21, 1.1e21, 1e20, 1e-7, 0, false, "a  b", "a b", [1e21, 1e-7], [1e-7, 1e21]];
      for (const value of values) {
        const fixture = syntheticSubmission();
        fixture.execution.settings.push({ ...descriptor, value });
        await publish(fixture);
      }
      const oversized = { ...descriptor, name: "b".repeat(64), scope: Array.from({ length: 8 }, (_, i) => `${i}${"a".repeat(63)}`) };
      const fixture = syntheticSubmission();
      fixture.execution.settings.push({ ...oversized, value: "가".repeat(128) });
      await publish(fixture);
      for (const query of ["", "1e+21", "a  b", "[1e-7", "false"]) {
        expect(await store!.listOptions("setting_value", query, {}, descriptor)).toEqual(await memory.listOptions("setting_value", query, {}, descriptor));
      }
      expect((await store!.listOptions("setting_value", "", {}, oversized)).options).toEqual([]);
      expect(await store!.listOptions("setting", "", {})).toEqual(await memory.listOptions("setting", "", {}));
      const hiddenFixture = syntheticSubmission();
      hiddenFixture.execution.settings.push({ ...descriptor, value: "hidden" });
      const hidden = await publish(hiddenFixture);
      await store!.setHidden(hidden.submission_id, true);
      memory.runs.get(hidden.submission_id)!.hidden = true;
      expect(await store!.listOptions("setting_value", "", {}, descriptor)).toEqual(await memory.listOptions("setting_value", "", {}, descriptor));
    });

    it("ranks one complete operating point, keeps every cap in its own scope and pages identical in SQL and memory", async () => {
      const published = new Map<string, string>();
      for (const [label, duration, bytes, tokens, cap] of [
        ["fast", 1000, 100, 100, 128], ["slow", 2000, 100, 50, 128], ["other-cap", 500, 1000, 1000, 64],
      ] as const) {
        const fixture = syntheticSubmission();
        fixture.runtime.version = "point-scope-parity";
        fixture.workload = { ...fixture.workload, max_output_tokens: cap };
        fixture.measurements.rows = [{
          ...fixture.measurements.rows[0]!, e2e_ms: duration, output_bytes: bytes,
          reported_completion_tokens: tokens, max_output_tokens: cap,
        }];
        published.set(label, (await publish(fixture)).public_id);
      }
      const common = { runtime_version: "point-scope-parity" };
      expect((await parity(common)).items).toHaveLength(3);
      const point: BenchmarkFilters = { ...common, point_bytes: 4096, point_concurrency: 1, point_max_tokens: 128, sort: "token_rate_desc" };
      expect((await parity({ ...point, point_only: true })).items.map(run => run.public_id))
        .toEqual([published.get("fast"), published.get("slow")]);
      for (const sort of ["token_rate_desc", "output_rate_desc", "duration_asc"] as const) {
        const filters: BenchmarkFilters = { ...point, sort };
        const expected = (await parity(filters)).items.map(run => run.public_id), actual = [];
        let cursor: ListCursor | null = null;
        do {
          const page = await store!.listRuns(filters, 1, cursor);
          actual.push(...page.items.map(run => run.public_id));
          cursor = page.next_cursor ? decodeDiscoveryCursor(page.next_cursor, filters) : null;
        } while (cursor);
        expect(actual).toEqual(expected);
        expect(actual).toEqual([published.get("fast"), published.get("slow"), published.get("other-cap")]);
      }
      expect((await parity({ ...point, sort: "token_rate_desc", point_max_tokens: 64, point_only: true })).items
        .map(run => run.public_id)).toEqual([published.get("other-cap")]);
      expect((await parity({ ...point, max_output_tokens_min: 128 })).items.map(run => run.public_id))
        .toEqual([published.get("fast"), published.get("slow")]);
      expect(await store!.listOptions("point", "", common)).toEqual(await memory.listOptions("point", "", common));
      expect((await store!.listOptions("point", "", common)).options.map(option => option.value))
        .toEqual(["b4096/c1/o64", "b4096/c1/o128"]);
      const first = await store!.listRuns(point, 1, null);
      expect(() => decodeDiscoveryCursor(first.next_cursor!, { ...point, point_max_tokens: 64 })).toThrow();
      for (const query of ["point_bytes=4096", "point_bytes=4096&point_concurrency=1", "point_tokens=512&point_concurrency=1",
        "input_bytes_min=1&sort=output_rate_desc", "point_bytes=4096&point_concurrency=1&point_max_tokens=129"]) {
        expect(() => parseFilters(new URLSearchParams(query))).toThrow();
      }
    });

    it("finds an undescribed model by its complete SHA and preserves missing derived rates", async () => {
      const fixture = syntheticSubmission();
      fixture.model = { format: "unknown", status: "sha256", sha256: "d".repeat(64), size_bytes: null };
      fixture.measurements.rows[0] = { ...fixture.measurements.rows[0]!, output_bytes: 1, e2e_ms: 1e-320 };
      const first = await publish(fixture);
      const second = await publish(fixture);
      expect((await parity({ model_query: "d".repeat(64) })).items).toHaveLength(2);
      for (const run of [first, second]) {
        expect(run.summary.serving_points[0]!.output_bytes_per_second).toBeNull();
        expect(run.summary.serving_points[0]!.reported_tokens_per_second).toBeNull();
      }
      const withSettings = syntheticSubmission();
      withSettings.execution.settings.push({ ...descriptor, value: 2 }, { ...descriptor, scope: ["serve"], value: 64 });
      const accepted = await publish(withSettings);
      expect(accepted.summary.serving_points[0]!.reported_tokens_per_second).toBeNull();
      await publish(withSettings);
      const condition = { ...descriptor, op: "eq" as const, value: 2 };
      const other = { ...descriptor, scope: ["serve"], op: "eq" as const, value: 64 };
      const filters: BenchmarkFilters = { setting: [condition, other] };
      const page = await store!.listRuns(filters, 1, null);
      expect(page.next_cursor).not.toBeNull();
      expect(() => decodeDiscoveryCursor(page.next_cursor!, { setting: [other, condition] })).not.toThrow();
      expect(() => decodeDiscoveryCursor(page.next_cursor!, { setting: [other] })).toThrow();
      expect(() => decodeDiscoveryCursor(Buffer.from(JSON.stringify({ c: first.created_at, p: first.public_id })).toString("base64url"), filters)).toThrow();
    });
  });
});
