"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ALLOWED_MARKDOWN_ELEMENTS, isAllowedMarkdownUrl, markdownUrlTransform } from "@/lib/markdown";

/** Unsafe link targets render as plain spans, never anchors. */
function SafeLink({ href, children }: { href?: string; children?: React.ReactNode }): React.JSX.Element {
  if (href && isAllowedMarkdownUrl(href)) {
    return <a href={href}>{children}</a>;
  }
  return <span>{children}</span>;
}

/** Truncate to a maximum number of Unicode codepoints without regex parsing. */
export function truncateToCodePoints(text: string, max: number): string {
  if (max < 0) return "";
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join("");
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

export function Loading({ label }: { label: string }): React.JSX.Element {
  return (
    <p role="status" aria-live="polite" className="muted">{label}</p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }): React.JSX.Element {
  return (
    <div className="alert error" role="alert">
      <p><strong>Something went wrong.</strong> {message}</p>
      {onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }): React.JSX.Element {
  return (
    <div className="card" role="status">
      <p><strong>{title}</strong></p>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  );
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function useJsonFetch<T>(url: string | null): { data: T | null; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({
    url: null,
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let cancelled = false;
    fetch(url, { headers: { accept: "application/json" }, signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(parseError(body, res.status));
        }
        return (await res.json()) as T;
      })
      .then((json) => { if (!cancelled && !controller.signal.aborted) setState({ url, data: json, error: null }); })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted || isAbortError(err)) return;
        if (!cancelled) setState({ url, data: null, error: err instanceof Error ? err.message : "Request failed." });
      });
    return () => { cancelled = true; controller.abort(); };
  }, [url, nonce]);
  // Only expose results for the current url; a fresh url resets to loading without a sync setState.
  if (state.url !== url) return { data: null, error: null, reload };
  return { data: state.data, error: state.error, reload };
}

function parseError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
    if (parsed.error?.message) return `${parsed.error.code ?? status}: ${parsed.error.message}`;
  } catch {
    // fall through
  }
  return `HTTP ${status}`;
}
