/**
 * Markdown rendering policy (mirrors the app contract rule): paragraphs, lists,
 * HTTP(S) links, and code blocks only. No HTML, images, executable URLs, MDX,
 * or raw HTML plugins. Rendering uses react-markdown with skipHtml, this exact
 * allowedElements list, unwrapDisallowed, and http(s)-only links; unsafe link
 * targets render as plain spans, never anchors. No hand-rolled Markdown parsing.
 */

export const ALLOWED_MARKDOWN_ELEMENTS = [
  "p",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "strong",
  "em",
  "blockquote",
] as const;

export function isAllowedMarkdownUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function markdownUrlTransform(url: string): string {
  return isAllowedMarkdownUrl(url) ? url : "#blocked";
}
