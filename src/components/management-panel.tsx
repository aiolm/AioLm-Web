"use client";

import "./management-usability.css";

import { useI18n } from "@/i18n/client";
import { intlLocales } from "@/i18n/config";

import { useCallback, useEffect, useRef, useState } from "react";
import { countCodePoints } from "@aiolm/benchmark-contracts";
import { DESCRIPTION_MAX_CODEPOINTS } from "@/lib/validation";
import { apiErrorKey, readApiErrorCode, SafeMarkdown } from "./ui";

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
  const [operation, setOperation] = useState<"open" | "save" | "reload" | "delete" | "clear" | null>(null);
  const busy = operation !== null;
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
    async (opts: { silent?: boolean } = {}): Promise<ManagedInfo | null> => {
      // An explicit reload wins over a slow mount restore.
      invalidateRestore();
      try {
        const res = await fetch("/v1/management-sessions");
        if (!mountedRef.current) return null;
        if (!res.ok) {
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
  }, [applyServerInfo, say]);

  const openSession = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    invalidateRestore();
    setOperation("open");
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
          managementErrorKey("open", res.status, await readApiErrorCode(res)),
          true,
        );
        return;
      }
      const json = (await res.json()) as { id: string; csrf_token: string };
      if (!mountedRef.current) return;
      setCsrf(json.csrf_token);
      // The code has served its purpose: drop it immediately, never retain it.
      setCode("");
      const current = await loadSession({ silent: true });
      if (current) {
        say("manage.opened", false);
      } else {
        setCsrf(null);
        say("manage.openFailed", true);
      }
    } catch {
      say("error.network", true);
    } finally {
      if (mountedRef.current) setOperation(null);
    }
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
    setOperation("save");
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
    setOperation("delete");
    try {
      const res = await fetch(`/v1/benchmark-runs/${info.public_id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf },
      });
      if (!mountedRef.current) return;
      if (res.status === 204 || res.ok) {
        say("manage.deleted", false);
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
    setOperation("clear");
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
    setOperation("reload");
    say("");
    try {
      if (await loadSession()) say("manage.reloaded");
    } finally {
      if (mountedRef.current) setOperation(null);
    }
  };

  const canEdit = canEditManagement(info !== null, csrf);
  const showSavedComparison = info !== null && isDirty && draft !== info.description_md;

  return (
    <div className="grid management-panel" aria-busy={busy}>
      <section className="card" aria-labelledby="manage-title">
        <h1 id="manage-title">{t("manage.title")}</h1>
        <p className="muted">{t("manage.intro")}</p>
        <form method="POST" action="/v1/management-sessions" onSubmit={(e) => void openSession(e)}>
          <div className="field">
            <label htmlFor="recovery-code">{t("manage.code")}</label>
            <textarea
              id="recovery-code" name="recovery_code" required autoComplete="off" autoCapitalize="none" spellCheck={false}
              placeholder="aiolm-recovery-v1.…"
              value={code} onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              aria-describedby="recovery-hint"
            />
            <span id="recovery-hint" className="hint">{t("manage.codeHint")}</span>
          </div>
          <button type="submit" className="primary" disabled={busy}>{operation === "open" ? t("manage.opening") : t("manage.open")}</button>
        </form>
        {message ? <p className={`alert ${messageIsError ? "error" : "info"}`} role={messageIsError ? "alert" : "status"}>{t(message, Object.fromEntries(Object.entries(messageValues).map(([key, value]) => [key, number(value)])))}</p> : null}
      </section>

      {info ? (
        <section className="card" aria-labelledby="record-title">
          <h2 id="record-title">{t("manage.record")} {info.hidden ? t("manage.hidden") : ""}</h2>
          <dl className="kv">
            <dt>{t("manage.publicId")}</dt><dd>{info.public_id}</dd>
            <dt>{t("manage.revision")}</dt><dd>{number(info.revision)}</dd>
            <dt>{t("manage.expires")}</dt><dd>{new Date(info.expires_at).toLocaleString(intlLocales[locale], { timeZone: "UTC", timeZoneName: "short" })}</dd>
          </dl>
          {!csrf ? (
            <p role="status" className="muted">{t("manage.readOnly")}</p>
          ) : null}
          <div className="field">
            <label htmlFor="desc-draft">{t("manage.description", { max: number(DESCRIPTION_MAX_CODEPOINTS) })}</label>
            <textarea
              id="desc-draft" value={draft} onChange={(e) => onDraftChange(e.target.value)}
              disabled={busy}
              aria-describedby="desc-count"
              aria-invalid={draftLength > DESCRIPTION_MAX_CODEPOINTS}
            />
            <span id="desc-count" className="hint" aria-live="polite">
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
            <button type="button" disabled={busy} onClick={() => void reload()}>{t(operation === "reload" ? "manage.reloading" : "manage.reload")}</button>{" "}
            <button type="button" className="danger" disabled={busy || !canEdit} onClick={() => void remove()}>{t(operation === "delete" ? "manage.deleting" : "manage.delete")}</button>{" "}
            <button type="button" disabled={busy || !canEdit} onClick={() => void signOut()}>{t(operation === "clear" ? "manage.clearing" : "manage.clear")}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
