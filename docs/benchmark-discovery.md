# Benchmark discovery

The website extends the shared publication API with discovery queries. Publication,
ownership, verification, deletion, and measurement-row protocols remain unchanged.
Run the numbered SQL migrations through 016 before deploying this code.
The readiness probe checks that every required migration is present.

## Single serving method

Public benchmark data has one method: `openai-chat-serving@5` with
`schema_version: 4`. Migration 016 deletes retired schema1/2 and serving @1–@4
records, their measurement chunks, pending upload sessions and reports rather
than keeping unreadable history; quota buckets and the audit log stay. There is
no `measurement` scope parameter: list, detail, options and comparison always
read the single method.

Each run launches and readies the model normally, then measures without workload
warmup. A run nonce and point/slot-specific request prefixes isolate user prompt
inputs. Every row records one unique `input_sha256_by_request` entry per
dispatched request; the first row of each input size carries that input
descriptor's recorded hash. `cache_policy: "cold_prompt"` records the requested
policy, not a verified-empty engine cache or a cold-start claim. The method
defines the work; it does not certify that an attached engine actually began
with an empty cache.

## List endpoint

`GET /v1/benchmark-runs` retains `{items,next_cursor}`, with 25 items by default
and a maximum of 100. A cursor binds the discovery meaning
`single-serving-method-v1`, every canonical filter condition and the sort. Old,
changed-filter or otherwise mismatched cursors return 400, and clients recover
by requesting the first page. Missing values sort last, with creation time and
public ID as deterministic tie-breakers.

The browser keeps applied conditions and ordering in the page URL. Search stays
first and detailed conditions start closed. Search text is limited to 120
trimmed Unicode code points: an overlong query disables submission and explains
that length limit in the selected locale, without truncating or resetting the
input.

### Identity and workload filters

Engine names are editable, data-driven `runtime` values, including newly
connected engines. Null identity remains visible without a filter. Core version,
variant, build, plugin version and app version have independent filters. Model
format (`unknown` included), full SHA-256, repository and revision are recorded
facts; `q` and `model_query` also search the full SHA/source identity. Weight
bits come only from declared GGUF weight metadata, not names or runtime/KV
settings.

Scalar metadata is defined once in browser-safe `FILTER_DEFINITIONS`. The same
definitions drive parsing and explorer controls; selecting one engine never
clears generic conditions or disables another engine's fields.

`weight_bits` is an exact selection, not a substring or range. Its basic UI
offers only confirmed families present under the other filters, numerically
ordered; the `quantization` text filter remains under advanced model options.
Classification uses only declared GGUF encoding codes and known `llama_ftype`
values (`general.file_type`, not tensor `ggml_type`). The shared mapping is in
`src/lib/weight-encodings.json`; migration014 adds an immutable SQL equivalent
and an expression index. Known but conflicting metadata, guessed file types,
unknown codes, IQ1 and ternary TQ formats, and method-only AWQ/GPTQ labels
remain unclassified. Names, filenames, repository identifiers, model sizes and
KV-cache types never supply a bit value. Unclassified runs stay in unfiltered
lists and are excluded only when a bit filter is selected. Bit families describe
the representative declared encoding, not uniform tensor precision, average
storage bits/weight or model quality.

### Recorded facts and missing information

`setup.host_gpus` preserves the installed AioLM-host inventory, including each
device's nullable memory, driver and integrated flag. `null` means the host
environment was unavailable; `[]` is a recorded empty inventory.
`setup.execution_selection_complete` preserves the selection-record flag,
including `false`. Neither inventory nor a requested GPU-layer count proves that
a device was selected or that model layers ran there.

`gpus`, `vendors`, `vram_mb`, GPU/vendor filters and VRAM sorts remain
selected-execution-only. General `q` search also covers installed host GPU
names/vendors. A missing hardware label may fall back to an explicitly labelled
`Host CPU: …`; this names the host CPU, not a CPU-only execution. Summaries are
stored once at acceptance and returned unchanged; discovery does not reproject
old summaries at read time.

Execution values come from `setup.settings`, the submitted `RecordedSetting[]`
array. Target, exact scope, name, unit and role remain part of descriptor
identity. Compact displays keep the full descriptor and show declared semantic
roles separately; no common role or submitted unit is not a missing setting
value. Client concurrency, server concurrency capacity and the three
context-allocation roles remain different facts.

Integrated GPUs with no memory figure are not assigned system RAM as VRAM.
Runtime backend/variant/plugin fields without evidence remain unrecorded; a null
field does not declare that it is inapplicable to that engine. Known model
metadata is retained independently of missing checksum/source/quantizer
information.

When usage was not requested, absent reported token counters are identified as
such. Missing and invalid usage responses remain distinct in individual
measurements. Zero observed output bytes stay zero; a row with no output has no
first-event latency. Memory follows the recorded owned process scope. No absent
metric becomes zero or an estimated token rate.

### Later Hugging Face model information

`GET /v1/benchmark-runs/{public_id}/model-information` returns a separate
catalog view. It never updates `benchmark`, `summary.model_info`, recorded
source/revision, measurement rows or the publication's revision/body checksum.
Existing source/owner/base-model filters still query the recorded submission,
not later model-card text.

The lookup uses the recorded full SHA-256 and exact byte size. A recorded
repository or model metadata name is only a candidate-discovery hint. A name,
file name, repository commit, Git blob id or aggregate repository size is not
file-identity proof. Every returned artifact must have the same LFS SHA-256
and byte size in metadata fetched at a fixed repository revision.

The response contains `status`, `reason`, `match_basis`, `sha256`,
`size_bytes`, `checked_at` and `matches`. Status is `matched`, `unidentified`,
`not_found` or `unavailable`; an unidentified record explains missing checksum,
size or discovery hint. `checked_at` is lookup time, not measurement or download
time. A record without its own hash is not repaired with a current local file
hash; the interface can instead offer a clearly unverified model-name search.

Each match independently names its repository, pinned revision, artifact,
repository namespace owner, model-card base models/licenses and an explicitly
declared quantizer when present. Fixed-domain, revision-pinned links expose
the evidence. Multiple matching repositories remain separate sources: neither
the first result nor its namespace becomes the original download source,
author or quantizer. A matching file does not verify benchmark execution,
hardware or performance. Card declarations are not independent provenance
attestations.

Only public Hugging Face JSON metadata is fetched, without credentials,
redirects or weight downloads. Scans are limited to eight candidate repositories,
4,096 files per repository, 64 returned matches, 2 MiB per response and eight
seconds, with four concurrent upstream requests. The per-instance public cache
holds 128 results and at most 16 single-flight lookups; successful matches live
one day, bounded no-match results 15 minutes and upstream failures 15 seconds.
A partial scan keeps verified matches but uses the 15-second failure lifetime,
so a recovered candidate is not hidden for a day. No-match means no match found
within this bounded lookup, not absence from the whole Hub.

Every endpoint read rechecks publication visibility before using that cache.
Missing/deleted/hidden runs return 404, database outages return retryable 503,
and an upstream failure is represented as `unavailable` in a successful DTO.
Responses use `no-store` so caching never bypasses moderation.

List, detail and comparison load this information independently of measurements.
Their shared browser queue admits at most four active catalog fetches. Queued
requests for removed rows are cancelled before dispatch; already-started bodies
finish before releasing their slot, and stale replies do not replace current
state. Repository/file/base-model/license information is visible when matched;
raw proof details remain initially closed. Loading or unavailable HF data never
blocks the benchmark results, and all four locales retain the search-first
layout. Numeric ranges wrap at desktop and narrow widths, including text zoom,
rather than overlapping adjacent values or shrinking the shared type scale.

## Configured workload ranges

| Range key (`_min` / `_max`) | Recorded meaning |
| --- | --- |
| `input_bytes` | Maximum configured `workload.inputs[].bytes`, not the largest completed point |
| `max_output_tokens` | Requested output-token cap, 1–128 |
| `max_concurrency` | Maximum configured client concurrency |
| `repetitions` | Configured repetitions |
| `model_size` | Recorded weight size in bytes |
| `ram` | AioLM-host system RAM in bytes |
| `physical_cores` / `cores` | Physical / logical host CPU cores |
| `vram` | Selected GPU capacity in MiB |

`warmup` and `request_usage` accept 0/1. Accepted @5 workloads always record
`warmup: false`, so `warmup=1` matches nothing. Missing metadata is not false or
zero. For configured inputs 4096/16384, `input_bytes_max=8192` does not match,
even if only the 4096 point was completed in a local partial record.

### Serving points and sorting

Supply all of `point_bytes`, `point_concurrency`, `point_max_tokens`, or none.
`point_only=1` requires all three. Facet point IDs are `b4096/c4/o128`. Output
tokens are part of point identity; bytes are never treated as prompt tokens.
`point_bytes` must be 256–1,048,576, `point_concurrency` 1–64 and
`point_max_tokens` 1–128. Range filters on `max_output_tokens` stay broad and
inclusive.

Serving sorts are `newest`, `oldest`, `input_bytes_asc`, `input_bytes_desc`,
`vram_asc`, `vram_desc`, `token_rate_desc`, `output_rate_desc` and
`duration_asc`. The three point sorts require the complete point triple and read
its median `reported_tokens_per_second`, `output_bytes_per_second` or `e2e_ms`.
Input sorts read the maximum configured input, exactly like its range filters
and cursor values. They do not rank independent hardware/engine quality or
average across different workloads.

`summary.serving_points` uses the shared package's eight metric keys and
`{median,min,max,samples}` statistics: `first_output_ms`,
`prefill_tokens_per_second`, `decode_tokens_per_second`, `tpot_ms`,
`reported_tokens_per_second`, `output_bytes_per_second`, `e2e_ms` and
`peak_memory_bytes`. Unknown observations are excluded per metric, not replaced
by zero. Zero duration or non-finite derived rates remain null; positive-duration
zero output has a known zero byte rate. Token metrics depend on engine-reported
usage and stay null without evidence. There is no legacy `summary.points`
projection.

No index backs the point sorts. They read one entry out of a small JSON array per
row, which no expression index covers without pinning the selected point into the
index definition, so ordering by a point is a scan of the visible rows. When that
stops being fast enough, the points belong in their own table with
`(input_bytes, concurrency, max_output_tokens)` indexed and the list query
joining it laterally; nothing about the stored shape or the query parameters has
to change for readers.

### Typed execution-option conditions

Repeat `setting` at most eight times. Each is strict JSON, at most 1024 UTF-8
bytes, and the complete encoded query is limited to 8192 bytes:

```ts
type Descriptor = {
  target: 'launch' | 'request'; scope: string[]; name: string;
  unit: RecordedSetting['unit']; role: RecordedSetting['role'];
};
type Condition =
  | (Descriptor & { op: 'eq'; value: boolean | number | string | number[] })
  | (Descriptor & { op: 'range'; min?: number; max?: number });
```

Nullable unit/role are required, unknown keys are rejected, numbers must be
finite, and range requires a bound with minimum no greater than maximum.
Descriptor/value bounds match recorded settings. Null settings never satisfy a
condition. Conditions are AND-ed, canonical duplicates collapse, and reordered
conditions bind the same cursor.

Equality requires one actual setting with exactly the same target, scope,
name, unit, role and value. Scope `[]` is not `["serve"]`; numeric array `[1,2]`
is not `[2,1]`. SQL uses the settings GIN containment prefilter and then exact
same-element equality. Ranges inspect numeric scalar values only. User keys
are bound data, never SQL identifiers. Arbitrary numeric-option ranges and all
point sorts are not claimed to be index-backed.

The GUI offers equality/range and string/number/boolean/numeric-list controls;
users need not write JSON. Incomplete drafts block Apply with an actionable
condition error. Each condition/chip can be cleared independently.

### Generic facets

`field=setting` returns canonical fixed-order descriptor JSON strings.
`field=setting_value` requires strict `option_setting` descriptor JSON and
returns typed scalar/array values as canonical JSON strings. Both retain
`{options:[{value,count}],has_more}`, distinct visible-run counts, C-order,
30 options and a 31st-candidate `has_more` check. Null or unapplicable overlimit
values are not recommendations.

When editing a condition, the client excludes only that one row from facet
requests; other conditions, including the same descriptor, remain. The server
does not implicitly remove generic conditions. Scalar own-field exclusion
retains its existing behavior.

Suggestion requests pause while remaining draft conditions are incomplete;
private `_draft` editor state is never sent as a setting condition. The whole
query bound includes cursor and facet metadata. If a next-page or suggestion
request would exceed it, the client keeps the current results/conditions and
asks the user to shorten them rather than dropping conditions or looping back
to the first page.

Acceptance computes a bounded `setup.setting_facets` canonical-text projection
alongside the actual settings. This preserves JavaScript number serialization,
array order and string whitespace for database-side C-order/limits without
fetching unbounded distinct values into server memory. Matching still inspects
the actual settings. No public payload or frozen request bytes are rewritten.

### Searchable suggestions

`GET /v1/benchmark-runs/options` accepts `field` (one text filter other than `q`,
`model_query` included, or `point`), optional `option_query` (literal search
within that field), and the other list filters. It returns
`{ options: [{ value, count }], has_more }`. At most 30 options are returned;
typing searches all matching records before the limit is applied. Counts
represent distinct visible runs. Hidden and deleted records never contribute.

`field=point` expands the operating points the visible results measured. Each
value is `b<bytes>/c<concurrency>/o<max_tokens>`, ordered by what they measure
rather than by how the tuple spells out. The basis point and `point_only` are
excluded from their own suggestions, so the list offers every point the other
conditions still allow instead of collapsing to the one already chosen.

`field=model_query` suggests only model values: each run contributes its label,
name, repository, artifact, and hash, and a value that repeats within a run
counts that run once. Hardware, runtime, and status text is never suggested. A
value longer than the 120-character filter limit is not offered, because
choosing it would be rejected. Every suggestion matches `model_query` again once
selected.

The field being edited is excluded from its own filter constraints, while other
conditions still narrow its candidates. Selecting a GPU vendor narrows GPU names
to that vendor's selected devices, including within a run with mixed GPU vendors.
The UI fetches suggestions only for the open control, debounces typing, and
aborts superseded requests. Empty or unavailable suggestions never prevent
free-text search.

### Canonical storage and attribution

`summary.identity` is the pure 13-field payload projection also exposed as
stored generated columns by migration015. It never parses display labels.
The migration adds visibility-partial method/size/trigram and bounded-settings
indexes, changes no runtime grants, and performs no data deletion or manual
backfill. Tombstoning `benchmark` nulls all generated identity columns.
Engine-name and variant substring searches are not promised to be index-backed;
the fixed trigram set remains the seven columns specified by this migration.

Migration016 retires the other record formats: it deletes their runs,
measurement chunks, pending upload sessions and reports, then drops indexes over
summary fields no current summary carries (legacy throughput/duration means,
llama.cpp launch settings and the configured token input length). Quota buckets
and the audit log are preserved. No current record is rewritten.

Schema4 host hardware is scoped `aiolm_host`; attached/unknown compute has
unavailable engine memory, never proxy RSS. Detail and comparison views show the
method, exact input hashes/bytes, requested output cap, corpus, warmup and usage
differences. Repository/revision is provenance, not a content digest or proof of
unchanged weights. Existing receipts, hashes, chunking and management flows are
unchanged.

## Beginner-first explorer controls

The explorer is a single-column, search-first page at every width. Its primary
search writes the existing broad `q` condition: model, engine and hardware text
can be searched without learning the detailed field names. Search submits the
complete draft, not just the visible search input.

**More filters** opens an inline panel containing the existing Model, Inference
engine, Hardware and Measurement groups. Execution-option conditions have their
own nested disclosure. This panel starts closed even for shared links; applied
conditions remain visible as removable chips, and the toggle counts detailed
scalar constraints plus typed setting conditions, excluding `q`, ordering and the
point-only toggle, which belongs to the separate result controls.
No filter or query parameter is removed by the simplified presentation.

The detailed panel stays mounted when closed. Its editable values, typed
`false` and numeric arrays, and hidden `setting` and point inputs remain in the
same form. Closing it neither submits nor discards edits. A visible status line
reports unapplied changes; incomplete or over-length drafts block Search even
when the panel is closed. The panel's Apply action submits the same whole draft.
Applying detailed conditions closes the panel and focuses the results heading
on desktop and mobile. Clear resets the view and pagination, keeps hand-picked
comparison selections, and returns keyboard focus to Search.

All matching rules remain canonical: `q` is broad, `model_query` searches model
metadata, `model` reads the model label, and engine identity and typed settings
retain their existing exact constraints. Changing an engine does not remove
other conditions. Generic setting conditions apply to every result; no scope
selector is needed because every accepted result uses the same method.

Sorting remains beside the results and applies immediately without submitting
unfinished filter edits. Ordering is not a narrowing filter, does not become a
filter chip, and does not turn a truly empty view into a filtered-empty message.
Point-ranked orders still require a complete measured point.

**Match measurement conditions** is a separate, collapsed result-control
disclosure. Its summary always names the current point or explains that each
result uses its own measured conditions. Point selection and `point_only` apply
immediately and reset pagination. The point is the whole
bytes/concurrency/cap tuple. Clearing a point also clears `point_only` and
point-ranked sorting. Hidden form fields preserve the tuple during filter
submission; point halves never become separate chips. These controls are omitted
only from a truly empty default view, not a view with an explicitly selected
point or order. Refresh stays beside the results heading, including on an empty
view; it does not submit pending edits.

Result rows lead with the model link, recorded host hardware and engine,
first-output time, output speed in B/s, and the exact measured conditions.
Medians, non-degenerate ranges and differing observed sample counts remain
visible; single-sample values are not repeated as identical min/max ranges.
Unknown values remain unknown, never zero. Hardware describes the AioLM host,
not necessarily an attached service's compute host. Full identity, inputs and
hashes, settings, memory scope, all metric statistics and registration time are
available on the existing result-detail page. Narrow layouts use labeled cards
without shrinking the shared typography.

A truly empty view explains that measurement happens in the desktop app and
links to the localized measuring/sharing guide. A filtered-empty view offers a
way to clear conditions. Neither state invents examples or a global result
count. API errors retain the existing retry behavior.

URL sharing, browser back/forward, keyset paging, free-text suggestions,
locale-preserving result links and the bounded comparison basket retain their
existing behavior. A shared cursor without local back-stack still offers First
page. Disclosure state is presentation only, never a query parameter.


Published measurement policy: new submissions must be complete, non-empty, and contain no failed rows. Local diagnostic records remain local. System RAM is an optional measurement-time capacity in environment.system_memory_bytes and summary.setup.ram_bytes; it is not GPU VRAM or peak process memory. Model display names may omit encoding suffixes, but weight encoding always comes from model metadata, never from the display label.
