"use client";

import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove?: (id: string) => void;
    };
    __turnstileLoaded?: boolean;
  }
}

/** Cloudflare Turnstile widget. Loads the official script once; returns the token via onVerify. */
export function TurnstileWidget({
  onVerify,
  onExpire,
  action,
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  action?: string;
}): React.JSX.Element {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const siteKey = process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] ?? "";
  const [error, setError] = useState<string | null>(() =>
    siteKey ? null : "turnstile.notConfigured",
  );
  const verifyRef = useRef(onVerify);
  const expireRef = useRef(onExpire);
  useEffect(() => {
    verifyRef.current = onVerify;
  }, [onVerify]);
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  const actionValue = action ?? "benchmark_publish";
  const previousLocale = useRef(locale);

  useEffect(() => {
    if (!siteKey) return;
    if (previousLocale.current !== locale) {
      previousLocale.current = locale;
      expireRef.current?.();
    }
    let cancelled = false;
    let widgetId: string | undefined;
    let script: HTMLScriptElement | null = null;
    let loadListener: (() => void) | null = null;
    let errorListener: (() => void) | null = null;
    const container = ref.current;

    const render = (): void => {
      if (cancelled || !container || !window.turnstile) return;
      // Avoid double-rendering into the same container under StrictMode remounts.
      if (container.childElementCount > 0) return;
      try {
        widgetId = window.turnstile.render(container, {
          sitekey: siteKey,
          action: actionValue,
          language: turnstileLanguage(locale),
          callback: (token: string) => {
            if (cancelled) return;
            // A fresh token replaces any stale widget error.
            setError(null);
            verifyRef.current(token);
          },
          "expired-callback": () => {
            if (cancelled) return;
            try {
              if (widgetId) window.turnstile?.reset(widgetId);
            } catch {
              // Reset is best-effort; expiry is still reported.
            }
            expireRef.current?.();
          },
          "error-callback": () => {
            if (cancelled) return;
            setError("turnstile.failed");
            // Invalidate any parent one-use token; it must not be reused after a widget failure.
            try {
              expireRef.current?.();
            } catch {
              // Parent invalidation is best-effort.
            }
          },
          "timeout-callback": () => {
            if (cancelled) return;
            setError("turnstile.timeout");
            // A timed-out widget must not leave a stale parent token behind.
            try {
              expireRef.current?.();
            } catch {
              // Parent invalidation is best-effort.
            }
          },
        });
      } catch {
        if (!cancelled) setError("turnstile.failed");
      }
    };

    const handleLoad = (): void => {
      window.__turnstileLoaded = true;
      render();
    };
    const handleScriptError = (): void => {
      if (cancelled) return;
      setError("turnstile.scriptFailed");
      // Script failure invalidates the parent token so a stale token is never submitted.
      try {
        expireRef.current?.();
      } catch {
        // Parent invalidation is best-effort.
      }
    };

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!existing) {
        const el = document.createElement("script");
        el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        el.async = true;
        el.defer = true;
        el.dataset["turnstile"] = "1";
        loadListener = handleLoad;
        errorListener = handleScriptError;
        el.addEventListener("load", loadListener);
        el.addEventListener("error", errorListener);
        document.head.appendChild(el);
        script = el;
      } else {
        script = existing;
        loadListener = handleLoad;
        errorListener = handleScriptError;
        existing.addEventListener("load", loadListener);
        existing.addEventListener("error", errorListener);
        if (window.__turnstileLoaded) render();
      }
    }

    return () => {
      cancelled = true;
      try {
        if (loadListener && script) script.removeEventListener("load", loadListener);
        if (errorListener && script) script.removeEventListener("error", errorListener);
      } catch {
        // Listener removal is best-effort during teardown.
      }
      try {
        if (widgetId && window.turnstile?.remove) window.turnstile.remove(widgetId);
      } catch {
        // Removal is best-effort; the container unmounts regardless.
      }
      // Clear any rendered iframe content left behind.
      try {
        if (container) container.innerHTML = "";
      } catch {
        // Container cleanup is best-effort.
      }
    };
  }, [siteKey, actionValue, locale]);

  if (!siteKey) return <p className="muted" role="note">{t("turnstile.notConfigured")}</p>;
  return (
    <div>
      <div ref={ref} />
      {error ? <p className="error" role="alert">{t(error)}</p> : null}
    </div>
  );
}

export function turnstileLanguage(locale: Locale): string {
  return locale;
}
