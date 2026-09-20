-- Benchmark website schema. Private `bench` schema; the app never exposes it
-- via a Data API. Roles: migration owner, runtime (least privilege), moderation.
-- Apply with `npm run db:migrate` (uses DATABASE_MIGRATION_URL).

create schema if not exists bench;

-- Public benchmark runs. Deleted rows become minimal tombstones: payload
-- columns are nulled but submission/public/owner/body-hash anchors survive.
create table if not exists bench.benchmark_runs (
  submission_id uuid primary key,
  public_id text not null unique,
  owner_hash text not null,
  body_sha256 text not null,
  benchmark jsonb,
  description_md text not null default '',
  revision integer not null default 1,
  hidden boolean not null default false,
  deleted boolean not null default false,
  summary jsonb,
  byte_size integer not null default 0,
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benchmark_runs_revision_positive check (revision >= 1),
  constraint benchmark_runs_body_sha_format check (body_sha256 ~ '^[a-f0-9]{64}$')
);
create index if not exists benchmark_runs_created_idx on bench.benchmark_runs (created_at desc, public_id desc);
create index if not exists benchmark_runs_hidden_deleted_idx on bench.benchmark_runs (hidden, deleted);

-- Payload rows stored separately in 1000-row JSONB chunks.
create table if not exists bench.benchmark_chunks (
  submission_id uuid not null references bench.benchmark_runs (submission_id) on delete cascade,
  chunk_index integer not null,
  rows jsonb not null,
  primary key (submission_id, chunk_index)
);

-- Upload (Turnstile) sessions: pending 5min, bound to submission/body/owner.
create table if not exists bench.upload_sessions (
  session_id uuid primary key,
  submission_id uuid not null,
  body_sha256 text not null,
  owner_hash text not null,
  status text not null default 'pending' constraint upload_sessions_status check (status in ('pending','verified','expired')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  permit_consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists upload_sessions_submission_idx on bench.upload_sessions (submission_id);

-- Management sessions: result-scoped 30min cookie sessions + CSRF token hash.
create table if not exists bench.management_sessions (
  id uuid primary key,
  submission_id uuid not null references bench.benchmark_runs (submission_id) on delete cascade,
  csrf_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists management_sessions_submission_idx on bench.management_sessions (submission_id);

-- User reports for moderation triage.
create table if not exists bench.reports (
  id uuid primary key,
  target_submission_id uuid not null,
  reason text not null,
  reporter_ip_hmac text,
  created_at timestamptz not null default now(),
  constraint reports_reason_bound check (char_length(reason) <= 2000)
);
create index if not exists reports_target_idx on bench.reports (target_submission_id);

-- Quota buckets keyed by HMAC(ip); raw IPs are never persisted. Pruned after 24h.
create table if not exists bench.quota_buckets (
  key text primary key,
  count integer not null default 0,
  bytes bigint not null default 0,
  rows bigint not null default 0,
  window_start timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Moderation audit trail.
create table if not exists bench.audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  target text,
  reason text,
  created_at timestamptz not null default now()
);
