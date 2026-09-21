"use client";

import { useI18n } from "@/i18n/client";
import { localizedPath } from "@/i18n/config";
import type { Translator } from "@/i18n/types";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ALLOWED_MARKDOWN_ELEMENTS, isAllowedMarkdownUrl, markdownUrlTransform } from "@/lib/markdown";
import Link from "next/link";

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

export function Loading({ label }: { label?: string }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <p role="status" aria-live="polite" className="muted">{label ?? t("common.loading")}</p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="alert error" role="alert">
      <p><strong>{t("common.errorTitle")}</strong> {message}</p>
      {onRetry ? <button type="button" onClick={onRetry}>{t("common.retry")}</button> : null}
    </div>
  );
}

/**
 * The explorer's empty result state. The illustration is decorative; the
 * "About AioLM" link gives a reader who lands on an empty explorer somewhere to
 * go, which the results panel itself cannot offer.
 */
export function EmptyState({ title, hint }: { title: string; hint?: string }): React.JSX.Element {
  const { locale, t } = useI18n();
  return (
    <div className="empty-state" role="status">
      <span className="empty-state-art" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="44" height="44" focusable="false">
          <g fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V7.6L14 3Z" />
            <path d="M13.8 3.2v4.4h4.4M8.8 12.5h6.4M8.8 16h4.4" />
          </g>
        </svg>
      </span>
      <p className="empty-state-title"><strong>{title}</strong></p>
      {hint ? <p className="empty-state-hint muted">{hint}</p> : null}
      <Link className="empty-state-link" href={localizedPath(locale, "/")}>
        {t("common.about")}
      </Link>
    </div>
  );
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function useJsonFetch<T>(url: string | null, initialData: T | null = null): { data: T | null; error: string | null; reload: () => void } {
  const { t } = useI18n();
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({
    url: initialData === null ? null : url,
    data: initialData,
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
          throw new LocalizedRequestError(parseApiErrorKey(body, res.status));
        }
        return (await res.json()) as T;
      })
      .then((json) => { if (!cancelled && !controller.signal.aborted) setState({ url, data: json, error: null }); })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted || isAbortError(err)) return;
        if (!cancelled) setState({ url, data: null, error: err instanceof LocalizedRequestError ? err.key : "error.network" });
      });
    return () => { cancelled = true; controller.abort(); };
  }, [url, nonce]);
  // Only expose results for the current url; a fresh url resets to loading without a sync setState.
  if (state.url !== url) return { data: null, error: null, reload };
  return { data: state.data, error: state.error ? t(state.error) : null, reload };
}

/** Store only a trusted catalog key; translate on render after any locale change. */
class LocalizedRequestError extends Error {
  constructor(readonly key: string) { super(key); }
}

const apiErrorKeys: Record<string, string> = {
  not_found: "error.notFound",
  rate_limited: "error.rateLimited",
  service_unavailable: "error.unavailable",
  invalid_request: "error.invalidRequest",
  payload_too_large: "error.tooLarge",
  ownership_missing: "error.ownership",
  invalid_csrf: "error.csrf",
  revision_conflict: "error.conflict",
  submission_deleted: "error.deleted",
  verification_required: "error.verification",
  verification_expired: "error.expired",
  body_mismatch: "error.bodyMismatch",
  internal_error: "error.unknown",
};

/** API diagnostics stay on the wire; arbitrary server messages never become UI text. */
export function apiErrorKey(status: number | null, code: string | null): string {
  if (code && Object.hasOwn(apiErrorKeys, code)) return apiErrorKeys[code];
  if (status === null) return "error.network";
  if (status === 404) return "error.notFound";
  if (status === 429) return "error.rateLimited";
  if (status === 503) return "error.unavailable";
  if (status === 413) return "error.tooLarge";
  if (status === 401 || status === 403) return "error.ownership";
  if (status >= 400 && status < 500) return "error.invalidRequest";
  return "error.unknown";
}

function errorCode(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = body.error;
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
}

export async function readApiErrorCode(res: Response): Promise<string | null> {
  try { return errorCode(await res.clone().json()); } catch { return null; }
}

export function parseApiErrorKey(body: string, status: number): string {
  try { return apiErrorKey(status, errorCode(JSON.parse(body))); } catch { return apiErrorKey(status, null); }
}

export function friendlyApiError(body: string, status: number, t: Translator): string {
  return t(parseApiErrorKey(body, status));
}
