"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ALLOWED_MARKDOWN_ELEMENTS, isAllowedMarkdownUrl, markdownUrlTransform } from "@/lib/markdown";
import { truncateToCodePoints } from "./ui";

/**
 * Kept apart from ./ui so the Markdown stack loads only on the pages that render
 * a description (result detail and management), not on every page that only
 * needs a fetch hook or an error helper.
 */

/** Unsafe link targets render as plain spans, never anchors. */
function SafeLink({ href, children }: { href?: string; children?: React.ReactNode }): React.JSX.Element {
  if (href && isAllowedMarkdownUrl(href)) {
    return <a href={href}>{children}</a>;
  }
  return <span>{children}</span>;
}

/** Safe Markdown: react-markdown allowlist + skipHtml + http(s)-only links. No hand-rolled parser. */
export function SafeMarkdown({ text }: { text: string }): React.JSX.Element {
  const limited = truncateToCodePoints(text, 4000);
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        allowedElements={[...ALLOWED_MARKDOWN_ELEMENTS]}
        unwrapDisallowed
        urlTransform={markdownUrlTransform}
        components={{ a: SafeLink }}
      >
        {limited}
      </ReactMarkdown>
    </div>
  );
}
