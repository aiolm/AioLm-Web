"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TurnstileWidget } from "@/components/turnstile";

export function friendlyVerifyError(status: number | null, code: string | null): string {
  if (status === 410 || code === "verification_expired") return "This session expired. Start a new publish from the app.";
  if (status === 404) return "This session was not found. Start a new publish from the app.";
  if (status === 429) return "Too many attempts right now. Wait a moment and try again.";
  if (status === 503) return "Verification is not available right now. Please try again later.";
  if (code === "verification_required") return "Verification failed or expired. Complete it again and continue.";
  return "Verification failed. Please try again.";
}

async function readVerifyCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : null;
  } catch {
    return null;
  }
}

export function VerifyPanel({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const mountedRef = useRef(true);
  const sendingRef = useRef(false);

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
    if (!mountedRef.current) return;
    setToken(null);
    setState("error");
    setMessage("Verification expired. Complete it again, then continue.");
  }, []);

  const submit = async (): Promise<void> => {
    // In-flight ref stays authoritative even if expiry/error callbacks flip UI state mid-POST.
    if (sendingRef.current || state === "sending" || state === "done") return;
    if (!token) {
      setState("error");
      setMessage("Complete the verification step first, then continue.");
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
        setToken(null);
        setState("done");
        setMessage("Verified. Return to the app; it will continue automatically.");
        return;
      }
      const code = await readVerifyCode(res);
      // The attempted one-use token may already be consumed, even for
      // non-token errors, so every failure forces a fresh challenge before retry.
      setToken(null);
      setWidgetKey((k) => k + 1);
      setState("error");
      setMessage(friendlyVerifyError(res.status, code));
    } catch {
      if (!mountedRef.current) return;
      // Lost response may still have consumed the one-use token: reset before retry.
      setToken(null);
      setWidgetKey((k) => k + 1);
      setState("error");
      setMessage(friendlyVerifyError(null, null));
    } finally {
      sendingRef.current = false;
    }
  };

  return (
    <div className="grid">
      <section className="card" aria-labelledby="verify-title">
        <h1 id="verify-title">Verify publishing</h1>
        <p className="muted">
          This confirms you are human before the benchmark is accepted. No account needed;
          the app keeps your owner credential and never shares it with this page.
        </p>
        <TurnstileWidget key={widgetKey} action="benchmark_publish" onVerify={handleVerify} onExpire={handleExpire} />
        <p>
          <button type="button" className="primary" disabled={state === "sending" || state === "done"} onClick={() => void submit()}>
            {state === "sending" ? "Verifying…" : "Verify and continue"}
          </button>
        </p>
        {message ? <p role={state === "error" ? "alert" : "status"}>{message}</p> : null}
      </section>
    </div>
  );
}
