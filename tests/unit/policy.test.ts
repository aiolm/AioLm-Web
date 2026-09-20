import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { decodeCursor, decodeRowsCursor, encodeCursor, encodeRowsCursor } from "@/lib/pagination";
import { isAllowedMarkdownUrl, markdownUrlTransform } from "@/lib/markdown";
import { SafeMarkdown } from "@/components/ui";

describe("pagination cursors", () => {
  it("round-trips list cursors and rejects garbage", () => {
    const cursor = encodeCursor("2026-01-01T00:00:00.000Z", "babc123");
    expect(decodeCursor(cursor)).toEqual({ createdAt: "2026-01-01T00:00:00.000Z", publicId: "babc123" });
    expect(decodeCursor("garbage")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it("clamps row offsets to the 10000 cap", () => {
    expect(decodeRowsCursor(null)).toBe(0);
    expect(decodeRowsCursor(encodeRowsCursor(5000))).toBe(5000);
    expect(decodeRowsCursor(encodeRowsCursor(99_999))).toBe(10000);
  });
});

describe("markdown url policy", () => {
  it("allows http(s) only", () => {
    expect(isAllowedMarkdownUrl("https://example.com/x")).toBe(true);
    expect(isAllowedMarkdownUrl("http://example.com/x")).toBe(true);
    expect(isAllowedMarkdownUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedMarkdownUrl("data:text/html,<h1>x</h1>")).toBe(false);
    expect(markdownUrlTransform("javascript:alert(1)")).toBe("#blocked");
  });
});

function render(text: string): string {
  return renderToStaticMarkup(createElement(SafeMarkdown, { text }));
}

describe("markdown rendering policy", () => {
  it("strips raw HTML and event handlers", () => {
    const html = render('<script>alert(1)</script><p onclick="x()">hi</p>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("keeps HTML-looking text inside code fences as code", () => {
    const html = render("```html\n<script>alert(1)</script>\n```");
    expect(html).toContain("<code");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("does not render images (allowlist strips the node entirely)", () => {
    const html = render("![alt](https://example.com/x.png)");
    expect(html).not.toContain("<img");
    // Neither the image URL nor a hand-rolled alt fallback may leak through.
    expect(html).not.toContain("x.png");
  });

  it("renders unsafe links as spans, never anchors", () => {
    const html = render("[click](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<span>click</span>");
  });

  it("renders https links and autolinks as anchors", () => {
    expect(render("[docs](https://example.com/x)")).toContain('<a href="https://example.com/x">docs</a>');
    expect(render("<https://example.com/y>")).toContain('<a href="https://example.com/y">');
    expect(render("[ref][1]\n\n[1]: https://example.com/z")).toContain('<a href="https://example.com/z">ref</a>');
  });

  it("renders paragraphs, lists, and code blocks", () => {
    const html = render("# Title\n\n- one\n- two\n\n`code`");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<code>code</code>");
  });
});
