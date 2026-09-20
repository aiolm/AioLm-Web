"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { countCodePoints } from "@aiolm/benchmark-contracts";
import { DESCRIPTION_MAX_CODEPOINTS } from "@/lib/validation";
import { SafeMarkdown } from "./ui";

interface ManagedInfo {
  id: string;
  submission_id: string;
  public_id: string;
  hidden: boolean;
  revision: number;
  description_md: string;
  expires_at: string;
}

/**
 * Recovery management: paste a recovery code (never in the URL), open a
 * result-scoped session, view hidden state, edit the description with
 * expected_revision, or delete. Cookie session plus CSRF are required
 * for every change.
 */

export function shouldAdoptServerDescription(isDirty: boolean, prevPublicId: string | null, nextPublicId: string): boolean {
  if (prevPublicId !== nextPublicId) return true;
  return !isDirty;
}

/** Restored cookie sessions stay read-only until a fresh recovery code provides editing permission. */
export function canEditManagement(infoPresent: boolean, csrf: string | null): boolean {
  return infoPresent && csrf !== null;
}

/** Generation guard for the mount restore: a slow restore must not overwrite fresher explicit session work. */
export function isStaleSessionRestore(requestOp: number, currentOp: number): boolean {
  return requestOp !== currentOp;
}

export function ManagementPanel(): React.JSX.Element {
  const [code, setCode] = useState("");
  const [csrf, setCsrf] = useState<string | null>(null);
  const [info, setInfo] = useState<ManagedInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(false);
  const infoRef = useRef<ManagedInfo | null>(null);
  const mountedRef = useRef(true);
  const sessionOpRef = useRef(0);
  const restoreAbortRef = useRef<AbortController | null>(null);
  const draftLength = countCodePoints(draft);

  const invalidateRestore = useCallback((): void => {
    sessionOpRef.current += 1;
    try {
      restoreAbortRef.current?.abort();
    } catch {
      // Aborting a stale restore is best-effort.
    }
  }, []);

  const say = useCallback((text: string, isError = false): void => {
    if (!mountedRef.current) return;
    setMessage(text);
    setMessageIsError(isError);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  const applyServerInfo = useCallback(
    (next: ManagedInfo): void => {
      const prev = infoRef.current;
      const adopt = shouldAdoptServerDescription(dirtyRef.current, prev?.public_id ?? null, next.public_id);
      setInfo(next);
      infoRef.current = next;
      if (adopt) {
        setDraft(next.description_md);
        setIsDirty(false);
        dirtyRef.current = false;
      }
    },
    [],
  );

  const loadSession = useCallback(
    async (opts: { silent?: boolean } = {}): Promise<ManagedInfo | null> => {
      // An explicit reload wins over a slow mount restore.
      invalidateRestore();
      try {
        const res = await fetch("/v1/management-sessions");
        if (!mountedRef.current) return null;
        if (!res.ok) {
          if (!opts.silent) {
            setInfo(null);
            infoRef.current = null;
            say("No active session. Paste your recovery code to open one.", false);
          }
          return null;
        }
        const json = (await res.json()) as ManagedInfo;
        if (!mountedRef.current) return null;
        applyServerInfo(json);
        return json;
      } catch {
        if (!opts.silent && mountedRef.current) say("Could not reach the server. Check your connection and try again.", true);
        return null;
      }
    },
    [applyServerInfo, invalidateRestore, say],
  );

  // Restore a current cookie session after a page reload (read-only until a
  // fresh code provides editing permission again). A slow restore for a
  // previous cookie must not overwrite fresher explicit session work or
  // restore a cleared/deleted session. StrictMode-safe via guard.
  useEffect(() => {
    const myOp = sessionOpRef.current;
    const controller = new AbortController();
    restoreAbortRef.current = controller;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/v1/management-sessions", { signal: controller.signal });
        if (cancelled || controller.signal.aborted || !mountedRef.current) return;
        if (isStaleSessionRestore(myOp, sessionOpRef.current)) return;
        if (!res.ok) return;
        const json = (await res.json()) as ManagedInfo;
        if (cancelled || controller.signal.aborted || !mountedRef.current) return;
        if (isStaleSessionRestore(myOp, sessionOpRef.current)) return;
        applyServerInfo(json);
        say("Session restored. Paste your recovery code again to allow changes.", false);
      } catch {
        // Stay on the recovery form; no announcement needed before interaction.
        // Abort errors stay silent so they never overwrite explicit session work.
      } finally {
        if (restoreAbortRef.current === controller) restoreAbortRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
      try {
        controller.abort();
      } catch {
        // Abort on unmount is best-effort.
      }
    };
  }, [applyServerInfo, say]);

  const openSession = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    invalidateRestore();
    setBusy(true);
    say("", false);
    try {
      const res = await fetch("/v1/management-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recovery_code: code.trim() }),
      });
      if (!mountedRef.current) return;
      if (!res.ok) {
        say(
          res.status === 401
            ? "That recovery code was not accepted. Check it and try again."
            : "Could not open a session right now. Please try again.",
          true,
        );
        return;
      }
      const json = (await res.json()) as { id: string; csrf_token: string };
      if (!mountedRef.current) return;
      setCsrf(json.csrf_token);
      // The code has served its purpose: drop it immediately, never retain it.
      setCode("");
      setIsDirty(false);
      dirtyRef.current = false;
      await loadSession({ silent: true });
      say("Session opened for 30 minutes on this device.", false);
    } catch {
      say("Could not reach the server. Check your connection and try again.", true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const saveDescription = async (): Promise<void> => {
    if (busy) return;
    if (!info) {
      say("Open a management session first.", true);
      return;
    }
    if (!csrf) {
      say("Editing needs a fresh session. Paste your recovery code again, then save.", true);
      return;
    }
    if (draftLength > DESCRIPTION_MAX_CODEPOINTS) {
      say(`Description is ${draftLength} characters; the limit is ${DESCRIPTION_MAX_CODEPOINTS}. Shorten it and try again.`, true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/v1/benchmark-runs/${info.public_id}/description`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ description_md: draft, expected_revision: info.revision }),
      });
      if (!mountedRef.current) return;
      if (res.status === 409) {
        // Keep the user's draft (even when intentionally empty); only advance
        // the saved marker so a retry uses the newest version.
        const current = await fetch("/v1/management-sessions").then((r) => (r.ok ? r.json() : null)).catch(() => null) as ManagedInfo | null;
        if (current && mountedRef.current) {
          setInfo(current);
          infoRef.current = current;
        }
        say(
          "Someone else changed the description first (newer version saved). Your text is kept above — compare it with the saved version below, then save again to replace it.",
          true,
        );
        return;
      }
      if (res.status === 410) {
        say("This benchmark was deleted and can no longer be edited.", true);
        return;
      }
      if (res.status === 403) {
        say("Saving was refused. Paste your recovery code again and try once more.", true);
        return;
      }
      if (!res.ok) {
        say("Save failed. Please try again. Your text is kept above.", true);
        return;
      }
      // A 401 error JSON must never become the managed record.
      const current = (await fetch("/v1/management-sessions").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as ManagedInfo | null;
      if (current && mountedRef.current) {
        setInfo(current);
        infoRef.current = current;
        setDraft(current.description_md);
        setIsDirty(false);
        dirtyRef.current = false;
      } else if (mountedRef.current) {
        setIsDirty(false);
        dirtyRef.current = false;
      }
      say("Description updated.", false);
    } catch {
      say("Could not reach the server. Your text is kept above.", true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    if (!info) return;
    if (!csrf) {
      say("Deleting needs a fresh session. Paste your recovery code again, then delete.", true);
      return;
    }
    if (!window.confirm("Delete this benchmark? Its public page will be removed permanently.")) return;
    invalidateRestore();
    setBusy(true);
    try {
      const res = await fetch(`/v1/benchmark-runs/${info.public_id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf },
      });
      if (!mountedRef.current) return;
      if (res.status === 204 || res.ok) {
        say("Deleted. This benchmark no longer appears publicly, and its sharing link will not work again.", false);
        setInfo(null);
        infoRef.current = null;
        setCsrf(null);
        setDraft("");
        setIsDirty(false);
        dirtyRef.current = false;
      } else if (res.status === 403) {
        say("Delete was refused. Paste your recovery code again and try once more.", true);
      } else if (res.status === 410) {
        say("This benchmark was already deleted.", true);
      } else {
        say("Delete failed. Please try again.", true);
      }
    } catch {
      say("Could not reach the server. Nothing was deleted.", true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    if (busy) return;
    invalidateRestore();
    setBusy(true);
    try {
      const res = await fetch("/v1/management-sessions", { method: "DELETE", headers: csrf ? { "x-csrf-token": csrf } : {} });
      if (!mountedRef.current) return;
      if (res.ok || res.status === 204) {
        setInfo(null);
        infoRef.current = null;
        setCsrf(null);
        setCode("");
        setDraft("");
        setIsDirty(false);
        dirtyRef.current = false;
        say("Session cleared on this device.", false);
      } else if (res.status === 403) {
        say("Could not clear the session (permission check failed). Nothing was cleared — try again.", true);
      } else {
        say(`Could not clear the session right now. Nothing was cleared — try again.`, true);
      }
    } catch {
      say("Could not reach the server. Nothing was cleared — try again.", true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const onDraftChange = (value: string): void => {
    setDraft(value);
    setIsDirty(true);
    dirtyRef.current = true;
  };

  const canEdit = canEditManagement(info !== null, csrf);
  const showSavedComparison = info !== null && isDirty && draft !== info.description_md;

  return (
    <div className="grid">
      <section className="card" aria-labelledby="manage-title">
        <h1 id="manage-title">Manage a published benchmark</h1>
        <p className="muted">Paste the recovery code saved at publish time. It is sent once and never placed in the address bar.</p>
        <form method="POST" action="/v1/management-sessions" onSubmit={(e) => void openSession(e)}>
          <div className="field">
            <label htmlFor="recovery-code">Recovery code</label>
            <textarea
              id="recovery-code" name="recovery_code" required autoComplete="off" spellCheck={false}
              placeholder="aiolm-recovery-v1.…"
              value={code} onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              aria-describedby="recovery-hint"
            />
            <span id="recovery-hint" className="hint">Starts with aiolm-recovery-v1. — keep it private.</span>
          </div>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Opening…" : "Open management session"}</button>
        </form>
        {message ? <p role={messageIsError ? "alert" : "status"}>{message}</p> : null}
      </section>

      {info ? (
        <section className="card" aria-labelledby="record-title">
          <h2 id="record-title">Your record {info.hidden ? "(hidden by moderators)" : ""}</h2>
          <dl className="kv">
            <dt>Public id</dt><dd>{info.public_id}</dd>
            <dt>Revision</dt><dd>{info.revision}</dd>
            <dt>Session expires</dt><dd>{new Date(info.expires_at).toLocaleString()}</dd>
          </dl>
          {!csrf ? (
            <p role="status" className="muted">Session found on this device, but changes need a fresh code. Paste your recovery code above to allow saving or deleting.</p>
          ) : null}
          <div className="field">
            <label htmlFor="desc-draft">Description (Markdown, max {DESCRIPTION_MAX_CODEPOINTS} characters)</label>
            <textarea
              id="desc-draft" value={draft} onChange={(e) => onDraftChange(e.target.value)}
              disabled={busy}
              aria-describedby="desc-count"
            />
            <span id="desc-count" className="hint" aria-live="polite">
              {draftLength} / {DESCRIPTION_MAX_CODEPOINTS} characters
              {draftLength > DESCRIPTION_MAX_CODEPOINTS ? " — over the limit" : ""}
              {isDirty ? " — unsaved changes" : ""}
            </span>
          </div>
          <h3>Preview</h3>
          {draft ? <SafeMarkdown text={draft} /> : <p className="muted">Empty description.</p>}
          {showSavedComparison ? (
            <div>
              <h3>Saved version (revision {info.revision})</h3>
              {info.description_md ? <SafeMarkdown text={info.description_md} /> : <p className="muted">Saved description is empty.</p>}
            </div>
          ) : null}
          <p>
            <button type="button" className="primary" disabled={busy || !canEdit} onClick={() => void saveDescription()}>Save description</button>{" "}
            <button type="button" disabled={busy} onClick={() => void loadSession()}>Reload</button>{" "}
            <button type="button" className="danger" disabled={busy || !canEdit} onClick={() => void remove()}>Delete benchmark</button>{" "}
            <button type="button" disabled={busy} onClick={() => void signOut()}>Clear session</button>
          </p>
        </section>
      ) : null}
    </div>
  );
}
