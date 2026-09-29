# Management handoff and recovery files

Owners open a management session for one published result in one of three
ways. All three end in the same 30-minute, result-scoped session: an HttpOnly,
`SameSite=Strict` cookie plus a CSRF token held only in page memory. Edits and
deletion still need an explicit action on the page.

1. **Backup (recovery) files.** `/manage` accepts one or more `aiolm-recovery-<submission_id>.txt`
   files. The page validates them in the browser (size ≤ 4096 bytes, the
   `aiolm-recovery-v1.` format, this service's origin, duplicates) before any
   request, so a bad file never consumes the invalid-attempt budget. Valid
   files are listed by file name, file time and a short submission id. Opening
   one sends its code once to `POST /v1/management-sessions`. Codes stay in page
   memory only: never in the URL, cookies, or Web Storage. They are dropped
   when the page unloads, when the list is cleared, or when the session is cleared.
2. **Pasted recovery code.** Kept as a fallback for a single code.
3. **App handoff.** Documented below. The desktop app hands over a single-use
   ticket, and the owner secret never reaches the browser.

## App handoff contract

This is a website extension. It is not part of `@aiolm/benchmark-contracts`.

### Issue: `POST /v1/management-handoffs`

- Headers: `Authorization: Bearer <owner secret>` (the same 32-byte base64url
  secret used for owner edit/delete), `Content-Type: application/json`. No
  Origin header or cookie is needed.
- Body: `{"submission_id": "<uuid v4>"}`.
- `201`, `Cache-Control: no-store`:
  `{"handoff_id": "<uuid v4>", "handoff_token": "<43-char base64url>", "expires_at": "<ISO>"}`.
  The ticket lives 2 minutes and works once.
- Errors use `{error:{code,message}}`:
  - `400 invalid_request`: malformed body or `submission_id`.
  - `401 ownership_missing`: unknown submission, missing or wrong secret. These cases are indistinguishable.
  - `410 submission_deleted`: the result has been deleted.
  - `413 payload_too_large`: the body is too large.
  - `429 rate_limited` + `Retry-After`: see limits below.
  - `503 service_unavailable` + `Retry-After`: the store is unreachable, or abuse protection or the management signing key is unavailable (fails closed).

### Open the browser

Open `<SERVICE_ORIGIN>/manage#handoff=<handoff_id>.<handoff_token>`. It must be
the fragment, never a query string. Fragments are not sent to the server or in
`Referer`, and the locale redirect keeps them. The page reads the fragment and
erases it with `history.replaceState` before making any request.

### Redeem: `POST /v1/management-handoffs/<handoff_id>/redeem`

The page sends this; the app never does.

- Requires `Origin` to equal `SERVICE_ORIGIN` exactly; otherwise it answers `403 invalid_csrf`.
- Body: `{"handoff_token": "<token>"}`.
- The ticket is consumed and a session is created in one transaction. The
  response is the same as `POST /v1/management-sessions`:
  `{"id", "csrf_token"}` plus the session cookie.
- Unknown, used, expired, or mismatched tickets all answer
  `401 ownership_missing`. The page then tells the owner to reopen management
  from the app or to choose a backup file.
- A correct ticket whose result was deleted after issue answers
  `410 submission_deleted`. The ticket is consumed and no session is created.
  Redemption takes the same per-submission lock as deletion, so the two never
  interleave.
- The page redeems at most once per page load. The fragment is erased before
  the first request, and the cookie-session restore is skipped once a handoff
  was attempted (React StrictMode re-runs included).

### Limits

- Failed issue or redeem attempts share the `invalid-manage` budget with
  recovery codes (`QUOTA_INVALID_MANAGE_PER_MIN_IP`, default 10/min/IP).
- Successful issuance has its own per-IP budget, which uses the
  `QUOTA_SESSION_CREATE_PER_MIN_IP` limit (default 5/min).

### Storage

A ticket is a `bench.management_sessions` row with a 2-minute expiry whose hash
is `sha256("handoff-v1|" + token)`. It is domain-separated from CSRF hashes
(`csrf-v1|`), and no cookie is ever issued for a ticket id, so a ticket cannot
act as a session. Redemption and result deletion revoke the row. Retention
removes it with the other management sessions.

### Rollout

No migration is needed: `REQUIRED_MIGRATIONS`, grants, readiness and the
pg_cron retention job are unchanged. Deploy the website **before** a desktop
build that calls `POST /v1/management-handoffs`. An older website answers that
route with `404`. The desktop app then opens nothing and says the website needs
an update; it does not fall back automatically, because an older website has
neither the handoff nor the backup-file picker.
