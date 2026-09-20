"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TurnstileWidget } from "./turnstile";

export function friendlyReportError(status: number | null, code: string | null): string {
  if (status === 404) return "This result is no longer available.";
  if (status === 429) return "Too many reports right now. Please wait and try again.";
  if (status === 503) return "Reporting is not available right now. Please try again later.";
  if (code === "verification_required") return "Verification failed or expired. Complete it again and resend.";
  if (status !== null && status >= 400 && status < 500) return "This report was not accepted. Check the reason and verification, then try again.";
  return "Could not send the report. Check your connection and try again.";
}

async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : null;
  } catch {
    return null;
  }
}

export function ReportForm({ publicId }: { publicId: string }): React.JSX.Element {
  const [reason, setReason] = useState("");
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
    setMessage("Verification expired. Complete it again, then resend.");
  }, []);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    // In-flight ref stays authoritative even if expiry/error callbacks flip UI state mid-POST.
    if (sendingRef.current || state === "sending") return;
    if (!token) {
      setState("error");
      setMessage("Complete the verification step first, then send.");
      return;
    }
    if (!reason.trim()) {
      setState("error");
      setMessage("Describe the issue before sending.");
      return;
    }
    sendingRef.current = true;
    setState("sending");
    setMessage("");
    try {
      const res = await fetch(`/v1/benchmark-runs/${publicId}/reports`, {
        method: "POST",
        // Token travels in the JSON body only; never in URLs/logs/storage.
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), token }),
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        setToken(null);
        setState("done");
        setMessage("Report received. Moderators review reports privately.");
        return;
      }
      const code = await readErrorCode(res);
      // The attempted one-use token may already be consumed, even for
      // non-token errors, so every failure forces a fresh challenge before retry.
      setToken(null);
      setWidgetKey((k) => k + 1);
      setState("error");
      setMessage(friendlyReportError(res.status, code));
    } catch {
      if (!mountedRef.current) return;
      // Lost response may still have consumed the one-use token: reset before retry.
      setToken(null);
      setWidgetKey((k) => k + 1);
      setState("error");
      setMessage(friendlyReportError(null, null));
    } finally {
      sendingRef.current = false;
    }
  };

  if (state === "done") return <div className="alert info" role="status"><p>{message}</p></div>;

  return (
    <section className="card" aria-labelledby="report-title">
      <h2 id="report-title">Report this result</h2>
      <form method="POST" action={`/v1/benchmark-runs/${publicId}/reports`} onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="report-reason">Reason (max 2000 characters)</label>
          <textarea
            id="report-reason" name="reason" required maxLength={2000}
            value={reason} onChange={(e) => setReason(e.target.value)}
            disabled={state === "sending"}
            aria-describedby="report-hint"
          />
          <span id="report-hint" className="hint">Describe what looks wrong. Reports are private to moderators.</span>
        </div>
        <TurnstileWidget key={widgetKey} action="benchmark_report" onVerify={handleVerify} onExpire={handleExpire} />
        <p><button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send report"}</button></p>
        {state === "error" && message ? <p role="alert">{message}</p> : null}
      </form>
    </section>
  );
}
