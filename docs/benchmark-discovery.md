# Benchmark discovery

The website extends the shared publication API with discovery queries. Publication,
ownership, verification, deletion, and measurement-row protocols remain unchanged.
Run the numbered SQL migrations through 015 before deploying this code.
The readiness probe checks that every required migration is present.

## Common API serving queries

`measurement=openai-chat-serving@1` is the default list scope. It selects only
schema3 and the exact method/version, not a list of supported engine names.
`measurement=legacy` explicitly selects schema1/2, including null old methods.
Byte parameters and legacy token parameters cannot be mixed; invalid combinations
return 400 rather than silently reinterpreting units.

The list endpoint retains `{items,next_cursor}`, with 25 items by default and a
maximum of 100. Cursor binding includes `engine-neutral-serving-v1`, method scope,
canonical conditions and sort. Old, changed-filter or changed-scope cursors return
400; clients recover by requesting the first page. Missing values sort last,
with creation time/public ID as deterministic tie-breakers.

### Identity and workload filters

Engine names are editable, data-driven `runtime` values, including newly connected
engines. Null identity remains visible without a filter. Core version, variant,
build, plugin version and app version have independent filters. Model format
(`unknown` included), full SHA-256, repository and revision are recorded facts;
`q` and `model_query` also search the full SHA/source identity. Weight bits come
only from declared GGUF weight metadata, not names or runtime/KV settings.

Scalar metadata is defined once in browser-safe `FILTER_DEFINITIONS`. The same
definitions drive parsing and explorer controls; engine selection never clears
generic conditions or disables another engine's fields.

### Recorded facts and missing information

`setup.host_gpus` preserves the installed AioLM-host inventory, including each
device's nullable memory, driver and integrated flag. `null` means the host
environment was unavailable; `[]` is a recorded empty inventory.
`setup.execution_selection_complete` preserves the selection-record flag,
including `false`. Neither inventory nor a requested GPU-layer count proves
that a device was selected or that model layers ran there.

The existing `gpus`, `vendors`, `vram_mb`, GPU/vendor filters and VRAM sorts
remain selected-execution-only. General `q` search also covers installed host
GPU names/vendors. A missing hardware label may fall back to an explicitly
labelled `Host CPU: …`; this names the host CPU, not a CPU-only execution.
List/detail reads enrich older summaries from their own stored benchmark
metadata. They never rewrite payloads, revisions, checksums or measurements.

Serving execution values come from `setup.settings`, not the intentionally
null legacy context/parallel/cache convenience fields. Target, exact scope,
name, unit and role remain part of descriptor identity. Compact displays keep
the full descriptor and show declared semantic roles separately; no common
role or submitted unit is not a missing setting value. Client concurrency,
server concurrency capacity and the three context-allocation roles remain
different facts.

Integrated GPUs with no memory figure are not assigned system RAM as VRAM.
Runtime backend/variant/plugin fields without evidence remain unrecorded;
a null field does not declare that it is inapplicable to that engine. Known
model metadata is retained independently of missing checksum/source/quantizer
information. Newly collected model hashes apply only to new runs, never to
historical results.

When usage was not requested, absent reported token/cache counters are
identified as such. Missing and invalid usage responses remain distinct in
individual measurements. Zero observed channel bytes stay zero; a channel
with no output has no first-event latency. Memory follows the recorded owned
process scope. No absent metric becomes zero or an estimated token rate.

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
holds 128 results and at most 16 single-flight lookups; matches live one day,
bounded no-match results 15 minutes and upstream failures 15 seconds. No-match
means no match found within this bounded lookup, not absence from the whole Hub.

Every endpoint read rechecks publication visibility before using that cache.
Missing/deleted/hidden runs return 404, database outages return retryable 503,
and an upstream failure is represented as `unavailable` in a successful DTO.
Responses use `no-store` so caching never bypasses moderation.

List, detail and comparison load this information independently of measurements.
Repository/file/base-model/license information is visible when matched; raw
proof details remain initially closed. Loading or unavailable HF data never
blocks the benchmark results, and all four locales retain the search-first
layout and text-zoom wrapping.



| Range key (`_min` / `_max`) | Recorded meaning |
| --- | --- |
| `input_bytes` | Maximum configured `workload.inputs[].bytes`, not the largest completed point |
| `max_output_tokens` | Requested output-token cap |
| `max_concurrency` | Maximum configured client concurrency |
| `repetitions` | Configured repetitions |
| `model_size` | Recorded weight size in bytes |
| `ram` | AioLM-host system RAM in bytes |
| `physical_cores` / `cores` | Physical / logical host CPU cores |
| `vram` | Selected GPU capacity in MiB |

`warmup` and `request_usage` accept 0/1. Missing metadata is not false or zero.
For configured inputs 4096/16384, `input_bytes_max=8192` does not match, even if
only the 4096 point was completed in a local partial record.
Warmup and repetitions are read from the recorded workload in both stores,
including legacy summaries that predate those setup projection keys; no
summary backfill is required.

### Serving points and sorting

Supply all of `point_bytes`, `point_concurrency`, `point_max_tokens`, or none.
`point_only=1` requires all three. Facet point IDs are `b4096/c4/o128`.
The cap is part of point identity; bytes are never treated as prompt tokens.

Serving sorts are `newest`, `oldest`, `input_bytes_asc`, `input_bytes_desc`,
`vram_asc`, `vram_desc`, `output_rate_desc`, and `duration_asc`. The last two
require the complete point triple and read its median `output_bytes_per_second`
or `e2e_ms`. Input sorts read the maximum configured input, exactly like its
range filters and cursor values. They do not rank independent hardware/engine
quality or average across different workloads.

`summary.serving_points` uses the shared package's 13 metric keys and
`{median,min,max,samples}` statistics. Unknown observations are excluded per
metric, not replaced by zero. Zero duration or non-finite derived rates remain
null; positive-duration zero output has a known zero byte rate. Legacy points
remain exclusively in `summary.points`.

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
name, unit, role and value. Scope `[]` is not `[\"serve\"]`; numeric array `[1,2]`
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

### Canonical storage and attribution

`summary.identity` is the pure 13-field payload projection also exposed as
stored generated columns by migration015. It never parses display labels.
The migration adds visibility-partial method/size/trigram and bounded-settings
indexes, changes no runtime grants, and performs no data deletion or manual
backfill. Tombstoning `benchmark` nulls all generated identity columns.
Engine-name and variant substring searches are not promised to be index-backed;
the fixed trigram set remains the seven columns specified by this migration.

Schema3 host hardware is scoped `aiolm_host`; attached/unknown compute has
unavailable engine memory, never proxy RSS. Detail/comparison views show method,
exact input hashes/bytes, cap, corpus, warmup and usage-request differences.
Repository/revision is provenance, not a content digest or proof of unchanged
weights. Existing receipts, hashes, chunking and management flows are unchanged.

## Legacy token-method reference

The sections below describe only `measurement=legacy` and unchanged schema1/2.
Their token, TTFT, PP/TG and context semantics are not serving-byte parameters.

### List queries

GET /v1/benchmark-runs returns the existing items/next_cursor envelope. Pages default
to 25 items and are capped at 100. Each item includes a small public summary; full
benchmark metadata and measurement rows are not loaded by the explorer.

| Query | Meaning |
| --- | --- |
| q | Search public labels, hardware, OS, runtime, settings, status, and precise model identifiers |
| model, hardware, method, workload | Existing summary label filters |
| model_query | Narrow model search: the model label, name, repository, artifact, and hash; never hardware, runtime, or status |
| publisher, quantization, base_model | Model publisher, weight quantization, and upstream model IDs |
| weight_bits | Exact nominal weight-bit family: 1, 2, 3, 4, 5, 6, 8, 16 or 32 |
| vendor, gpu, cpu | Selected GPU vendor/model and CPU name |
| os, arch, runtime, backend, mode | Environment and runtime filters |
| flash_attention, cache_type_k, cache_type_v, split_mode | Recorded execution settings |
| point_tokens, point_concurrency | The operating point every result is read and ranked at; given together or not at all |
| point_only | 1 to list only the results that measured that point; requires the pair above |
| context_min, context_max | Largest input length the result was configured to send, in tokens |
| vram_min, vram_max | Total known selected GPU memory in MiB |
| cores_min, cores_max | Logical CPU core count |
| parallel_min, parallel_max | Parallel execution setting |
| threads_min, threads_max | Runtime thread setting |
| gpu_layers_min, gpu_layers_max | Offloaded layer setting; -1 retains the runtime sentinel |

`weight_bits` is an exact selection, not a substring or range. Its basic UI offers
only confirmed families present under the other filters, numerically ordered;
the original `quantization` text filter remains under advanced model options.
Classification uses only declared GGUF encoding codes and known `llama_ftype`
values (`general.file_type`, not tensor `ggml_type`). The shared mapping is in
`src/lib/weight-encodings.json`; migration 014 adds an immutable SQL equivalent
and an expression index, so old summaries and old app writers need no rewrite.
Known but conflicting metadata, guessed file types, unknown codes, IQ1 and ternary TQ
formats, and method-only AWQ/GPTQ labels remain unclassified. Names, filenames,
repository identifiers, model sizes and KV-cache types never supply a bit value.
Unclassified runs stay in unfiltered lists and are excluded only when a bit
filter is selected. Bit families describe the representative declared encoding,
not uniform tensor precision, average storage bits/weight or model quality.

Other text filters accept any literal case-insensitive substring, up to 120 characters.
Percent, underscore, and backslash are ordinary search characters. Empty fields are
ignored. Conditions from different fields are ANDed. Ranges are inclusive, require safe whole numbers, and reject an inverted
minimum/maximum with HTTP 400. Unknown metadata never passes a numeric range and is
displayed as missing rather than zero.

The sort parameter accepts newest (default), oldest, context_asc, context_desc,
vram_asc, vram_desc, throughput_desc, or duration_asc. Numeric sorts place missing
values last and use creation time and public ID to resolve ties.

throughput_desc and duration_asc rank measured speed, so they read the median of
the named operating point and are rejected with HTTP 400 when no point is named.
They used to read summary.mean_tg_tps and summary.mean_e2e_ms, which average
across every input length and concurrency a run measured: such a mean describes
no configuration that ran, and ranking on it put whoever configured the narrowest
grid on top. A result that did not measure the named point has no value for these
sorts and sorts last with the rest of the missing metadata. The explorer repairs
an address that asks for one of these orders without a point rather than sending
a request that would be refused, so shared links from before this change still
open; a direct API caller gets the 400. Sorting still does not normalize
different workloads or methods.
context_asc and context_desc order by the same largest configured input length
the context range filters, so a result whose workload recorded no input length is
missing for both and sorts last rather than taking the runtime allocation.

Use next_cursor unchanged with the same filters and sort. New cursors are bound to
the query; reusing one after changing a condition returns HTTP 400. The UI resets
paging when conditions change and preserves the view in the page URL.

A cursor also carries the value it stopped at, so the binding covers what the
context condition means, not only which filters were named. Cursors issued while
context meant the runtime allocation are rejected with the same HTTP 400 once it
means the configured input length, because resuming at an allocation-sized
boundary would skip or repeat results. Only queries that sort or filter on
context are affected; cursors for newest, oldest, VRAM, throughput and duration
keep working. A shared link carrying a retired cursor reports an invalid query;
select Search to restart at the first page while retaining its filters.

### Searchable suggestions

GET /v1/benchmark-runs/options accepts field (one text filter other than q, model_query
included, or point), option_query (optional literal search within that field), and the other list
filters. It returns { options: [{ value, count }], has_more }. At most 30 options
are returned; typing searches all matching records before the limit is applied.
Counts represent distinct visible runs. Hidden and deleted records never contribute.

field=point expands the operating points the visible results measured. Each value
is "<prompt_tokens>/<concurrency>", and the options are ordered by what they
measure rather than by how the pair spells out, so 512/1 precedes 4096/1. The
basis point and point_only are excluded from their own suggestions, so the list
offers every point the other conditions still allow instead of collapsing to the
one already chosen.

field=model_query suggests only model values: each run contributes its label, name,
repository, artifact, and hash, and a value that repeats within a run (a label equal to
its name) counts that run once. Hardware, runtime, and status text is never suggested.
A value longer than the 120-character filter limit is not offered, because choosing it
would be rejected. Every suggestion matches model_query again once selected.

The field being edited is excluded from its own filter constraints, while other
conditions still narrow its candidates. Selecting a GPU vendor narrows GPU names
to that vendor's selected devices, including within a run with mixed GPU vendors.
The UI fetches suggestions only for the open control, debounces typing, and aborts
superseded requests. Empty or unavailable suggestions never prevent free-text search.

### Summary metadata and storage

The additive summary.setup object contains OS, architecture, CPU/core count,
selected GPU names/vendors and memory, runtime/version/backend, execution mode,
context size, the largest configured input length, parallelism, threads, GPU layers,
and recorded cache/attention/split settings. CPU mode does not advertise stale selected GPUs. Installed but unselected
devices are excluded. Total VRAM is missing when selection is incomplete or any
selected device has unknown memory. GPU source values may retain fractional MiB.

summary.setup.runtime_build carries the raw runtime build. Summaries stored before
it existed lack the key; list responses fill it read-only from the stored
benchmark's runtime.build (null when the submission recorded none), and q searches
it the same way, so no migration rewrites them. Pages show the runtime as
version(build) through the contracts package's formatRuntimeVersionLabel, e.g.
`0.3.0-dev(10638)`, with `?` for the missing half; only a runtime named llama.cpp
gets llama.cpp banner and bNNNN parsing, and other engines keep their text as reported.

Migration 008 backfills retained summaries from existing metadata without reading
measurement chunks or restoring tombstones. Partial numeric/ordering indexes cover
visible results, and trigram indexes support substring conditions where pg_trgm is
available. The helper function stays in the private bench schema with restricted
execution grants. List and suggestion responses use no-store so visibility changes
are reflected on the next request.

### Input context and prefill

Two different numbers describe context, and the summary keeps both:

- summary.prompt_lengths lists the input lengths the workload was configured to
  send, ascending and without duplicates, in whole tokens. summary.setup.prompt_length
  is the largest of them, and that maximum is what the context range and the
  context sorts read. These are configuration, not evidence: a partial or
  cancelled run may never have reached its longest input, so the field says what
  was requested, and the row count and status say how much of it ran.
- summary.setup.context_size is the raw runtime allocation exactly as submitted.
  It is a server-side total that also covers parallel sequences and generation
  headroom, so it can be larger than a single input and answers a different
  question. It is reported on the detail page and is never filtered or sorted on.

A workload that recorded no usable input length keeps an empty prompt_lengths and
a null prompt_length: unknown. Nothing is derived from the allocation and no value
is rounded to a familiar preset, so such a result is excluded by any context range
and sorts last, exactly like other missing metadata. Entries that are not whole
positive token counts are dropped, matching the contract, which requires integers
of at least one.

summary.mean_pp_tps is the mean prefill throughput and is the one field here taken
from rows that actually ran. Rows marked failed are excluded, as are rows whose
pp_tps is missing or is not a number. When no row measured prefill the mean is null
and is displayed as missing. The generation and duration means keep the rows they
already averaged.

Migration 009 adds these three fields to every retained summary and is required by
the readiness probe. It reads input lengths from the stored benchmark metadata and
the prefill mean from the retained measurement chunks, in chunk and row order, so a
backfilled summary matches what acceptance would compute for the same run. It
merges only those fields, so curated model labels and every other summary value
survive, and raw benchmark metadata, measurement rows, owner and body hashes,
capacity counters and deleted tombstones are left untouched. It also adds ascending
and descending partial indexes on the configured input length expression and drops
the two 008 indexes on the raw allocation, which no query orders or filters on any
more.

### Operating points

A run's measurement rows are a grid: the configured input lengths against the
configured batch sizes, repeated `workload.repetitions` times at one generation
length. summary.points holds one entry per (prompt_tokens, concurrency,
generation_length) - one operating point - ascending by input length, then
concurrency, then generation length:

```json
{ "prompt_tokens": 4096, "concurrency": 1, "generation_length": 128, "samples": 3,
  "pp_tps": { "median": 1510.0, "min": 1480.0, "max": 1540.0 },
  "tg_tps": { "median": 71.0, "min": 69.8, "max": 72.1 },
  "ttft_ms": { "median": 340.0, "min": 310.0, "max": 360.0 },
  "e2e_ms":  { "median": 6810.0, "min": 6700.0, "max": 6900.0 } }
```

Only the repetitions inside a point are aggregated, because only they measured
the same thing more than once. `samples` counts the rows behind the point; each
metric aggregates only the rows that reported it, and is null when none did -
unknown, never zero. Rows marked failed are skipped, and so is a row whose input
length, concurrency or generation length is not a whole positive count, because
it belongs to no point a reader could name; the run's row_count still counts it.

The median is percentile_cont(0.5). For an even number of repetitions that
interpolates as `low + (high - low) * 0.5` between the two middle values, which
is the arithmetic the application helper spells, so the value stored at
acceptance and the value migration 012 backfills from the same rows are the same
double rather than differing in the last bit.

At most 64 points are stored per result. The contract allows 64 input lengths
against 64 batch sizes and a summary travels with every item of a list page, so
a wider grid is cut ascending - dropping the longest inputs - and
summary.points_truncated says so. The measurement rows are unaffected.

summary.mean_tg_tps, summary.mean_e2e_ms and summary.mean_pp_tps remain on stored
summaries and are still written at acceptance, but nothing displays or sorts on
them any more. They average across input lengths and concurrencies at once: a
duration averaged over a 512-token and a 16K-token prompt belongs to neither
prompt, and a generation rate averaged over concurrency 1 and 16 is not a rate
either of them reported.

Migration 012 backfills points onto every retained summary, including hidden
ones, reading the measurement chunks in place. Every retained summary gains both
keys, so a run whose rows named no point reads as an empty list rather than as
one stored before 012. Curated model labels and every other summary field
survive the merge, and raw benchmark metadata, measurement rows, owner and body
hashes, capacity counters and tombstones are untouched.

No index backs the point sorts. They read one entry out of a small JSON array per
row, which no expression index covers without pinning the selected point into the
index definition, so ordering by a point is a scan of the visible rows. When that
stops being fast enough, the points belong in their own table with
(prompt_tokens, concurrency) indexed and the list query joining it laterally;
nothing about the stored shape or the query parameters has to change for readers.

### Model metadata

Contract 0.3.0 added an OPTIONAL model.metadata block, and schema_version stays 1.
The block describes GGUF weights: name, architecture, size label, quantization, file type,
quantizer, Hugging Face repository, upstream base models, repo-relative artifact,
and source. Acceptance stores it on the summary as model_info, adding the
publisher (the repository namespace, and nothing else) and echoing the recorded
artifact identity (sha256, identity_status).

Publisher is derived from the repository namespace alone. GGUF
general.quantized_by names whoever produced the quantized weights, which is
routinely a different party, so it is published under its own name and never
promoted to publisher. Nothing is parsed out of a filename or a curated label:
a field that fails validation is null (unknown). An artifact is published only
with a usable repository and a registry source (huggingface or gguf+huggingface);
a bare filename or a GGUF-only source proves no download origin. Format and
quantization describe the weights, not the KV cache, and are not a quality claim.

New submissions with described models are labeled by metadata name, then
repository; runs without metadata keep the existing hash-or-status label.
publisher, quantization, and base_model are substring filters with editable
suggestions, and the global q also searches repository, artifact, architecture,
size label, quantized_by, base model IDs, and the model hash. A run that
recorded no metadata never matches these filters, and each of its metadata
fields reads as unknown - the same word a single unrecorded field uses, because
it is the same fact.

model_query is the narrow model search beside them. It matches a case-insensitive
substring of the model label or of the model_info name, repository, artifact, or
sha256; a run matches when any one of those values does, and the condition is ANDed
with every other filter, so model_query plus a GPU filter lists only runs on that GPU.
Hardware, runtime version, status, architecture, size label, quantizer, and base
models never match it; they stay with q and, for base models, their own filter. The hash is
the one the summary records with model metadata, so a run that described no model is
found by its label - sha256: and the first 12 hash characters - exactly as before.
q and model are unchanged: q keeps its broad search surface, model still reads the
label alone, and links made before model_query keep their meaning. The same text
limit applies. Cursors bind model_query like any other condition; cursors issued
before it existed carry no such condition and keep working.

Migration 010 backfills model_info onto retained summaries whose stored payload
actually carries a metadata object, using the same validators as the
application helper. Curated model labels are never replaced, rows without
metadata are not written at all, and raw benchmark metadata, measurement rows,
hashes, capacity counters, and tombstones are left untouched. It also adds
trigram indexes for the three new filters where pg_trgm is available.

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
other conditions. Generic setting conditions are offered in serving scope only;
leftover conditions stay editable in legacy scope so they can be removed rather
than silently discarded.

Sorting remains beside the results and applies immediately without submitting
unfinished filter edits. Ordering is not a narrowing filter, does not become a
filter chip, and does not turn a truly empty view into a filtered-empty message.
Point-ranked orders still require a complete measured point.

**Match measurement conditions** is a separate, collapsed result-control
disclosure. Its summary always names the current point or explains that each
result uses its own measured conditions. Point selection and `point_only` apply
immediately and reset pagination. Serving uses the whole bytes/concurrency/cap
tuple; legacy uses the whole token-length/concurrency pair. Clearing a point
also clears `point_only` and point-ranked sorting. Hidden form fields preserve
the tuple during filter submission; point halves never become separate chips.
These controls are omitted only from a truly empty default view, not a view
with an explicitly selected point or order.
Refresh stays beside the results heading, including on an empty view; it does not
submit pending edits.

Serving result rows lead with the model link, recorded host hardware and engine,
first-output time, output speed in B/s, and the exact measured conditions.
Medians, non-degenerate ranges and differing observed sample counts remain
visible; single-sample values are not repeated as identical min/max ranges.
Unknown values remain unknown, never zero. Hardware describes the AioLM host,
not necessarily an attached service's compute host. Full identity, inputs and
hashes, settings, memory scope, all metric statistics and registration time are
available on the existing result-detail page. Legacy token rows keep their
existing units and detailed disclosures. Narrow layouts use labeled cards
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
