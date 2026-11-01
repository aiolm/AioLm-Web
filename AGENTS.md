Repository Instructions

These instructions apply throughout the repository. If tmp/[AGENTS.local.md](http://AGENTS.local.md) exists, also read and follow its local instructions.

Design-system changes must follow [docs/design-system.md](docs/design-system.md).
The guide-based typography in `src/theme/typography.css` is the sole source of
font-family, size, weight, line-height and letter-spacing tokens for every page
and locale. Use the same semantic role across pages; never add a page-specific
type scale, redefine typography tokens outside that file, or add inline JSX
typography/style-object overrides. New semantic roles require a documented
central change, not a local exception. Preserve browser/text zoom and let
layouts wrap rather than shrinking text to fit.

`npm run design:check` is part of both `npm run lint` and `npm run build`.
Do not bypass or weaken these guards to accommodate a page override. Shared
palette/status/control and geometry tokens remain valid; the typography guard
does not ban literal layout or color values wholesale.