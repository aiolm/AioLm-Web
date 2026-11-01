import ManagePage, { generateMetadata as manageMetadata } from "@/app/[locale]/manage/page";
import VerifyPage, { generateMetadata as verifyMetadata } from "@/app/[locale]/verify/[sessionId]/page";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { locales, type Locale } from "@/i18n/config";
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
import { managementErrorKey } from "@/components/management-panel";
import { friendlyVerifyError, verifyErrorKey } from "@/components/verify-panel";
import { friendlyReportError, reportErrorKey } from "@/components/report-form";
import { turnstileLanguage } from "@/components/turnstile";
import { apiErrorKey, parseApiErrorKey, friendlyApiError, readApiErrorCode } from "@/components/ui";
import { SafeMarkdown } from "@/components/safe-markdown";

const common: Record<Locale, MessageCatalog> = { en: commonEn, ko: commonKo, ja: commonJa, zh: commonZh };
const management: Record<Locale, MessageCatalog> = { en: managementEn, ko: managementKo, ja: managementJa, zh: managementZh };
const wrap = (locale: Locale, messages: MessageCatalog, children: React.ReactNode): string =>
  renderToStaticMarkup(<I18nProvider locale={locale} messages={messages}>{children}</I18nProvider>);

vi.mock("@/i18n/server", () => ({ getMessages: async (locale: Locale) => management[locale] }));


describe.each(locales)("management and common localization: %s", (locale) => {
  const messages = { ...common[locale], ...management[locale] };
  const t = createTranslator(messages);

  it("loads localized routes with noindex metadata", async () => {
    const params = Promise.resolve({ locale, sessionId: "synthetic-session" });
    expect((await manageMetadata({ params })).robots).toEqual({ index: false, follow: false });
    expect((await verifyMetadata({ params })).robots).toEqual({ index: false, follow: false });
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
