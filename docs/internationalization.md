# Website languages

Public page URLs use one of four locale prefixes: `/en`, `/ko`, `/ja`, or `/zh` (Simplified Chinese). English is the product fallback. Examples include `/ko/benchmarks` and `/ja/manage`.

## Routing and preference

Explicit locale URLs always win. Only recognized legacy pages (home, benchmark list/detail, management, upload verification) negotiate a language in middleware. A valid `aiolm_locale` cookie takes precedence over weighted `Accept-Language` preferences; regional tags match their base language. Unsupported or malformed preferences fall back to English. Negotiation uses temporary 307 redirects with `Cache-Control: private, no-store` and `Vary: Accept-Language, Cookie`.

Unknown pages and unsupported locale prefixes remain 404s. API paths, including all `/v1/**` paths, assets, and non-GET/HEAD requests do not participate in negotiation. API error codes, protocol enums, security checks and same-origin management requests keep their existing behavior.

The labeled native language selector navigates to the equivalent localized page, preserving its path, query string and fragment. It persists the language in a one-year, same-origin, SameSite=Lax cookie, with Secure on HTTPS. The cookie contains only the locale and is separate from management credentials. If cookies are disabled, explicit localized URLs continue to work. Fragment data stays in the browser.

## Rendering and catalogs

The locale layout validates `params`, sets `html lang`, and generates static parameters for all four languages. It never reads cookies or headers. Homepage copy and the workspace illustration are server rendered. The root provider serializes only the selected language's `site` and `common` catalogs; feature providers merge their selected namespace while preserving the root locale. All catalog imports live in the server-only loader with explicit namespace/locale imports, so browsers do not import every language.

Each namespace has a flat string dictionary under `src/i18n/messages/<namespace>/<locale>.ts`. Its English dictionary is the canonical key shape; translations must retain every key and interpolation placeholder. `createTranslator` performs plain-text `{name}` interpolation, never HTML evaluation. Keep model names, user text, Markdown, identifiers, raw measurements and recovery secrets unchanged. `intlLocales` supplies explicit formatting locales when presentation requires date or number formatting.

Use `localizedPath(locale, path)` for internal page links and `localeAlternates(locale, path)` for page-specific canonical/hreflang metadata. Metadata URLs resolve against `SERVICE_ORIGIN`. The sitemap lists all localized home and benchmark explorer URLs; private management/verification URLs and dynamic benchmark identifiers are not enumerated.

The robots route advertises the canonical sitemap and disallows API, management, and verification paths in all locales. Private pages also retain their noindex metadata.

## Validation

Run `npx vitest run tests/unit/i18n-routing.test.ts tests/unit/i18n-catalogs.test.ts tests/ui/i18n-provider.test.tsx tests/ui/i18n-home.test.tsx` for routing precedence, API/asset bypass, catalog parity, interpolation and server-rendered UI. Run the standard typecheck, lint, API/security tests and production build before release. Verify actual 404 status codes and responsive language switching (including query/fragment retention) in the built app.
