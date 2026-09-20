"use client";

import { useI18n } from "@/i18n/client";
import type { Translator } from "@/i18n/types";
import { readApiErrorCode } from "./ui";

import { useCallback, useEffect, useRef, useState } from "react";
import { TurnstileWidget } from "@/components/turnstile";

export function verifyErrorKey(status: number | null, code: string | null): string {
  if (status === 410 || code === "verification_expired") return "verify.expiredSession";
  if (status === 404 || code === "not_found") return "verify.notFound";
  if (status === 429 || code === "rate_limited") return "error.rateLimited";
  if (status === 503 || code === "service_unavailable") return "verify.unavailable";
  if (code === "verification_required") return "verify.verification";
  return "verify.failed";
}

export function friendlyVerifyError(status: number | null, code: string | null, t: Translator): string {
  return t(verifyErrorKey(status, code));
}

export function VerifyPanel({ sessionId }: { sessionId: string }): React.JSX.Element {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const mountedRef = useRef(true);
  const sendingRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleVerify = useCallback((value: string): void => {
    if (!mountedRef.current) return;
    setToken(value);
    setState((prev) => (prev === "error" ? "idle" : prev));
    setMessage("");
  }, []);

  const handleExpire = useCallback((): void => {
    if (!mountedRef.current || completedRef.current) return;
    setToken(null);
    setState("error");
    setMessage("verify.expired");
  }, []);

  const submit = async (): Promise<void> => {
    // In-flight ref stays authoritative even if expiry/error callbacks flip UI state mid-POST.
    if (sendingRef.current || state === "sending" || state === "done") return;
    if (!token) {
      setState("error");
      setMessage("verify.required");
      return;
    }
    sendingRef.current = true;
    setState("sending");
    setMessage("");
    try {
      const res = await fetch(`/v1/upload-sessions/${sessionId}/verify`, {
        method: "POST",
        // Token travels in the JSON body only; never in URLs/logs/storage.
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        completedRef.current = true;
        setToken(null);
        setState("done");
        setMessage("verify.done");
        return;
      }
      const code = await readApiErrorCode(res);
      if (!mountedRef.current) return;
      // The attempted one-use token may already be consumed, even for
      // non-token errors, so every failure forces a fresh challenge before retry.
      setToken(null);
      setWidgetKey((k) => k + 1);
      setState("error");
      setMessage(verifyErrorKey(res.status, code));
    } catch {
      if (!mountedRef.current) return;
      // Lost response may still have consumed the one-use token: reset before retry.
      setToken(null);
      setWidgetKey((k) => k + 1);
      setState("error");
      setMessage(verifyErrorKey(null, null));
    } finally {
      sendingRef.current = false;
    }
  };

  return (
    <div className="grid">
      <section className="card" aria-labelledby="verify-title">
        <h1 id="verify-title">{t("verify.title")}</h1>
        <p className="muted">
          {t("verify.intro")}
        </p>
        <TurnstileWidget key={widgetKey} action="benchmark_publish" onVerify={handleVerify} onExpire={handleExpire} />
        <p>
          <button type="button" className="primary" disabled={state === "sending" || state === "done"} onClick={() => void submit()}>
            {state === "sending" ? t("verify.sending") : t("verify.continue")}
          </button>
        </p>
        {message ? <p role={state === "error" ? "alert" : "status"}>{t(message)}</p> : null}
      </section>
    </div>
  );
}
