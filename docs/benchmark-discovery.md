# Benchmark discovery

The website extends the shared publication API with discovery queries. Publication,
ownership, verification, deletion, and measurement-row protocols remain unchanged.
Run the numbered SQL migrations before deploying code that requires migration 008.
The readiness probe checks that the migration is present.

## List queries

GET /v1/benchmark-runs returns the existing items/next_cursor envelope. Pages default
to 25 items and are capped at 100. Each item includes a small public summary; full
benchmark metadata and measurement rows are not loaded by the explorer.

| Query | Meaning |
| --- | --- |
| q | Search public labels, hardware, OS, runtime, settings, and status |
| model, hardware, method, workload | Existing summary label filters |
| vendor, gpu, cpu | Selected GPU vendor/model and CPU name |
| os, arch, runtime, backend, mode | Environment and runtime filters |
| flash_attention, cache_type_k, cache_type_v, split_mode | Recorded execution settings |
| context_min, context_max | Context length in tokens |
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
values last and use creation time and public ID to resolve ties. Throughput and
duration are stored summary means; sorting does not normalize different workloads.

Use next_cursor unchanged with the same filters and sort. New cursors are bound to
the query; reusing one after changing a condition returns HTTP 400. The UI resets
paging when conditions change and preserves the view in the page URL.

## Searchable suggestions

GET /v1/benchmark-runs/options accepts field (one text filter other than q),
option_query (optional literal search within that field), and the other list
filters. It returns { options: [{ value, count }], has_more }. At most 30 options
are returned; typing searches all matching records before the limit is applied.
Counts represent distinct visible runs. Hidden and deleted records never contribute.

The field being edited is excluded from its own filter constraints, while other
conditions still narrow its candidates. Selecting a GPU vendor narrows GPU names
to that vendor's selected devices, including within a run with mixed GPU vendors.
The UI fetches suggestions only for the open control, debounces typing, and aborts
superseded requests. Empty or unavailable suggestions never prevent free-text search.

## Summary metadata and storage

The additive summary.setup object contains OS, architecture, CPU/core count,
selected GPU names/vendors and memory, runtime/version/backend, execution mode,
context size, parallelism, threads, GPU layers, and recorded cache/attention/split
settings. CPU mode does not advertise stale selected GPUs. Installed but unselected
devices are excluded. Total VRAM is missing when selection is incomplete or any
selected device has unknown memory. GPU source values may retain fractional MiB.

Migration 008 backfills retained summaries from existing metadata without reading
measurement chunks or restoring tombstones. Partial numeric/ordering indexes cover
visible results, and trigram indexes support substring conditions where pg_trgm is
available. The helper function stays in the private bench schema with restricted
execution grants. List and suggestion responses use no-store so visibility changes
are reflected on the next request.

## Compact explorer controls

Search, GPU vendor, and GPU model are the default discovery controls. A single
native “More filters” disclosure holds all remaining fields in hardware,
OS/runtime, and execution/workload groups. Its count includes populated advanced
fields, including values restored from shared links; closing it preserves drafts.
The Search button sits beside the query and repeats after the advanced fields. A pending
changes message distinguishes edited controls from the applied result chips.
Clear filters resets both drafts and results, including pagination, and is also
available in the filtered empty state. Comparison selections survive reset.

Sorting sits beside the results and applies immediately to the current query.
It resets pagination without applying or discarding unfinished filter edits,
including invalid ranges. Search and filter changes still require Search.
URL sharing, browser history, free-text suggestions, and keyset paging retain
their existing behavior. Disclosure state is local presentation, not URL state.

A result link preserves the current query. When a shared cursor or a return from
a detail page has no previous-page history, First page provides a way back to
the beginning while retaining filters. Applying advanced fields closes their
panel and moves focus to the result heading.
