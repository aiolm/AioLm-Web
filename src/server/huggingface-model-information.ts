import type { HuggingFaceFileMatch, HuggingFaceModelInformation, ModelInformationEvidence } from "@/lib/model-information";
import { decodeUtf8Fatal, readBoundedBytes } from "@/lib/request";

const ORIGIN = "https://huggingface.co";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CANDIDATES = 8;
const MAX_FILES = 4096;
const MAX_MATCHES = 64;
const MAX_CACHE = 128;
const MAX_PENDING = 16;
const DEADLINE_MS = 8000;
const SHA256 = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const LABEL = /^[^/\\:@\u0000-\u001f\u007f]{1,256}$/;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function repository(value: unknown): string | null {
  return typeof value === "string" && REPOSITORY.test(value) && !value.includes("..") ? value : null;
}
function label(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" && LABEL.test(value) ? value : null;
}
function artifact(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512 && !value.includes("..") &&
    value.split("/").every(segment => /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/.test(segment)) ? value : null;
}
function declarations(value: unknown, validate: (value: unknown) => string | null): string[] {
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value.slice(0, 32) : [];
  return [...new Set(values.map(validate).filter((item): item is string => item !== null))].sort(compare).slice(0, 8);
}

/** Public-only DI boundary: a lookup owns its bounded cache and network concurrency. */
export function createHuggingFaceModelInformationLookup(options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expires: number; value: HuggingFaceModelInformation }>();
  const pending = new Map<string, Promise<HuggingFaceModelInformation>>();
  let activeRequests = 0;
  const waiting: Array<() => void> = [];

  async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
    if (activeRequests >= 4) {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const abort = () => {
        const index = waiting.indexOf(start);
        if (index >= 0) waiting.splice(index, 1);
        reject(new Error("Catalog deadline exceeded."));
      };
      const start = () => { signal.removeEventListener("abort", abort); resolve(); };
      waiting.push(start);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      await promise;
    } else {
      activeRequests++;
    }
    try {
      signal.throwIfAborted();
      const response = await fetcher(`${ORIGIN}${path}`, {
        signal, redirect: "error", credentials: "omit", cache: "no-store", headers: { accept: "application/json" },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 404) return null;
        throw new Error("Catalog unavailable.");
      }
      const bytes = await readBoundedBytes(response, MAX_BYTES);
      signal.throwIfAborted();
      return JSON.parse(decodeUtf8Fatal(bytes)) as unknown;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else activeRequests--;
    }
  }

  return async function lookup(input: ModelInformationEvidence): Promise<HuggingFaceModelInformation> {
    // Only canonical recorded public evidence/hints enter the cache or requests.
    const sha256 = typeof input.sha256 === "string" && SHA256.test(input.sha256) ? input.sha256 : null;
    const size = typeof input.size_bytes === "number" && Number.isSafeInteger(input.size_bytes) && input.size_bytes >= 0 ? input.size_bytes : null;
    const repo = repository(input.repository);
    const name = label(input.name);
    const gguf = input.format?.toLowerCase() === "gguf";
    const base: HuggingFaceModelInformation = {
      status: "unidentified", reason: null, match_basis: "recorded_sha256_and_size", sha256,
      size_bytes: size, checked_at: null, matches: [],
    };
    if (!sha256 || size === null || (!repo && !name)) {
      return { ...base, reason: !sha256 ? "missing_checksum" : size === null ? "missing_size" : "missing_hint" };
    }
    const key = JSON.stringify([sha256, size, repo, name, gguf]);
    const saved = cache.get(key);
    if (saved && saved.expires > now()) return saved.value;
    if (saved) cache.delete(key);
    const current = pending.get(key);
    if (current) return current;
    if (pending.size >= MAX_PENDING) return { ...base, status: "unavailable", checked_at: new Date(now()).toISOString() };

    let failed = false;
    const scan = async (): Promise<HuggingFaceModelInformation> => {
      const checked_at = new Date(now()).toISOString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
      const matches: HuggingFaceFileMatch[] = [];
      const candidates = new Set<string>(repo ? [repo] : []);
      // Start the recorded repository first; a name search can only add candidates.
      const recordedHead = repo ? fetchJson(`/api/models/${repo}?blobs=true`, controller.signal)
        .catch(() => { failed = true; return undefined; }) : null;
      try {
        if (name) {
          const query = new URLSearchParams({ search: name, sort: "downloads", direction: "-1", limit: String(MAX_CANDIDATES) });
          if (gguf) query.set("filter", "gguf");
          try {
            const found = await fetchJson(`/api/models?${query}`, controller.signal);
            if (!Array.isArray(found)) throw new Error("Invalid catalog search.");
            const discovered = found.slice(0, MAX_CANDIDATES).map(item => repository(object(item).id))
              .filter((item): item is string => item !== null).sort(compare);
            for (const candidate of discovered) if (candidates.size < MAX_CANDIDATES) candidates.add(candidate);
          } catch { failed = true; }
        }
        const repos = [...candidates];
        let cursor = 0;
        const inspect = async () => {
          while (cursor < repos.length && !controller.signal.aborted) {
            const candidate = repos[cursor++];
            try {
              const headValue = candidate === repo && recordedHead
                ? await recordedHead
                : await fetchJson(`/api/models/${candidate}?blobs=true`, controller.signal);
              if (headValue === null) continue;
              const head = object(headValue);
              if (head.id !== candidate || head.private !== false || typeof head.sha !== "string" || !REVISION.test(head.sha)) {
                throw new Error("Invalid repository evidence.");
              }
              // Head only discovers a revision. Proof and card declarations come from the pinned response.
              const pinnedValue = await fetchJson(`/api/models/${candidate}/revision/${head.sha}?blobs=true`, controller.signal);
              if (pinnedValue === null) throw new Error("Revision unavailable.");
              const pinned = object(pinnedValue);
              if (pinned.id !== candidate || pinned.private !== false || pinned.sha !== head.sha ||
                !Array.isArray(pinned.siblings) || pinned.siblings.length > MAX_FILES) throw new Error("Invalid revision evidence.");
              const card = object(pinned.cardData);
              const hasReadme = pinned.siblings.some(entry => object(entry).rfilename === "README.md");
              const files = new Set<string>();
              const candidateMatches: HuggingFaceFileMatch[] = [];
              for (const entry of pinned.siblings) {
                const sibling = object(entry);
                const lfs = object(sibling.lfs);
                const path = artifact(sibling.rfilename);
                if (!path || files.has(path) || lfs.sha256 !== sha256 || lfs.size !== size || sibling.size !== size) continue;
                files.add(path);
                const encoded = path.split("/").map(encodeURIComponent).join("/");
                candidateMatches.push({
                  repository: candidate, revision: head.sha, artifact: path, sha256, size_bytes: size,
                  repository_owner: candidate.split("/")[0], base_models: declarations(card.base_model, repository),
                  licenses: declarations(card.license, label), license_name: label(card.license_name), quantized_by: label(card.quantized_by),
                  model_card_url: hasReadme ? `${ORIGIN}/${candidate}/blob/${head.sha}/README.md` : `${ORIGIN}/${candidate}/tree/${head.sha}`,
                  artifact_url: `${ORIGIN}/${candidate}/blob/${head.sha}/${encoded}`,
                });
                if (candidateMatches.length > MAX_MATCHES) throw new Error("Too many matching artifacts.");
              }
              matches.push(...candidateMatches);
            } catch { failed = true; }
          }
        };
        await Promise.all(Array.from({ length: Math.min(4, repos.length) }, inspect));
        if (controller.signal.aborted) failed = true;
        if (matches.length > MAX_MATCHES) return { ...base, status: "unavailable", checked_at };
        matches.sort((a, b) => compare(a.repository, b.repository) || compare(a.artifact, b.artifact));
        return { ...base, status: matches.length ? "matched" : failed ? "unavailable" : "not_found", checked_at, matches };
      } finally { clearTimeout(timer); }
    };
    const work = scan().catch((): HuggingFaceModelInformation => ({ ...base, status: "unavailable", checked_at: new Date(now()).toISOString() }));
    pending.set(key, work);
    try {
      const value = await work;
      // Valid matches survive a partial failure, but recovered sources must be checked soon.
      const ttl = failed ? 15000 : value.status === "matched" ? 86400000 : value.status === "not_found" ? 900000 : 15000;
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: now() + ttl, value });
      return value;
    } finally { pending.delete(key); }
  };
}

export const lookupHuggingFaceModelInformation = createHuggingFaceModelInformationLookup();
