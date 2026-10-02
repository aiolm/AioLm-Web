"use client";
import { LocalTime } from "./local-time";

import "./management-usability.css";
import "./ui-controls.css";

import { useI18n } from "@/i18n/client";
import { intlLocales, localizedPath } from "@/i18n/config";

import { useCallback, useEffect, useRef, useState } from "react";
import { countCodePoints } from "@aiolm/benchmark-contracts";
import { decodeRecoveryCode } from "@/lib/recovery";
import { readRecoveryFiles, type RecoveryFileEntry } from "@/lib/recovery-files";
import { DESCRIPTION_MAX_CODEPOINTS } from "@/lib/validation";
import { apiErrorKey, readApiErrorCode } from "./ui";
import { SafeMarkdown } from "./safe-markdown";

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
 * Recovery management: pick saved recovery files or paste a recovery code
 * (never in the URL or browser storage), open a result-scoped session, view
 * hidden state, edit the description with expected_revision, or delete.
 * Cookie session plus CSRF are required for every change.
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

function submissionOf(recoveryCode: string): string | null {
  try {
    return decodeRecoveryCode(recoveryCode).submission_id;
  } catch {
    return null;
  }
}

const HANDOFF_FRAGMENT = /^#handoff=([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;

/**
 * Read an app handoff (`#handoff=<id>.<token>`) and erase it from the address
 * bar and history entry at once, whether or not it is well formed.
 */
export function takeHandoffFragment(
  location: { hash: string; pathname: string; search: string },
  history: { replaceState(data: unknown, unused: string, url?: string): void },
): { id: string; token: string } | "invalid" | null {
  if (!location.hash.startsWith("#handoff=")) return null;
  const match = HANDOFF_FRAGMENT.exec(location.hash);
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return match ? { id: match[1]!, token: match[2]! } : "invalid";
}

export function managementErrorKey(operation: "open" | "load" | "save" | "delete" | "clear", status: number, code: string | null): string {
  if (operation === "open" && (code === "ownership_missing" || status === 401)) return "manage.badCode";
  if (operation === "load" && status === 401) return "manage.noSession";
  const key = apiErrorKey(status, code);
  if (key !== "error.unknown") return key;
  return ({ open: "manage.openFailed", load: "error.unknown", save: "manage.saveFailed", delete: "manage.deleteFailed", clear: "manage.clearFailed" })[operation];
}

export function ManagementPanel(): React.JSX.Element {
  const { locale, t } = useI18n();
  const number = (value: number): string => new Intl.NumberFormat(intlLocales[locale]).format(value);
  const [code, setCode] = useState("");
  const [csrf, setCsrf] = useState<string | null>(null);
  const [info, setInfo] = useState<ManagedInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [messageValues, setMessageValues] = useState<Record<string, number>>({});
  const [messageIsError, setMessageIsError] = useState(false);
  const [operation, setOperation] = useState<"read" | "open" | "save" | "reload" | "delete" | "clear" | null>(null);
  // The pasted code the service just refused stays marked invalid until it is edited.
  const [codeRejected, setCodeRejected] = useState(false);
  // Picked recovery files live only in this component's memory.
  const [files, setFiles] = useState<RecoveryFileEntry[]>([]);
  const busy = operation !== null;
  const dirtyRef = useRef(false);
  const infoRef = useRef<ManagedInfo | null>(null);
  const mountedRef = useRef(true);
  const sessionOpRef = useRef(0);
  const restoreAbortRef = useRef<AbortController | null>(null);
  const handoffAttemptedRef = useRef(false);
  const focusRecordRef = useRef(false);
  const recordTitleRef = useRef<HTMLHeadingElement | null>(null);
  const accessTitleRef = useRef<HTMLHeadingElement | null>(null);
  const operationFocusRef = useRef<HTMLElement | null>(null);
  const draftLength = countCodePoints(draft);

  const invalidateRestore = useCallback((): void => {
    sessionOpRef.current += 1;
    try {
      restoreAbortRef.current?.abort();
    } catch {
      // Aborting a stale restore is best-effort.
    }
  }, []);

  const say = useCallback((text: string, isError = false, values: Record<string, number> = {}): void => {
    if (!mountedRef.current) return;
    setMessage(text);
    setMessageValues(values);
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
    async (opts: { silent?: boolean; onFailure?: (status: number) => void } = {}): Promise<ManagedInfo | null> => {
      // An explicit reload wins over a slow mount restore.
      invalidateRestore();
      try {
        const res = await fetch("/v1/management-sessions");
        if (!mountedRef.current) return null;
        if (!res.ok) {
          opts.onFailure?.(res.status);
          if (!opts.silent) {
            if (res.status === 401) setCsrf(null);
            say(managementErrorKey("load", res.status, await readApiErrorCode(res)), res.status !== 401);
          }
          return null;
        }
        const json = (await res.json()) as ManagedInfo;
        if (!mountedRef.current) return null;
        applyServerInfo(json);
        return json;
      } catch {
        if (!opts.silent && mountedRef.current) say("error.network", true);
        return null;
      }
    },
    [applyServerInfo, invalidateRestore, say],
  );

  /**
   * Turn an opening response ({id, csrf_token} + cookie) into a loaded record.
   * Shared by pasted codes, picked recovery files and app handoffs. Resolves
   * "rejected" when the service refused the secret (announced with
   * `rejectedKey`) and "gone" when the record no longer exists. Once a new
   * session was minted, a failed load clears the previous record and CSRF: the
   * cookie no longer belongs to them.
   */
  const startSession = useCallback(
    async (open: Promise<Response>, rejectedKey: string, onAccepted?: () => void): Promise<ManagedInfo | "rejected" | "gone" | "failed"> => {
      const res = await open;
      if (!mountedRef.current) return "failed";
      if (!res.ok) {
        const key = managementErrorKey("open", res.status, await readApiErrorCode(res));
        say(key === "manage.badCode" ? rejectedKey : key, true);
        return res.status === 401 ? "rejected" : "failed";
      }
      const json = (await res.json()) as { id: string; csrf_token: string };
      if (!mountedRef.current) return "failed";
      setCsrf(json.csrf_token);
      onAccepted?.();
      const failure = { status: 0 };
      const current = await loadSession({ silent: true, onFailure: (status) => { failure.status = status; } });
      if (current) {
        say("manage.opened", false);
        return current;
      }
      if (!mountedRef.current) return "failed";
      setCsrf(null);
      setInfo(null);
      infoRef.current = null;
      const gone = failure.status === 404;
      say(gone ? "manage.alreadyDeleted" : "manage.openFailed", true);
      return gone ? "gone" : "failed";
    },
    [loadSession, say],
  );

  // On mount: an app handoff (`#handoff=<id>.<token>`) is taken and erased from
  // the address bar before any request, then redeemed once for an ordinary
  // session; it never edits or deletes anything. Once a handoff was attempted
  // on this page the cookie restore below never runs, including on a
  // StrictMode re-run, so it cannot race or overwrite the handoff.
  //
  // Otherwise restore a current cookie session after a page reload (read-only
  // until a fresh code provides editing permission again). A slow restore for
  // a previous cookie must not overwrite fresher explicit session work or
  // restore a cleared/deleted session. StrictMode-safe via guard.
  useEffect(() => {
    const handoff = takeHandoffFragment(window.location, window.history);
    if (handoff) handoffAttemptedRef.current = true;
    if (handoff === "invalid") {
      say("manage.handoffFailed", true);
    } else if (handoff) {
      setOperation("open");
      focusRecordRef.current = true;
      void (async () => {
        try {
          const opened = await startSession(
            fetch(`/v1/management-handoffs/${handoff.id}/redeem`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ handoff_token: handoff.token }),
            }),
            "manage.handoffFailed",
          );
          if (typeof opened !== "object") focusRecordRef.current = false;
        } catch {
          focusRecordRef.current = false;
          say("error.network", true);
        } finally {
          if (mountedRef.current) setOperation(null);
        }
      })();
    }
    if (handoffAttemptedRef.current) return;
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
        say("manage.restored", false);
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
  }, [applyServerInfo, say, startSession]);

  // After an app handoff, take the owner straight to the opened record.
  useEffect(() => {
    if (!info || !focusRecordRef.current) return;
    focusRecordRef.current = false;
    recordTitleRef.current?.scrollIntoView({ block: "start" });
    recordTitleRef.current?.focus({ preventScroll: true });
  }, [info]);

  /** Start an explicit operation, remembering the control that had focus before it is disabled. */
  const begin = (next: NonNullable<typeof operation>): void => {
    operationFocusRef.current = typeof document === "undefined" ? null : document.activeElement as HTMLElement | null;
    setOperation(next);
  };

  // Disabling the focused control drops focus to the page. When the operation
  // ends, give focus back to it, or to the nearest heading when it is gone or
  // stays unavailable (deleted record, saved draft).
  useEffect(() => {
    if (busy) return;
    const trigger = operationFocusRef.current;
    operationFocusRef.current = null;
    if (!trigger) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== trigger) return;
    const usable = trigger.isConnected && !trigger.matches(":disabled");
    (usable ? trigger : recordTitleRef.current ?? accessTitleRef.current)?.focus({ preventScroll: true });
  }, [busy]);

  const postRecovery = (recoveryCode: string): Promise<Response> => fetch("/v1/management-sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recovery_code: recoveryCode }),
  });

  /** Opening another record replaces the draft; renewing the same one keeps it. */
  const confirmSwitch = (submissionId: string | null): boolean =>
    !isDirty || !info || submissionId === null || submissionId === info.submission_id || window.confirm(t("manage.confirmSwitch"));

  const openSession = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    // An undecodable code is refused by the service without replacing anything.
    if (!confirmSwitch(submissionOf(code.trim()))) return;
    invalidateRestore();
    begin("open");
    say("", false);
    setCodeRejected(false);
    try {
      // The code has served its purpose: drop it immediately, never retain it.
      const opened = await startSession(postRecovery(code.trim()), "manage.badCode", () => setCode(""));
      if (opened === "rejected" && mountedRef.current) setCodeRejected(true);
    } catch {
      say("error.network", true);
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const updateFile = (key: string, change: Partial<RecoveryFileEntry>): void => {
    setFiles((prev) => prev.map((entry) => (entry.key === key ? { ...entry, ...change } : entry)));
  };

  const pickFiles = async (input: HTMLInputElement): Promise<void> => {
    const picked = Array.from(input.files ?? []);
    // Allow picking the same file again later; the list keeps what was read.
    input.value = "";
    if (busy || picked.length === 0) return;
    begin("read");
    try {
      const next = await readRecoveryFiles(picked, window.location.origin, files);
      if (mountedRef.current) setFiles(next);
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const openFile = async (entry: RecoveryFileEntry): Promise<void> => {
    if (busy || !entry.code) return;
    if (!confirmSwitch(entry.submissionId)) return;
    invalidateRestore();
    begin("open");
    say("", false);
    try {
      const opened = await startSession(postRecovery(entry.code), "manage.badCode");
      if (!mountedRef.current) return;
      if (typeof opened === "object") updateFile(entry.key, { publicId: opened.public_id });
      else if (opened === "rejected" || opened === "gone") updateFile(entry.key, { status: opened, code: null });
    } catch {
      say("error.network", true);
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const clearFiles = (): void => {
    if (busy) return;
    setFiles([]);
  };

  const saveDescription = async (): Promise<void> => {
    if (busy) return;
    if (!info) {
      say("manage.openFirst", true);
      return;
    }
    if (!csrf) {
      say("manage.freshEdit", true);
      return;
    }
    if (draftLength > DESCRIPTION_MAX_CODEPOINTS) {
      say("manage.tooLong", true, { count: draftLength, max: DESCRIPTION_MAX_CODEPOINTS });
      return;
    }
    begin("save");
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
          "manage.conflict",
          true,
        );
        return;
      }
      if (res.status === 410) {
        say("manage.deletedEdit", true);
        return;
      }
      if (res.status === 403) {
        say(managementErrorKey("save", res.status, await readApiErrorCode(res)), true);
        return;
      }
      if (!res.ok) {
        say(managementErrorKey("save", res.status, await readApiErrorCode(res)), true);
        return;
      }
      const saved = await res.json() as { revision: number };
      const acknowledged = { ...info, description_md: draft, revision: saved.revision };
      // A 401 error JSON must never become the managed record.
      const current = (await fetch("/v1/management-sessions").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as ManagedInfo | null;
      if (current && current.public_id === info.public_id && mountedRef.current) {
        setInfo(current);
        infoRef.current = current;
        setDraft(current.description_md);
        setIsDirty(false);
        dirtyRef.current = false;
      } else if (mountedRef.current) {
        setInfo(acknowledged);
        infoRef.current = acknowledged;
        setIsDirty(false);
        dirtyRef.current = false;
      }
      say("manage.updated", false);
    } catch {
      say("manage.saveNetwork", true);
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const remove = async (): Promise<void> => {
    if (busy) return;
    if (!info) return;
    if (!csrf) {
      say("manage.freshDelete", true);
      return;
    }
    if (!window.confirm(t("manage.confirmDelete"))) return;
    invalidateRestore();
    begin("delete");
    try {
      const res = await fetch(`/v1/benchmark-runs/${info.public_id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf },
      });
      if (!mountedRef.current) return;
      if (res.status === 204 || res.ok) {
        say("manage.deleted", false);
        const deletedSubmission = info.submission_id;
        setFiles((prev) => prev.filter((entry) => entry.submissionId !== deletedSubmission));
        setInfo(null);
        infoRef.current = null;
        setCsrf(null);
        setDraft("");
        setIsDirty(false);
        dirtyRef.current = false;
      } else if (res.status === 403) {
        say(managementErrorKey("delete", res.status, await readApiErrorCode(res)), true);
      } else if (res.status === 410) {
        say("manage.alreadyDeleted", true);
      } else {
        say(managementErrorKey("delete", res.status, await readApiErrorCode(res)), true);
      }
    } catch {
      say("manage.deleteNetwork", true);
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const signOut = async (): Promise<void> => {
    if (busy) return;
    if (isDirty && !window.confirm(t("manage.confirmClear"))) return;
    invalidateRestore();
    begin("clear");
    try {
      const res = await fetch("/v1/management-sessions", { method: "DELETE", headers: csrf ? { "x-csrf-token": csrf } : {} });
      if (!mountedRef.current) return;
      if (res.ok || res.status === 204) {
        setInfo(null);
        infoRef.current = null;
        setCsrf(null);
        setCode("");
        setCodeRejected(false);
        setFiles([]);
        setDraft("");
        setIsDirty(false);
        dirtyRef.current = false;
        say("manage.cleared", false);
      } else if (res.status === 403) {
        say(managementErrorKey("clear", res.status, await readApiErrorCode(res)), true);
      } else {
        say(managementErrorKey("clear", res.status, await readApiErrorCode(res)), true);
      }
    } catch {
      say("manage.clearNetwork", true);
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const onDraftChange = (value: string): void => {
    setDraft(value);
    const changed = value !== infoRef.current?.description_md;
    setIsDirty(changed);
    dirtyRef.current = changed;
  };

  const reload = async (): Promise<void> => {
    if (busy) return;
    begin("reload");
    say("");
    try {
      if (await loadSession()) say("manage.reloaded");
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const canEdit = canEditManagement(info !== null, csrf);
  const messageText = message ? t(message, Object.fromEntries(Object.entries(messageValues).map(([key, value]) => [key, number(value)]))) : "";
  const showSavedComparison = info !== null && isDirty && draft !== info.description_md;

  return (
    <div className="grid management-panel" aria-busy={busy}>
      <section className="card management-access" aria-labelledby="manage-title">
        <div className="management-intro">
        <h1 id="manage-title" ref={accessTitleRef} tabIndex={-1}>{t("manage.title")}</h1>
        <p className="muted">{t("manage.intro")}</p>
        </div>
        <div className="management-access-body">
        <div className="field">
          <label htmlFor="recovery-files">{t("manage.files")}</label>
          <input
            id="recovery-files" type="file" multiple accept=".txt,text/plain"
            disabled={busy}
            onChange={(e) => void pickFiles(e.target)}
            aria-describedby="recovery-files-hint"
          />
          <span id="recovery-files-hint" className="hint">{t("manage.filesHint")}</span>
        </div>
        {files.length > 0 ? (
          <div className="recovery-files">
            <ul>
              {files.map((entry) => {
                const current = info !== null && entry.code !== null && info.submission_id === entry.submissionId;
                return (
                  <li key={entry.key} aria-current={current ? "true" : undefined}>
                    <div>
                      <strong className="recovery-file-name">{entry.name}</strong>
                      <span className="hint">
                        {t("manage.fileSaved")} <LocalTime value={new Date(entry.savedAt).toJSON() ?? ""} />
                        {entry.submissionId ? <> · {t("manage.fileSubmission")} <code>{entry.submissionId.slice(0, 8)}</code></> : null}
                        {entry.publicId ? <> · {t("manage.publicId")} <a href={localizedPath(locale, `/benchmarks/${entry.publicId}`)}>{entry.publicId}</a></> : null}
                      </span>
                      <span className={entry.code ? "hint" : "hint error"}>{t(current ? "manage.fileCurrent" : `manage.fileStatus.${entry.status}`)}</span>
                    </div>
                    {entry.code ? (
                      <button type="button" data-action-glyph={current ? "refresh" : "open"} disabled={busy} aria-label={`${t(current ? "manage.fileRenew" : "manage.fileOpen")}: ${entry.name}`} onClick={() => void openFile(entry)}>
                        {t(current ? "manage.fileRenew" : "manage.fileOpen")}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <button type="button" data-action-glyph="clear" disabled={busy} onClick={clearFiles}>{t("manage.filesClear")}</button>
          </div>
        ) : null}
        <details className="recovery-paste">
        <summary>{t("manage.pasteTitle")}</summary>
        <form method="POST" action="/v1/management-sessions" onSubmit={(e) => void openSession(e)}>
          <div className="field">
            <label htmlFor="recovery-code">{t("manage.code")}</label>
            <textarea
              id="recovery-code" name="recovery_code" required autoComplete="off" autoCapitalize="none" spellCheck={false}
              placeholder="aiolm-recovery-v1.…"
              value={code} onChange={(e) => { setCode(e.target.value); setCodeRejected(false); }}
              disabled={busy}
              aria-describedby={codeRejected ? "recovery-hint manage-message" : "recovery-hint"}
              aria-invalid={codeRejected}
            />
            <span id="recovery-hint" className="hint">{t("manage.codeHint")}</span>
          </div>
          <button type="submit" className="primary" disabled={busy}>{operation === "open" ? t("manage.opening") : t("manage.open")}</button>
        </form>
        </details>
        {message && messageIsError ? <p id="manage-message" className="alert error" role="alert">{messageText}</p> : null}
        {/* Stays mounted so a status inserted later is still announced. */}
        <div role="status">{message && !messageIsError ? <p className={`alert ${message === "manage.noSession" ? "info" : "success"}`}>{messageText}</p> : null}</div>
        </div>
      </section>

      {info ? (
        <section className="card management-record" aria-labelledby="record-title">
          <h2 id="record-title" ref={recordTitleRef} tabIndex={-1}>{t("manage.record")} {info.hidden ? t("manage.hidden") : ""}</h2>
          <dl className="kv">
            <dt>{t("manage.publicId")}</dt><dd>{info.public_id}</dd>
            <dt>{t("manage.revision")}</dt><dd>{number(info.revision)}</dd>
            <dt>{t("manage.expires")}</dt><dd><LocalTime value={info.expires_at} /></dd>
          </dl>
          {!csrf ? (
            <p id="desc-read-only" role="status" className="muted">{t("manage.readOnly")}</p>
          ) : null}
          <div className="field">
            <label htmlFor="desc-draft">{t("manage.description", { max: number(DESCRIPTION_MAX_CODEPOINTS) })}</label>
            <textarea
              id="desc-draft" value={draft} onChange={(e) => onDraftChange(e.target.value)}
              disabled={busy}
              aria-describedby={csrf ? "desc-count" : "desc-count desc-read-only"}
              aria-invalid={draftLength > DESCRIPTION_MAX_CODEPOINTS}
            />
            {/* Not live: announcing the count on every keystroke drowns out typing. */}
            <span id="desc-count" className="hint">
              {t("manage.count", { count: number(draftLength), max: number(DESCRIPTION_MAX_CODEPOINTS) })}
              {draftLength > DESCRIPTION_MAX_CODEPOINTS ? t("manage.overLimit") : ""}
              {isDirty ? t("manage.unsaved") : ""}
            </span>
          </div>
          <h3>{t("manage.preview")}</h3>
          {draft ? <SafeMarkdown text={draft} /> : <p className="muted">{t("manage.empty")}</p>}
          {showSavedComparison ? (
            <div>
              <h3>{t("manage.savedVersion", { revision: number(info.revision) })}</h3>
              {info.description_md ? <SafeMarkdown text={info.description_md} /> : <p className="muted">{t("manage.savedEmpty")}</p>}
            </div>
          ) : null}
          <div className="management-actions">
            <button type="button" className="primary" disabled={busy || !canEdit || !isDirty || draftLength > DESCRIPTION_MAX_CODEPOINTS} onClick={() => void saveDescription()}>{t(operation === "save" ? "manage.saving" : "manage.save")}</button>{" "}
            <button type="button" data-action-glyph="refresh" disabled={busy} onClick={() => void reload()}>{t(operation === "reload" ? "manage.reloading" : "manage.reload")}</button>{" "}
            <button type="button" className="danger" data-action-glyph="delete" disabled={busy || !canEdit} onClick={() => void remove()}>{t(operation === "delete" ? "manage.deleting" : "manage.delete")}</button>{" "}
            <button type="button" data-action-glyph="sign-out" disabled={busy || !canEdit} onClick={() => void signOut()}>{t(operation === "clear" ? "manage.clearing" : "manage.clear")}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
