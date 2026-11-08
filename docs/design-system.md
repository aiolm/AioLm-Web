# Website design system

The website shares the desktop app's Orchid Periwinkle palette, interface
hierarchy and control language. Home, guides, benchmarks, result details,
management, verification and error states use one semantic type scale in every
locale. Web prose keeps a comfortable reading size; it is not compressed to
the desktop app's denser interface text.

## Sources of truth

- **Typography:** `src/theme/typography.css` owns all `--font-*`, `--fs-*`,
  `--lh-*`, `--fw-*` and `--tracking-*` definitions, including responsive and
  language-specific adjustments. The shared locale layout loads it before global CSS.
  Component and page CSS consume these tokens directly or inherit them.
- **Palette:** `src/theme/palette-data.json` contains approved light/dark palette
  values; `src/theme/status-tones.json` defines notice/status tones and
  `src/theme/control-tones.json` defines control tones. Run
  `npm run theme:generate` after changing those inputs. The generator
  `scripts/generate-theme-palettes.mjs` produces `src/theme/palettes.css`.
  Use semantic `--ui-*` and `--tone-*` tokens. Canvas, fields, secondary actions,
  panels and notices are flat; only primary actions and navigation retain
  brand gradients. The generator validates text, focus and field-edge contrast.
- **Geometry and global behavior:** `src/app/globals.css` owns shared radius
  tokens (`--ui-radius-*`), `--site-max`, `--page-gutter`, `--rail-width`,
  `--control-min` and `--control-pad-*`, plus document and layout primitives.
  `src/components/ui-controls.css` owns shared select/menu/disclosure behavior;
  `src/theme/surfaces.css` owns brand marks, native selection accents, disabled
  controls and forced-colors fallbacks, not page-specific paint overrides.
  Page CSS owns its layout and explicit selected states.

Color, status, radius and control primitives are not typography tokens. The
font guard does not forbid all literal colors, dimensions or spacing, and does
not replace the palette generator.

The shared geometry follows the app: 8px controls, 10px menus, 12px panels and
16px dialogs. Controls have a 36px minimum height, increasing to 44px on narrow
or coarse-pointer surfaces; height grows with wrapped labels and text zoom.
Panels have a quiet boundary and no idle shadow. Menus and dialogs retain
elevation. Editable fields use a visible boundary and focus ring, not a pencil
decoration. Hovered field edges use the stronger ink boundary so the darker
hover fill still has at least 3:1 edge contrast.

Home uses an introduction/install split on wide screens. Guides use article
navigation and contents rails, with a horizontal navigation strip and a
contents disclosure on narrow screens. Benchmark conditions, comparison and
supporting details use the same neutral panels and control primitives.

Guide rail breakpoints use the content container and font-relative units, so
text-only enlargement stacks the rails instead of squeezing the article.

## App-aligned type scale

The baseline below is expressed at the default 16px browser root size; `rem`
values continue to follow user font settings. Only the numeric KPI role
changes at `max-width: 40rem`. Token definitions in the CSS, not this table,
are authoritative at runtime.

| Semantic role | Size token | Baseline size | Line-height token / ratio |
| --- | --- | --- | --- |
| Page title (`h1`) | `--fs-page-title` | 24px | `--lh-title` / 1.3 |
| Section heading (`h2`) | `--fs-section` | 18px | `--lh-heading` / 1.5 |
| Group/card heading (`h3`) | `--fs-group` | 14px | `--lh-group` / 1.5 |
| Reading text, introductions and prose | `--fs-body` | 16px | `--lh-body` / 1.7 |
| Compact descriptive text | `--fs-body-compact` | 15px | `--lh-compact` / 1.6 |
| Controls, navigation and field labels | `--fs-control` | 14px | `--lh-control` / 1.5 |
| Table headers and cells | `--fs-table` | 14px | `--lh-table` / 1.5 |
| Captions, secondary metadata and supporting labels | `--fs-support` | 12px | `--lh-support` / 1.5 |
| Micro labels and incidental counts, not reading prose | `--fs-small` | 12px | `--lh-support` / 1.5 |
| Code and preformatted content | `--fs-code` | 13px | `--lh-code` / 1.8 |
| Numeric KPI, not a heading or body substitute | `--fs-metric` | 22px; 20px compact | `--lh-metric` / 1.3 |
| Site wordmark | `--fs-brand` | 18px | `--lh-group` / 1.5 |

Use `--font-sans` for interface/prose and `--font-mono` for code. The sans stack
starts with the bundled Pretendard font and includes platform/script fallbacks.
Preserve native HTML headings, labels, links, buttons and table semantics; a
visual role does not require replacing semantic markup with generic elements.

Weights are `--fw-regular` (400) for reading text, `--fw-medium` (500) for
moderate interface emphasis, `--fw-semibold` (550) for stronger labels,
`--fw-heading` (650) for headings and strong emphasis, and `--fw-brand` (650)
for the wordmark. Do not introduce an intermediate page-specific weight.
Tracking roles are `--tracking-title` (-.02em), `--tracking-heading` (-.01em),
`--tracking-brand` (-.02em), `--tracking-label` (.025em) and
`--tracking-normal` (0). Korean, Japanese and Chinese centrally use zero
title/heading tracking; they do not get a different font-size scale.

### Responsive, locale and zoom policy

- The same semantic role uses the same token on home and all other pages.
  There is no oversized home hero, CJK-only size, or separate mobile title token.
- Only the foundation changes the KPI size at `40rem`; reading, table and title
  roles remain the same at every width. Do not redefine tokens in a page,
  component, media query or locale selector outside the foundation.
- Translations may wrap differently. Preserve the shared scale and adapt
  layout, wrapping, minimum heights, padding or scroll regions rather than
  shrinking text, clipping labels or forcing prose into a fixed-height box.
- Preserve browser zoom, text zoom, user font settings and native form-control
  accessibility. Do not add maximum viewport scale, disable user scaling, cap
  text scaling, or shrink controls merely to suppress iOS focus zoom.
- Native disclosures must keep a visible open/closed indicator. If the native
  marker is removed, provide an explicit stateful chevron.
- Scrollable navigation must show the complete keyboard focus ring. Inset
  outlines where a scroll container would clip an outside ring.
- Keep reading text at the body/compact-body roles. Caption and micro roles
  are not escape hatches for fitting a crowded page.

## Authoring and enforcement

Use a direct canonical token for each controlled CSS property:

```css
.example-card-title {
  font-family: var(--font-sans);
  font-size: var(--fs-group);
  font-weight: var(--fw-heading);
  line-height: var(--lh-group);
  letter-spacing: var(--tracking-heading);
}

.example-control {
  font: inherit;
  font-size: var(--fs-control);
  line-height: var(--lh-control);
}
```

`inherit` is also allowed for each longhand. `font` shorthand is allowed only
as `font: inherit`; a shorthand must not silently reset the shared scale.
Do not use raw values, `normal`, fallback values, `calc(...)`, or local aliases
for these typography properties. If a reset needs normal tracking, for example,
use `var(--tracking-normal)`. Explicit `@font-face` family names and weight
ranges are registration descriptors and are exempt; the registration does not
create a new page typography scale.

`npm run design:check` parses every `src/**/*.css` file with PostCSS and reads
valid typography token names from `src/theme/typography.css`. It rejects:

- Literal or computed `font-size`, `font-family`, `font-weight`, `line-height`
  and `letter-spacing`, except `inherit` and the narrow font-registration case.
- A direct variable from the wrong family (such as a size used for line-height),
  unknown typography token references and typography token definitions outside
  the foundation, including local/responsive redefinitions.
- A `font` shorthand other than `inherit`.

ESLint's `no-restricted-syntax` additionally rejects typography keys in source
JavaScript/TypeScript object properties (including hoisted style objects), JSX
attributes, direct property assignments and literal `setProperty` calls. This
keeps typography in CSS rather than inline styles, DOM mutations or SVG font
attributes. The **only file exception** is
`src/app/opengraph-image/route.tsx`: it renders a fixed 1200×630 social-preview
image, not a browser page. Layout-only inline styles such as a positioned menu
or scroll-region width are still permitted.

Both **`npm run lint` and `npm run build` run the CSS guard**. Lint also runs
ESLint; the Next.js build runs its ESLint pass. CI invokes these normal commands.
`vercel.json` pins `npm run build` as Vercel's build command; `.vercelignore`
uploads only the checker from `scripts/`, not operator tools or the theme generator.

These are structural guards, not visual or accessibility proofs. They cannot
decide whether a developer picked the correct semantic role, whether a
translation fits, or whether contrast, overflow and zoom remain usable. They
do not analyze generated/runtime CSS strings, resolve arbitrary dynamic object
spreads, or verify the selected font's glyph metrics. Keep typography in the
supported CSS path; do not introduce a different styling path to bypass the
guard. Review rendered pages and responsive/localized states as well as checks.

## Changing the system intentionally

1. Identify the semantic role and compare it with the guide reference. Reuse an
   existing role first; a page-specific aesthetic is not a new role.
2. If the shared role genuinely needs to change, edit only
   `src/theme/typography.css` for its values, breakpoint behavior or locale
   tracking. Adding a role means adding a canonical token in the appropriate
   family, not a parallel token registry or an enforcement exception.
3. Migrate every affected caller in the same change. Remove obsolete tokens,
   declarations and documentation; do not leave compatibility aliases or
   page-local overrides. Update this guide when the scale or policy changes.
4. Run `npm run lint`, `npm run typecheck` and `npm run build` after integration.
   Review home, guides, benchmark lists/details, management, verification and
   error states in supported locales at narrow and wide widths, with browser
   and text zoom. Check native controls and table overflow, not just headings.

The system prevents accidental local drift through normal lint/build paths.
It can still evolve through a deliberate, reviewed, documented central change;
it is not a promise that future typography can never change.
