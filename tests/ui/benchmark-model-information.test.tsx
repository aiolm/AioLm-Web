import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import en from "@/i18n/messages/benchmark/en";
import ko from "@/i18n/messages/benchmark/ko";
import ja from "@/i18n/messages/benchmark/ja";
import zh from "@/i18n/messages/benchmark/zh";
import type { HuggingFaceFileMatch, HuggingFaceModelInformation } from "@/lib/model-information";
import { BenchmarkModelInformation } from "@/components/benchmark-model-information";

const response = vi.hoisted(() => ({ data: null as HuggingFaceModelInformation | null, error: null as string | null }));
vi.mock("@/components/ui", () => ({ useJsonFetch: () => ({ ...response, reload: () => {} }) }));

const catalogs = { en, ko, ja, zh };
const sha256 = "a".repeat(64);
const revision = "b".repeat(40);
function match(overrides: Partial<HuggingFaceFileMatch> = {}): HuggingFaceFileMatch {
  return {
    repository: "synthetic-owner/weights", repository_owner: "synthetic-owner", revision,
    artifact: "nested/model file.gguf", sha256, size_bytes: 2048,
    base_models: ["synthetic-base/original"], licenses: ["apache-2.0"], license_name: null,
    quantized_by: null,
    // A renderer must not trust a returned URL's host.
    model_card_url: "https://untrusted.invalid/card", artifact_url: "https://untrusted.invalid/file",
    ...overrides,
  };
}
function information(overrides: Partial<HuggingFaceModelInformation> = {}): HuggingFaceModelInformation {
  return { status: "matched", reason: null, match_basis: "recorded_sha256_and_size", sha256, size_bytes: 2048, checked_at: "2026-01-02T03:04:05.000Z", matches: [match()], ...overrides };
}
function render(locale: Locale = "en", compact = false): string {
  return renderToStaticMarkup(<I18nProvider locale={locale} messages={catalogs[locale]}><BenchmarkModelInformation publicId="synthetic-result" recordedName="synthetic model & variant" compact={compact} /></I18nProvider>);
}

beforeEach(() => { response.data = null; response.error = null; });

describe("later Hugging Face file information", () => {
  it("keeps each repository's independent card declarations together, without choosing a publisher or inventing a quantizer", () => {
    response.data = information({ matches: [match(), match({ repository: "other-owner/mirror", repository_owner: "other-owner", artifact: "mirror.gguf", base_models: ["other-base/declared"], licenses: ["mit"], quantized_by: "explicit-quantizer" })] });
    const html = render();
    const sources = [...html.matchAll(/<li class="benchmark-catalog-match">([\s\S]*?)<\/li>/g)].map(result => result[1]!);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toContain("synthetic-base/original");
    expect(sources[0]).toContain("apache-2.0");
    expect(sources[0]).not.toContain("explicit-quantizer");
    expect(sources[1]).toContain("other-base/declared");
    expect(sources[1]).toContain("explicit-quantizer");
    expect(sources[1]).not.toContain("apache-2.0");
    // Useful model information is visible even while evidence disclosures stay closed.
    const visible = sources[0]!.split("<details")[0]!;
    expect(visible).toContain("nested/model file.gguf");
    expect(visible).toContain("synthetic-base/original");
    expect(visible).toContain("apache-2.0");
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
  });

  it("pins evidence links and rejects supplied hosts and unsafe artifact paths", () => {
    response.data = information();
    const html = render();
    expect(html).toContain(`href="https://huggingface.co/synthetic-owner/weights/blob/${revision}/README.md"`);
    expect(html).toContain(`href="https://huggingface.co/synthetic-owner/weights/blob/${revision}/nested/model%20file.gguf"`);
    expect(html).not.toContain("untrusted.invalid");
    response.data = information({ matches: [match({ repository: "../escape", artifact: "../escape.gguf" })] });
    const unsafe = render();
    expect(unsafe).not.toContain('href="https://huggingface.co/../');
    expect(unsafe).not.toContain("untrusted.invalid");
    response.data = information({ matches: [match({ artifact: "../escape.gguf" })] });
    expect(render()).not.toContain(`/blob/${revision}/../escape.gguf`);
  });

  it("uses the pinned repository tree when that revision has no model card file", () => {
    response.data = information({ matches: [match({ model_card_url: `https://huggingface.co/synthetic-owner/weights/tree/${revision}` })] });
    const html = render();
    expect(html).toContain(`href="https://huggingface.co/synthetic-owner/weights/tree/${revision}"`);
    expect(html).not.toContain(`/blob/${revision}/README.md`);
  });

  it.each(Object.keys(catalogs) as Locale[])("keeps no-hash records explicitly unverified with a search reference in %s", locale => {
    response.data = information({ status: "unidentified", reason: "missing_checksum", sha256: null, matches: [] });
    const html = render(locale);
    expect(html).toContain(catalogs[locale]["benchmark.catalogMissingChecksum"]);
    expect(html).toContain(catalogs[locale]["benchmark.catalogUnverifiedSearch"]);
    expect(html).toContain('href="https://huggingface.co/models?search=synthetic%20model%20%26%20variant"');
    expect(html).not.toContain(catalogs[locale]["benchmark.catalogMatched"]);
    expect(html).not.toContain("benchmark.catalog");
  });

  it("does not disguise missing size, bounded no-match, loading, or unavailable information as a verified file", () => {
    expect(render()).toContain(en["benchmark.catalogLoading"]);
    for (const [data, label] of [
      [information({ status: "unidentified", reason: "missing_size", size_bytes: null, matches: [] }), "benchmark.catalogMissingSize"],
      [information({ status: "not_found", matches: [] }), "benchmark.catalogNotFound"],
      [information({ status: "unavailable", matches: [] }), "benchmark.catalogUnavailable"],
    ] as const) {
      response.data = data;
      const html = render();
      expect(html).toContain(en[label]);
      expect(html).not.toContain(en["benchmark.catalogMatched"]);
    }
    response.data = null;
    response.error = "Network error";
    expect(render()).toContain(en["benchmark.catalogUnavailable"]);
    expect(render()).toContain(en["benchmark.catalogRetry"]);
  });

  it("keeps the compact model cell simple without discarding source evidence", () => {
    response.data = information();
    const html = render("en", true);
    const visible = html.split("<details")[0]!;
    expect(visible).toContain("synthetic-owner/weights");
    expect(visible).not.toContain("nested/model file.gguf");
    expect(html).toContain("nested/model file.gguf");
    expect(html).toContain("apache-2.0");
    expect(html).toContain(sha256);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
  });
});
