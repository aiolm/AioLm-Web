import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBase64Url32, sha256HexUtf8 } from "@/lib/crypto";
import { syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";
import { normalizeModelInfo } from "@/lib/model-info";
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
    const setup = {
      os: "TestOS", arch: "x64", cpu: "Test CPU", cores: 8,
      vendors: ["Vendor A"], gpus: ["GPU A"], vram_mb: 8192,
      runtime: "test-runtime", runtime_version: "1", backend: "test-backend", mode: "selected",
      context_size: 16896, prompt_length: 4096, parallel: 2, threads: 4, gpu_layers: -1,
      flash_attention: "on", cache_type_k: "f16", cache_type_v: "q8", split_mode: "layer",
    };

    // A summary carrying contract 0.3.0 model metadata, publisher included, exactly
    // as summarizeBenchmark and migration 010 store it.
    const modelInfo = (overrides: Record<string, unknown> = {}) => ({
      format: "GGUF", name: "Example 8B", architecture: "qwen2", size_label: "8B", quantization: "Q4_K_M",
      file_type: 15, quantized_by: "Quantizer Org", repository: "Publisher-Org/example-8B-GGUF",
      base_models: ["Upstream-Org/example-8B", "Other-Org/mixin-2B"], artifact: "q4/example-8B-Q4_K_M.gguf",
      source: "gguf+huggingface", publisher: "Publisher-Org", sha256: "c".repeat(64), identity_status: "sha256",
      ...overrides });

    async function seed(id: string, group: string, overrides: Record<string, unknown> = {},
      flags: { hidden?: boolean; deleted?: boolean; created?: string } = {}): Promise<void> {
      if (!db) throw new Error("integration database unavailable");
      const summary = { ...summarizeBenchmark(syntheticSubmission()), model_label: group,
        setup: { ...setup }, ...overrides };
      const benchmark = syntheticSubmission();
      benchmark.environment!.execution = {
        mode: "selected", selection_complete: true,
        selected_gpus: summary.setup.gpus.map((name, index) => ({ name,
          vendor: summary.setup.vendors[index] ?? summary.setup.vendors[0] ?? null,
          vram_mb: null, driver: null, integrated: false,
        })),
      };
      await db`insert into bench.benchmark_runs
        (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, hidden, deleted, created_at)
        values (${randomUUID()}, ${id}, ${"0".repeat(64)}, ${"1".repeat(64)},
          ${db.json(JSON.parse(JSON.stringify(benchmark)) as postgres.JSONValue)}, ${db.json(summary)}, ${flags.hidden ?? false},
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
      await seed("discovery-range-hit", "discovery-range");
      await seed("discovery-range-low", "discovery-range", { setup: { ...setup,
        prompt_length: 1024, vram_mb: 1024, cores: 2, parallel: 1, threads: 1, gpu_layers: 0 } });
      await seed("discovery-range-high", "discovery-range", { setup: { ...setup,
        prompt_length: 8192, vram_mb: 16384, cores: 16, parallel: 8, threads: 16, gpu_layers: 32 } });
      await seed("discovery-range-unknown", "discovery-range", { setup: { ...setup,
        prompt_length: null, vram_mb: null, cores: null, parallel: null, threads: null, gpu_layers: null } });
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
        ["a", 10, "2026-01-01"], ["b", 10, "2026-01-01"],
        ["c", 10, "2026-01-02"], ["d", 20, "2026-01-01"], ["e", null, "2026-01-03"],
        ["f", null, "2026-01-03"],
      ] as const) {
        await seed(`discovery-sort-${id}`, "discovery-sort", {
          setup: { ...setup, prompt_length: value, vram_mb: value }, mean_tg_tps: value, mean_e2e_ms: value,
        }, { created: `${created}T00:00:00.000Z` });
      }
      await seed("discovery-model-described", "discovery-model", { model_info: modelInfo() });
      await seed("discovery-model-other", "discovery-model", { model_info: modelInfo({
        repository: "Other-Org/example-8B-GGUF", publisher: "Other-Org", quantization: "Q8_0" }) });
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
      ["context", "4096"], ["vram", "8192"], ["cores", "8"],
      ["parallel", "2"], ["threads", "4"], ["gpu_layers", "-1"],
    ])("applies inclusive %s ranges and excludes unknown values", async (field, value) => {
      const result = await page({ model: "discovery-range", [`${field}_min`]: value, [`${field}_max`]: value });
      expect(result.items.map((item) => item.public_id)).toEqual(["discovery-range-hit"]);
      const lower = await page({ model: "discovery-range", [`${field}_min`]: value });
      const upper = await page({ model: "discovery-range", [`${field}_max`]: value });
      expect(lower.items.map((item) => item.public_id)).not.toContain("discovery-range-unknown");
      expect(upper.items.map((item) => item.public_id)).not.toContain("discovery-range-unknown");
      expect(lower.items.map((item) => item.public_id)).toContain("discovery-range-high");
      expect(upper.items.map((item) => item.public_id)).not.toContain("discovery-range-high");
    });

    it("reads context ranges from the configured input length, never from the runtime allocation", async () => {
      // Every seeded run allocates 16896 tokens and none was configured to send an input that long.
      expect((await page({ model: "discovery-range", context_min: "16896" })).items).toEqual([]);
      expect((await page({ model: "discovery-range", context_min: "4096", context_max: "4096" })).items
        .map((item) => item.public_id)).toEqual(["discovery-range-hit"]);
      const ascending = await page({ model: "discovery-range", sort: "context_asc" });
      expect(ascending.items.map((item) => item.public_id)).toEqual([
        "discovery-range-low", "discovery-range-hit", "discovery-range-high", "discovery-range-unknown"]);
      expect(ascending.items.every((item) => item.summary.setup?.context_size === 16896)).toBe(true);
    });

    it.each(["NaN", "Infinity", "1.5", "9007199254740992", "-2"])("rejects invalid numeric filter %s", async (value) => {
      expect((await request({ context_min: value })).status).toBe(400);
      expect((await request({ field: "gpu", context_min: value }, true)).status).toBe(400);
    });

    it("rejects inverted ranges and unsupported option fields", async () => {
      expect((await request({ threads_min: "8", threads_max: "2" })).status).toBe(400);
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
      ["context_asc", "cbadfe"], ["context_desc", "dcbafe"],
      ["vram_asc", "cbadfe"], ["vram_desc", "dcbafe"],
      ["throughput_desc", "dcbafe"], ["duration_asc", "cbadfe"],
    ])("pages %s across value, timestamp, ID and null ties without gaps", async (sort, order) => {
      const ids: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 8; i++) {
        const result = await page({ model: "discovery-sort", sort, limit: "1", ...(cursor ? { cursor } : {}) });
        ids.push(...result.items.map((item) => item.public_id));
        cursor = result.next_cursor;
        if (!cursor) break;
      }
      expect(cursor).toBeNull();
      expect(ids).toEqual([...order].map((id) => `discovery-sort-${id}`));
      expect(new Set(ids).size).toBe(6);
    });

    it("persists selected GPU totals without inventing unknown or installed-device specs", async () => {
      if (!store) throw new Error("integration database unavailable");
      const base = syntheticSubmission();
      const gpu = { name: "Measured GPU", vendor: "Measured Vendor", vram_mb: 4096, driver: null, integrated: false };
      const environment = { ...base.environment!, installed_gpus: [
        { name: "Installed Only", vendor: "Installed Vendor", vram_mb: 65536, driver: null, integrated: false },
      ], execution: { mode: "selected" as const, selected_gpus: [gpu, gpu], selection_complete: true } };
      const cases: Array<[string, typeof base.environment]> = [
        ["multi", environment],
        ["missing", { ...environment, execution: { ...environment.execution,
          selected_gpus: [gpu, { ...gpu, name: "Unknown Memory", vram_mb: null }] } }],
        ["incomplete", { ...environment, execution: { ...environment.execution, selection_complete: false } }],
        ["cpu", { ...environment, execution: { mode: "cpu" as const, selected_gpus: [], selection_complete: true } }],
        ["absent", null],
      ];
      for (const [label, env] of cases) {
        const submissionId = randomUUID(), ownerSecret = randomBase64Url32();
        const benchmark = syntheticSubmission({ submission_id: submissionId, environment: env,
          runtime: { ...base.runtime, backend: "discovery-devices" } });
        const body = JSON.stringify({ benchmark, description_md: "integration" });
        const hash = sha256HexUtf8(body);
        const permit = await verifiedSession(submissionId, ownerSecret, hash);
        const args = acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA);
        expect((await store.acceptRunAtomic({ ...args, public_id: `discovery-device-${label}`,
          body_sha256: hash, benchmarkMeta: { ...benchmark, measurements: { ...benchmark.measurements, rows: [] } },
          summary: summarizeBenchmark(benchmark), rows: benchmark.measurements.rows,
          byte_size: Buffer.byteLength(body),
        })).outcome).toBe("created");
      }
      const all = await page({ backend: "discovery-devices" });
      expect(all.items).toHaveLength(5);
      const byId = new Map(all.items.map((item) => [item.public_id, item.summary.setup]));
      expect(byId.get("discovery-device-multi")).toMatchObject({
        vram_mb: 8192, vendors: ["Measured Vendor"], gpus: ["Measured GPU"],
      });
      for (const label of ["missing", "incomplete", "cpu", "absent"]) {
        expect(byId.get(`discovery-device-${label}`)?.vram_mb).toBeNull();
      }
      expect(byId.get("discovery-device-absent")).toMatchObject({ cpu: null, cores: null, os: null,
        vendors: [], gpus: [], backend: "discovery-devices", context_size: 2048, parallel: 1 });
      expect((await page({ backend: "discovery-devices", vram_min: "0" })).items.map((item) => item.public_id))
        .toEqual(["discovery-device-multi"]);
      expect((await page({ backend: "discovery-devices", gpu: "Installed Only" })).items).toEqual([]);
      expect((await options({ field: "vendor", backend: "discovery-devices" })).options)
        .toEqual([{ value: "Measured Vendor", count: 3 }]);
      expect((await options({ field: "gpu", backend: "discovery-devices", option_query: "Installed" })).options).toEqual([]);
      for (const item of all.items) {
        expect(item).not.toHaveProperty("benchmark");
        expect(item).not.toHaveProperty("owner_hash");
        expect(item).not.toHaveProperty("submission_id");
      }
    });

    it("rejects cursors reused with a different sort or filter", async () => {
      const first = await page({ model: "discovery-sort", sort: "context_asc", limit: "1" });
      expect(first.next_cursor).toBeTruthy();
      for (const changed of ([{ sort: "context_desc", model: "discovery-sort" },
        { sort: "context_asc", model: "discovery-range" },
        { sort: "context_asc", model: "discovery-sort", cores_min: "2" }] as Array<Record<string, string>>)) {
        expect((await request({ ...changed, cursor: first.next_cursor! })).status).toBe(400);
      }
    });
  });

  it("backfills existing selected-device summaries with fractional MiB and missing environments", async () => {
    if (!admin) throw new Error("integration database unavailable");
    const scratchName = `aiolm_web_backfill_${randomUUID().replace(/-/g, "")}`;
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`);
    const scratchUrl = new URL(ADMIN_URL!);
    scratchUrl.pathname = `/${scratchName}`;
    const scratch = postgres(scratchUrl.toString(), { max: 1, prepare: false, ssl: false });
    try {
      await scratch`create schema bench`;
      await scratch`create table bench.schema_migrations (filename text primary key, sha256 text not null)`;
      for (const name of REQUIRED_MIGRATIONS.filter((name) => name < "008_benchmark_discovery.sql")) {
        await scratch.unsafe(readFileSync(join(process.cwd(), "sql", "migrations", name), "utf8"));
      }
      const base = syntheticSubmission();
      const gpu = { name: "Fractional GPU", vendor: "Test Vendor", vram_mb: 4096.5, driver: null, integrated: false };
      const benchmarks = [
        syntheticSubmission({ environment: { ...base.environment!, execution: {
          mode: "selected", selected_gpus: [gpu, gpu], selection_complete: true,
        } } }),
        syntheticSubmission({ environment: null }),
      ];
      for (const [index, benchmark] of benchmarks.entries()) {
        const { setup: omittedSetup, ...legacy } = summarizeBenchmark(benchmark);
        void omittedSetup;
        await scratch`insert into bench.benchmark_runs
          (submission_id, public_id, owner_hash, body_sha256, benchmark, summary)
          values (${randomUUID()}, ${`legacy-${index}`}, ${"0".repeat(64)}, ${"1".repeat(64)},
            ${scratch.json(JSON.parse(JSON.stringify(benchmark)) as postgres.JSONValue)}, ${scratch.json(legacy)})`;
      }
      await scratch.unsafe(readFileSync(join(process.cwd(), "sql", "migrations", "008_benchmark_discovery.sql"), "utf8"));
      const rows = await scratch<Array<{ summary: ReturnType<typeof summarizeBenchmark> }>>`
        select summary from bench.benchmark_runs order by public_id`;
      // 008 backfills from benchmark metadata only; the configured input length arrives with 009.
      expect(rows.map((row) => row.summary.setup)).toEqual(benchmarks.map((benchmark) => {
        const { prompt_length, ram_bytes, ...setup } = summarizeBenchmark(benchmark).setup!;
        void prompt_length;
        void ram_bytes;
        return setup;
      }));
      expect(rows[0]!.summary.setup?.vram_mb).toBe(8193);
      expect(rows[1]!.summary.setup?.vram_mb).toBeNull();
    } finally {
      await scratch.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE "${scratchName}"`);
    }
  });

  it("backfills configured input context and prefill from retained chunks without recomputing curated summaries", async () => {
    if (!admin) throw new Error("integration database unavailable");
    const MIGRATION = "009_input_context.sql";
    const scratchName = `aiolm_web_measured_${randomUUID().replace(/-/g, "")}`;
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

      const base = syntheticSubmission();
      const row = (overrides: Partial<(typeof base)["measurements"]["rows"][number]>) =>
        ({ ...base.measurements.rows[0]!, ...overrides });
      const measured = syntheticSubmission({
        workload: { ...base.workload, prompt_lengths: [4096, 512, 4096, 1024, 0, 512.5, 2 ** 53] },
        execution: { ...base.execution, context_size: 16896 },
        measurements: { status: "partial", rows: [
          row({ pp_tps: 123.45 }), row({ pp_tps: 0.1 }), row({ pp_tps: 9999, failed: true }),
          row({ pp_tps: null }), row({ pp_tps: 0.2 }), row({ pp_tps: 987.654321 }), row({ pp_tps: 7 }),
        ] },
      });
      const unrecorded = syntheticSubmission({
        workload: { ...base.workload, prompt_lengths: [] },
        execution: { ...base.execution, context_size: 8704 },
        measurements: { status: "complete", rows: [] },
      });
      // Production keeps metadata on the run row and measurement rows in chunks.
      const metaOf = (b: typeof base) => JSON.parse(JSON.stringify({ ...b, measurements: { ...b.measurements, rows: [] } }));
      // What 008 left behind: an operator-curated label and a setup with no input length.
      const curated = (b: typeof base, label: string) => {
        const { prompt_lengths, mean_pp_tps, setup, ...rest } = summarizeBenchmark(b);
        void prompt_lengths; void mean_pp_tps;
        const { prompt_length, ...legacySetup } = setup!;
        void prompt_length;
        return { ...rest, model_label: label, setup: legacySetup };
      };

      const submissionIds = new Map<string, string>();
      for (const [publicId, benchmark, label] of [
        ["measured", measured, "Curated Model A"], ["unrecorded", unrecorded, "Curated Model B"],
      ] as const) {
        const submissionId = randomUUID();
        submissionIds.set(publicId, submissionId);
        await scratch`insert into bench.benchmark_runs
          (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, hidden, row_count, byte_size)
          values (${submissionId}, ${publicId}, ${"0".repeat(64)}, ${"1".repeat(64)},
            ${scratch.json(metaOf(benchmark) as postgres.JSONValue)}, ${scratch.json(curated(benchmark, label))},
            ${publicId === "measured"}, ${benchmark.measurements.rows.length}, ${4096})`;
        const chunked = benchmark.measurements.rows;
        for (const [index, slice] of [chunked.slice(0, 4), chunked.slice(4)].entries()) {
          if (slice.length === 0) continue;
          await scratch`insert into bench.benchmark_chunks (submission_id, chunk_index, rows) values (${submissionId}, ${index},
            ${scratch.json(JSON.parse(JSON.stringify(slice)) as postgres.JSONValue)})`;
        }
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

      // The hidden run is enriched too, and the curated label survives the merge.
      expect(stored.get("measured")!.summary).toEqual({ ...summarizeBenchmark(measured), model_label: "Curated Model A" });
      // Non-integer, non-positive and unsafe entries are dropped, matching the helper.
      expect(stored.get("measured")!.summary!.prompt_lengths).toEqual([512, 1024, 4096]);
      expect(stored.get("measured")!.summary!.setup!.prompt_length).toBe(4096);
      // Prefill averages the five rows that measured it across both chunks; the failed
      // row and the one that reported none are skipped, bit-for-bit with the helper.
      expect(stored.get("measured")!.summary!.mean_pp_tps).toBe(summarizeBenchmark(measured).mean_pp_tps);
      expect(stored.get("measured")!.summary!.mean_pp_tps).toBeCloseTo(223.6808642, 7);
      // The raw runtime allocation survives exactly and is never read as an input length.
      expect(stored.get("measured")!.summary!.setup!.context_size).toBe(16896);

      // A workload that recorded no input length stays unknown rather than copying the allocation.
      expect(stored.get("unrecorded")!.summary).toEqual({ ...summarizeBenchmark(unrecorded), model_label: "Curated Model B" });
      expect(stored.get("unrecorded")!.summary!.prompt_lengths).toEqual([]);
      expect(stored.get("unrecorded")!.summary!.setup!.prompt_length).toBeNull();
      expect(stored.get("unrecorded")!.summary!.mean_pp_tps).toBeNull();
      expect(stored.get("unrecorded")!.summary!.setup!.context_size).toBe(8704);

      // Raw metadata, chunks, hashes, capacity counters and the tombstone are left as they were.
      expect(stored.get("measured")!.benchmark).toEqual(metaOf(measured));
      expect(stored.get("measured")!.owner_hash).toBe("0".repeat(64));
      expect(stored.get("measured")!.body_sha256).toBe("1".repeat(64));
      expect(stored.get("measured")!.row_count).toBe(7);
      expect(stored.get("measured")!.byte_size).toBe(4096);
      expect(stored.get("tombstone")!.summary).toBeNull();
      expect(stored.get("tombstone")!.benchmark).toBeNull();
      const chunks = await scratch<Array<{ rows: unknown[] }>>`
        select rows from bench.benchmark_chunks where submission_id = ${submissionIds.get("measured")!} order by chunk_index`;
      expect(chunks).toHaveLength(2);
      expect(chunks.flatMap((c) => c.rows)).toEqual(JSON.parse(JSON.stringify(measured.measurements.rows)));

      const indexes = (await scratch<Array<{ indexname: string }>>`
        select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`)
        .map((r) => r.indexname);
      expect(indexes).toContain("benchmark_discovery_prompt_length_asc");
      expect(indexes).toContain("benchmark_discovery_prompt_length_desc");
      expect(indexes).not.toContain("benchmark_discovery_context_asc");
      expect(indexes).not.toContain("benchmark_discovery_context_desc");
    } finally {
      await scratch.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE "${scratchName}"`);
    }
  });

  it("backfills operating points from retained chunks with the same arithmetic the helper uses", async () => {
    if (!admin) throw new Error("integration database unavailable");
    const MIGRATION = "012_operating_points.sql";
    const scratchName = `aiolm_web_points_${randomUUID().replace(/-/g, "")}`;
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

      const base = syntheticSubmission();
      const row = (overrides: Partial<(typeof base)["measurements"]["rows"][number]>) =>
        ({ ...base.measurements.rows[0]!, ...overrides });
      // A real grid: two input lengths against two concurrencies, repeated, with
      // an even repetition count so the interpolated median is exercised, plus
      // the rows both implementations have to skip in the same way.
      const gridded = syntheticSubmission({
        measurements: { status: "complete", rows: [
          row({ prompt_tokens: 512, concurrency: 1, tg_tps: 0.1, e2e_ms: 1000, ttft_ms: 40 }),
          row({ prompt_tokens: 512, concurrency: 1, tg_tps: 0.3, e2e_ms: 1200, ttft_ms: 60 }),
          row({ prompt_tokens: 512, concurrency: 4, tg_tps: 61.5, pp_tps: null }),
          row({ prompt_tokens: 4096, concurrency: 1, tg_tps: 45.25, e2e_ms: 8000 }),
          row({ prompt_tokens: 4096, concurrency: 1, tg_tps: 44.75, e2e_ms: 8400 }),
          row({ prompt_tokens: 4096, concurrency: 1, tg_tps: 12, e2e_ms: 30000 }),
          row({ prompt_tokens: 4096, concurrency: 1, tg_tps: 9999, e2e_ms: 1, failed: true }),
          row({ prompt_tokens: 1.5, tg_tps: 9999 }),
          row({ concurrency: 0, tg_tps: 9999 }),
        ] },
      });
      const unmeasured = syntheticSubmission({ measurements: { status: "complete", rows: [] } });
      const metaOf = (b: typeof base) => JSON.parse(JSON.stringify({ ...b, measurements: { ...b.measurements, rows: [] } }));
      // What a pre-012 row looks like: an operator-curated label and no points.
      const curated = (b: typeof base, label: string) => {
        const { points, points_truncated, ...rest } = summarizeBenchmark(b);
        void points; void points_truncated;
        return { ...rest, model_label: label };
      };

      const submissionIds = new Map<string, string>();
      for (const [publicId, benchmark, label] of [
        ["gridded", gridded, "Curated Model A"], ["unmeasured", unmeasured, "Curated Model B"],
      ] as const) {
        const submissionId = randomUUID();
        submissionIds.set(publicId, submissionId);
        await scratch`insert into bench.benchmark_runs
          (submission_id, public_id, owner_hash, body_sha256, benchmark, summary, hidden, row_count, byte_size)
          values (${submissionId}, ${publicId}, ${"0".repeat(64)}, ${"1".repeat(64)},
            ${scratch.json(metaOf(benchmark) as postgres.JSONValue)},
            ${scratch.json(JSON.parse(JSON.stringify(curated(benchmark, label))) as postgres.JSONValue)},
            ${publicId === "gridded"}, ${benchmark.measurements.rows.length}, ${4096})`;
        // Split across chunks: a point's repetitions must aggregate across them.
        const chunked = benchmark.measurements.rows;
        for (const [index, slice] of [chunked.slice(0, 4), chunked.slice(4)].entries()) {
          if (slice.length === 0) continue;
          await scratch`insert into bench.benchmark_chunks (submission_id, chunk_index, rows) values (${submissionId}, ${index},
            ${scratch.json(JSON.parse(JSON.stringify(slice)) as postgres.JSONValue)})`;
        }
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

      // The hidden run is enriched too, and the curated label survives the merge.
      // Equality here is the whole point: percentile_cont(0.5) and the helper's
      // interpolation produce the same doubles for the same rows.
      expect(stored.get("gridded")!.summary).toEqual({ ...summarizeBenchmark(gridded), model_label: "Curated Model A" });
      const points = stored.get("gridded")!.summary!.points!;
      expect(points.map((point) => [point.prompt_tokens, point.concurrency, point.samples]))
        .toEqual([[512, 1, 2], [512, 4, 1], [4096, 1, 3]]);
      // Two repetitions interpolate; 0.1 + (0.3 - 0.1) * 0.5 is not (0.1 + 0.3) / 2.
      expect(points[0]!.tg_tps).toEqual({ median: 0.1 + (0.3 - 0.1) * 0.5, min: 0.1, max: 0.3 });
      expect(points[0]!.e2e_ms).toEqual({ median: 1100, min: 1000, max: 1200 });
      // A metric no row of the point reported stays unknown; the others still aggregate.
      expect(points[1]!.pp_tps).toBeNull();
      expect(points[1]!.tg_tps!.median).toBe(61.5);
      // The failed row is skipped, so one cold repetition does not join the point.
      expect(points[2]!.samples).toBe(3);
      expect(points[2]!.tg_tps).toEqual({ median: 44.75, min: 12, max: 45.25 });
      expect(stored.get("gridded")!.summary!.points_truncated).toBe(false);
      // The retained mixed means are stored data and are left exactly as they were.
      expect(stored.get("gridded")!.summary!.mean_tg_tps).toBe(summarizeBenchmark(gridded).mean_tg_tps);

      // A run whose rows named no point reads as "measured no point", not as pre-012.
      expect(stored.get("unmeasured")!.summary).toEqual({ ...summarizeBenchmark(unmeasured), model_label: "Curated Model B" });
      expect(stored.get("unmeasured")!.summary!.points).toEqual([]);
      expect(stored.get("unmeasured")!.summary!.points_truncated).toBe(false);

      // Raw metadata, chunks, hashes, capacity counters and the tombstone are left as they were.
      expect(stored.get("gridded")!.benchmark).toEqual(metaOf(gridded));
      expect(stored.get("gridded")!.owner_hash).toBe("0".repeat(64));
      expect(stored.get("gridded")!.body_sha256).toBe("1".repeat(64));
      expect(stored.get("gridded")!.row_count).toBe(9);
      expect(stored.get("gridded")!.byte_size).toBe(4096);
      expect(stored.get("tombstone")!.summary).toBeNull();
      expect(stored.get("tombstone")!.benchmark).toBeNull();
      const chunks = await scratch<Array<{ rows: unknown[] }>>`
        select rows from bench.benchmark_chunks where submission_id = ${submissionIds.get("gridded")!} order by chunk_index`;
      expect(chunks.flatMap((c) => c.rows)).toEqual(JSON.parse(JSON.stringify(gridded.measurements.rows)));
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
        model: { status: "sha256", sha256: "c".repeat(64), size_bytes: 4096, metadata } as never });
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
        expect(row.summary!.prompt_lengths).toEqual([512]);
        expect(row.summary!.setup!.prompt_length).toBe(512);
        expect(row.summary!.setup!.context_size).toBe(2048);
        expect(row.summary!.mean_pp_tps).toBe(100);
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
        delete summary.setup!.ram_bytes;
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

  it("applies migrations exactly once", async () => {
    if (!db) return;
    expect(await applyMigrations(db)).toEqual([]);
    const rows = await db`select filename from bench.schema_migrations order by filename`;
    expect(rows.map((r) => r.filename)).toEqual([
      "001_init.sql", "002_roles.sql", "003_least_privilege.sql",
      "004_filter_indexes.sql", "005_retention_grants.sql", "006_trgm_filter_indexes.sql",
      "007_readiness_grant.sql", "008_benchmark_discovery.sql", "009_input_context.sql",
      "010_model_metadata.sql", "011_system_memory.sql", "012_operating_points.sql",
    ]);
  });

  it("backs list filters and pagination with indexes", async () => {
    if (!db) return;
    const idx = await db`select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`;
    const names = idx.map((r) => r.indexname as string);
    // Keyset pagination ordering is index-backed.
    expect(names).toContain("benchmark_runs_created_idx");
    // The context condition reads the configured input length, so that is what is indexed;
    // 009 removed the raw-allocation indexes 008 had created for the old expression.
    expect(names).toContain("benchmark_discovery_prompt_length_asc");
    expect(names).toContain("benchmark_discovery_prompt_length_desc");
    expect(names).not.toContain("benchmark_discovery_context_asc");
    expect(names).not.toContain("benchmark_discovery_context_desc");
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
    // Planner evidence: with scans disabled the list query shape is served by
    // the pagination index (honest usability proof on a small table; at scale
    // the planner picks it without the hint).
    const plan = await db.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      return tx`explain select public_id from bench.benchmark_runs
        where deleted = false and hidden = false
        order by created_at desc, public_id desc limit 25`;
    });
    expect(JSON.stringify(plan)).toMatch(/benchmark_runs_created_idx|benchmark_discovery_newest/);
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

  it("serves the authenticated HTTP publish flow against the real database", async () => {
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
      const benchmark = syntheticSubmission({ submission_id: submissionId });
      const body = JSON.stringify({ benchmark, description_md: "http-flow" });
      const bodySha = sha256HexUtf8(body);
      const headers = (extra: Record<string, string> = {}): Headers =>
        new Headers({ "x-synthetic-test-ip": "10.30.30.30", ...extra });
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
      // Accepted replay without a fresh permit returns the same receipt.
      const replay = await submit(ownerSecret, false);
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as { id: string }).id).toBe(receipt.id);
      // Wrong owner is rejected against real stored hashes.
      expect((await submit(randomBase64Url32(), true)).status).toBe(403);
    } finally {
      __setTestStore(null);
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
