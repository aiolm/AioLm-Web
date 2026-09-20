import ManagePage, { generateMetadata as manageMetadata } from "@/app/[locale]/manage/page";
import VerifyPage, { generateMetadata as verifyMetadata } from "@/app/[locale]/verify/[sessionId]/page";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { intlLocales, locales, type Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/translate";
import type { MessageCatalog } from "@/i18n/types";
import commonEn from "@/i18n/messages/common/en";
import commonKo from "@/i18n/messages/common/ko";
import commonJa from "@/i18n/messages/common/ja";
import commonZh from "@/i18n/messages/common/zh";
import managementEn from "@/i18n/messages/management/en";
import managementKo from "@/i18n/messages/management/ko";
import managementJa from "@/i18n/messages/management/ja";
import managementZh from "@/i18n/messages/management/zh";
import { ManagementPanel, managementErrorKey } from "@/components/management-panel";
import { VerifyPanel, friendlyVerifyError, verifyErrorKey } from "@/components/verify-panel";
import { ReportForm, friendlyReportError, reportErrorKey } from "@/components/report-form";
import { turnstileLanguage } from "@/components/turnstile";
import { ErrorState, EmptyState, Loading, SafeMarkdown, apiErrorKey, parseApiErrorKey, friendlyApiError, readApiErrorCode } from "@/components/ui";

const common: Record<Locale, MessageCatalog> = { en: commonEn, ko: commonKo, ja: commonJa, zh: commonZh };
const management: Record<Locale, MessageCatalog> = { en: managementEn, ko: managementKo, ja: managementJa, zh: managementZh };
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const wrap = (locale: Locale, messages: MessageCatalog, children: React.ReactNode): string =>
  renderToStaticMarkup(<I18nProvider locale={locale} messages={messages}>{children}</I18nProvider>);

vi.mock("@/i18n/server", () => ({ getMessages: async (locale: Locale) => management[locale] }));

afterEach(() => vi.unstubAllEnvs());

describe.each(locales)("management and common localization: %s", (locale) => {
  const messages = { ...common[locale], ...management[locale] };
  const t = createTranslator(messages);

  it("loads localized routes with noindex metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const params = Promise.resolve({ locale, sessionId: "synthetic-session" });
    expect(await manageMetadata({ params })).toEqual({ title: management[locale]["manage.title"], robots: { index: false, follow: false } });
    expect(await verifyMetadata({ params })).toEqual({ title: management[locale]["verify.title"], robots: { index: false, follow: false } });
    expect(wrap(locale, common[locale], await ManagePage({ params }))).toContain(management[locale]["manage.title"]);
    expect(wrap(locale, common[locale], await VerifyPage({ params }))).toContain(management[locale]["verify.title"]);
  });

  it("provides identical catalog keys and interpolation parameters", () => {
    for (const namespace of [common, management]) {
      expect(Object.keys(namespace[locale]).sort()).toEqual(Object.keys(namespace.en).sort());
      for (const [key, value] of Object.entries(namespace[locale])) {
        expect(value.trim().length, key).toBeGreaterThan(0);
        expect(placeholders(value), key).toEqual(placeholders(namespace.en[key]));
      }
    }
  });

  it("renders recovery and verification text before hydration without changing API actions", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const manage = wrap(locale, messages, createElement(ManagementPanel));
    expect(manage).toContain(messages["manage.title"]);
    expect(manage).toContain('action="/v1/management-sessions"');
    expect(manage).toContain('name="recovery_code"');
    expect(manage).toContain('autoComplete="off"');
    const verify = wrap(locale, messages, createElement(VerifyPanel, { sessionId: "synthetic-session" }));
    expect(verify).toContain(messages["verify.title"]);
    expect(verify).toContain(messages["verify.continue"]);
    expect(verify).toContain(messages["turnstile.notConfigured"]);
    expect(manage + verify).not.toMatch(/>\s*(?:manage|verify|turnstile)\.[\w]+\s*</);
  });

  it("renders the benchmark report with only common messages and localized numbers", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const html = wrap(locale, common[locale], createElement(ReportForm, { publicId: "synthetic-public-id" }));
    expect(html).toContain(common[locale]["report.title"]);
    expect(html).toContain(common[locale]["report.send"]);
    expect(html).toContain(common[locale]["turnstile.notConfigured"]);
    expect(html).toContain(new Intl.NumberFormat(intlLocales[locale]).format(2000));
    expect(html).toContain('action="/v1/benchmark-runs/synthetic-public-id/reports"');
    expect(html).not.toMatch(/>\s*(?:report|turnstile)\.[\w]+\s*</);
  });

  it("renders shared labels and the locale-preserving home link", () => {
    const html = wrap(locale, common[locale], createElement("div", null,
      createElement(Loading),
      createElement(ErrorState, { message: t("error.network"), onRetry: () => undefined }),
      createElement(EmptyState, { title: "synthetic empty title" }),
    ));
    expect(html).toContain(common[locale]["common.loading"]);
    expect(html).toContain(common[locale]["common.errorTitle"]);
    expect(html).toContain(common[locale]["common.retry"]);
    expect(html).toContain(`href="/${locale}"`);
  });

  it("localizes error codes without displaying server prose or diagnostics", () => {
    const body = JSON.stringify({ error: { code: "invalid_csrf", message: "<script>private diagnostic</script>" } });
    expect(friendlyApiError(body, 403, t)).toBe(common[locale]["error.csrf"]);
    expect(friendlyApiError(body, 403, t)).not.toContain("diagnostic");
    expect(t(managementErrorKey("open", 401, "ownership_missing"))).toBe(management[locale]["manage.badCode"]);
    expect(t(managementErrorKey("load", 503, "service_unavailable"))).toBe(common[locale]["error.unavailable"]);
    expect(t(managementErrorKey("save", 409, "revision_conflict"))).toBe(common[locale]["error.conflict"]);
    expect(t(managementErrorKey("delete", 410, "submission_deleted"))).toBe(common[locale]["error.deleted"]);
    expect(friendlyReportError(403, "verification_required", t)).toBe(common[locale]["report.verification"]);
    expect(friendlyReportError(429, "rate_limited", t)).toBe(common[locale]["report.rateLimited"]);
    expect(friendlyVerifyError(410, "verification_expired", t)).toBe(management[locale]["verify.expiredSession"]);
    expect(friendlyVerifyError(503, "service_unavailable", t)).toBe(management[locale]["verify.unavailable"]);
    if (locale !== "en") expect(friendlyApiError(body, 403, t)).not.toBe(commonEn["error.csrf"]);
  });

  it("keeps user Markdown unchanged and sanitizes unsafe markup", () => {
    const text = "**synthetic user text 日本語 한국어 中文**\n\n<script>unsafe()</script>";
    const html = wrap(locale, messages, createElement(SafeMarkdown, { text }));
    expect(html).toContain("<strong>synthetic user text 日本語 한국어 中文</strong>");
    expect(html).not.toContain("<script>");
  });

  it("uses an explicit supported Turnstile language", () => {
    expect(turnstileLanguage(locale)).toBe(locale);
  });
});

describe("API error boundaries", () => {
  it("uses localized fallbacks for malformed, unknown and network failures", () => {
    expect(parseApiErrorKey("not json", 503)).toBe("error.unavailable");
    expect(parseApiErrorKey("null", 500)).toBe("error.unknown");
    expect(parseApiErrorKey('{"error":{"code":"unrecognized","message":"private"}}', 500)).toBe("error.unknown");
    expect(apiErrorKey(null, null)).toBe("error.network");
    expect(apiErrorKey(500, "__proto__")).toBe("error.unknown");
    expect(apiErrorKey(500, "constructor")).toBe("error.unknown");
  });

  it("reads only string error codes and preserves the original API response", async () => {
    const body = { error: { code: "rate_limited", message: "original diagnostic" } };
    const response = Response.json(body, { status: 429 });
    expect(await readApiErrorCode(response)).toBe("rate_limited");
    expect(await response.json()).toEqual(body);
    expect(await readApiErrorCode(Response.json({ error: { code: 123 } }))).toBeNull();
    expect(await readApiErrorCode(new Response("invalid json"))).toBeNull();
  });

  it("can translate a settled request key after a locale change without retaining old prose", () => {
    const keys = [parseApiErrorKey('{"error":{"code":"invalid_csrf"}}', 403), reportErrorKey(429, "rate_limited"), verifyErrorKey(410, "verification_expired")];
    const en = createTranslator({ ...common.en, ...management.en });
    const ko = createTranslator({ ...common.ko, ...management.ko });
    for (const key of keys) {
      expect(ko(key)).not.toBe(en(key));
      expect(ko(key)).not.toBe(key);
    }
  });
});

it("rejects unsupported locale parameters before loading management pages", async () => {
  const params = Promise.resolve({ locale: "unsupported", sessionId: "synthetic-session" });
  await expect(ManagePage({ params })).rejects.toThrow();
  await expect(VerifyPage({ params })).rejects.toThrow();
  await expect(manageMetadata({ params })).rejects.toThrow();
  await expect(verifyMetadata({ params })).rejects.toThrow();
});
