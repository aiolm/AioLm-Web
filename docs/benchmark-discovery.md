# Benchmark discovery

The website extends the shared publication API with discovery queries. Publication,
ownership, verification, deletion, and measurement-row protocols remain unchanged.
Run the numbered SQL migrations before deploying code that requires migration 010.
The readiness probe checks that every required migration is present.

## List queries

GET /v1/benchmark-runs returns the existing items/next_cursor envelope. Pages default
to 25 items and are capped at 100. Each item includes a small public summary; full
benchmark metadata and measurement rows are not loaded by the explorer.

| Query | Meaning |
| --- | --- |
| q | Search public labels, hardware, OS, runtime, settings, status, and precise model identifiers |
| model, hardware, method, workload | Existing summary label filters |
| publisher, quantization, base_model | Model publisher, weight quantization, and upstream model IDs |
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

Text filters accept any literal case-insensitive substring, up to 120 characters.
Percent, underscore, and backslash are ordinary search characters. Empty fields are
ignored. Ranges are inclusive, require safe whole numbers, and reject an inverted
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

## Searchable suggestions

GET /v1/benchmark-runs/options accepts field (one text filter other than q, or
point), option_query (optional literal search within that field), and the other list
filters. It returns { options: [{ value, count }], has_more }. At most 30 options
are returned; typing searches all matching records before the limit is applied.
Counts represent distinct visible runs. Hidden and deleted records never contribute.

field=point expands the operating points the visible results measured. Each value
is "<prompt_tokens>/<concurrency>", and the options are ordered by what they
measure rather than by how the pair spells out, so 512/1 precedes 4096/1. The
basis point and point_only are excluded from their own suggestions, so the list
offers every point the other conditions still allow instead of collapsing to the
one already chosen.

The field being edited is excluded from its own filter constraints, while other
conditions still narrow its candidates. Selecting a GPU vendor narrows GPU names
to that vendor's selected devices, including within a run with mixed GPU vendors.
The UI fetches suggestions only for the open control, debounces typing, and aborts
superseded requests. Empty or unavailable suggestions never prevent free-text search.

## Summary metadata and storage

The additive summary.setup object contains OS, architecture, CPU/core count,
selected GPU names/vendors and memory, runtime/version/backend, execution mode,
context size, the largest configured input length, parallelism, threads, GPU layers,
and recorded cache/attention/split settings. CPU mode does not advertise stale selected GPUs. Installed but unselected
devices are excluded. Total VRAM is missing when selection is incomplete or any
selected device has unknown memory. GPU source values may retain fractional MiB.

Migration 008 backfills retained summaries from existing metadata without reading
measurement chunks or restoring tombstones. Partial numeric/ordering indexes cover
visible results, and trigram indexes support substring conditions where pg_trgm is
available. The helper function stays in the private bench schema with restricted
execution grants. List and suggestion responses use no-store so visibility changes
are reflected on the next request.

## Input context and prefill

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

## Operating points

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

## Model metadata

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

Migration 010 backfills model_info onto retained summaries whose stored payload
actually carries a metadata object, using the same validators as the
application helper. Curated model labels are never replaced, rows without
metadata are not written at all, and raw benchmark metadata, measurement rows,
hashes, capacity counters, and tombstones are left untouched. It also adds
trigram indexes for the three new filters where pg_trgm is available.

## Compact explorer controls

Search, GPU vendor, and GPU model are the default discovery controls. A single
native “More filters” disclosure holds all remaining fields in hardware,
OS/runtime, and execution/workload groups. Its count includes populated advanced
fields, including values restored from shared links; closing it preserves drafts.
The Search button sits beside the query and repeats after the advanced fields. A pending
changes message distinguishes edited controls from the applied result chips.
Clear filters resets both drafts and results, including pagination, and is also
available in the filtered empty state. Comparison selections survive reset.

The basis point sits beside the results with sorting, because both decide how the
results are read rather than which are listed. Its options are the points that
were really measured under the current conditions, offered as whole pairs, so a
reader cannot ask for an input length at a concurrency nobody ran. Selecting one
applies immediately and resets pagination; leaving it unset is a valid view in
which each row reports its own leading point and names it. Clearing it also
clears point_only and any order that ranked at it. The two halves never appear as
removable filter chips, since removing one would leave half a point behind, and
they ride along as hidden fields with a filter submit so applying a filter cannot
silently drop the point every row is read at.

Sorting sits beside the results and applies immediately to the current query.
It resets pagination without applying or discarding unfinished filter edits,
including invalid ranges. Search and filter changes still require Search.
URL sharing, browser history, free-text suggestions, and keyset paging retain
their existing behavior. Disclosure state is local presentation, not URL state.

A result link preserves the current query. When a shared cursor or a return from
a detail page has no previous-page history, First page provides a way back to
the beginning while retaining filters. Applying advanced fields closes their
panel and moves focus to the result heading.


Published measurement policy: new submissions must be complete, non-empty, and contain no failed rows. Local diagnostic records remain local. System RAM is an optional measurement-time capacity in environment.system_memory_bytes and summary.setup.ram_bytes; it is not GPU VRAM or peak process memory. Model display names may omit encoding suffixes, but weight encoding always comes from model metadata, never from the display label.
