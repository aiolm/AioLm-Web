import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalTime } from "@/components/local-time";
import { I18nProvider } from "@/i18n/client";

const render = (value: string) => renderToStaticMarkup(
  <I18nProvider locale="ko" messages={{}}><LocalTime value={value} /></I18nProvider>,
);

describe("local time hydration fallback", () => {
  it("normalizes offset input to UTC for the machine-readable time and hover tooltip", () => {
    const html = render("2026-09-21T00:30:00+09:00");
    expect(html).toContain('dateTime="2026-09-20T15:30:00.000Z"');
    expect(html).toContain('title="2026-09-20 15:30:00.000 UTC"');
    expect(html).toContain('>2026-09-20 15:30:00.000 UTC</time>');
  });

  it("shows a gap for invalid timestamps instead of an invalid date or tooltip", () => {
    expect(render("invalid")).toBe("<span>—</span>");
  });
});
