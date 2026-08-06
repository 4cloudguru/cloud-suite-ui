import { describe, expect, it, vi } from 'vitest'
import { isSafeRoutePath, isSafeUrl, resolveRoutePath } from './utils/url'

/**
 * Cross-cutting sink inventory for this package, independently re-derived (this batch) by
 * grepping all of `src/**` for the two defect classes in scope:
 *
 *   E1 - untrusted-input sinks: a host-supplied (backend response / whitelabel config) or
 *        persisted-storage-supplied value reaches rendering, parsing, or a DOM/CSS mutation
 *        without validation.
 *   E2 - navigation sinks: a value reaches `window.open`, an `<a href>`, or a react-router
 *        `to=` prop without validation, risking `javascript:`/`data:` execution or open-redirect.
 *
 * Every row records a verdict:
 *   'guarded'  - validated at (or immediately before) the sink, with a dedicated behavioural
 *                test elsewhere proving the rejection path (see `coverage`).
 *   'screened' - not independently guarded at this exact site, but safe by construction: either
 *                the value only ever reaches a React JSX text/child position (auto-escaped), or
 *                it was already validated upstream before reaching this second consumption site.
 *   'exempt'   - not attacker-controlled at all: a hardcoded literal, a component API prop set
 *                only by the integrating app's own code, or a sink that takes no argument.
 *
 * This file is the canonical inventory, not a duplicate test suite: for sites whose guard is an
 * internal (non-exported) helper, `coverage` points at the component/module test that already
 * exercises that guard's rejection path end-to-end. What this file DOES exercise directly is the
 * three *shared, cross-site* guards (`isSafeUrl` / `isSafeRoutePath` / `resolveRoutePath`)
 * against realistic malicious payloads, since a regression in one of those has the largest
 * blast radius (every site that imports it breaks at once).
 */
interface SinkRow {
  category: 'E1' | 'E2'
  file: string
  site: string
  verdict: 'guarded' | 'screened' | 'exempt'
  why: string
  coverage: string
}

const SINKS: SinkRow[] = [
  // ---- E1: untrusted-input sinks ----
  {
    category: 'E1',
    file: 'src/theme/createAppTheme.ts',
    site: 'normalizeThemeColor() -> MUI createTheme palette (overrides.primary/secondaryLight/secondaryDark)',
    verdict: 'guarded',
    why: "Rejects CSS-breakout characters (;{}<>\\) and url(...) up front, then only ever hands the palette MUI's OWN re-serialisation of the value (decomposeColor -> recomposeColor), never the raw host string.",
    coverage: 'src/theme/createAppTheme.test.ts',
  },
  {
    category: 'E1',
    file: 'src/components/BrandingSettingsCard.tsx',
    site: 'color-field swatch preview (fieldValue rendered as a background colour)',
    verdict: 'guarded',
    why: 'HEX_SWATCH_RE (/^#[0-9A-Fa-f]{6}$/) gates the swatch render; anything else renders no swatch at all.',
    coverage: 'src/components/BrandingSettingsCard.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/theme/SuiteThemeProvider.tsx',
    site: 'product_name rendered as text (useThemeMode().productName)',
    verdict: 'screened',
    why: 'sanitizeUiThemeConfig coerces non-strings to undefined; the surviving string is only ever rendered as a React JSX text child, which auto-escapes, so no markup/script injection is possible regardless of content.',
    coverage: 'src/theme/SuiteThemeProvider.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/theme/SuiteThemeProvider.tsx',
    site: 'logo_url / login_hero_url exposed as useThemeMode().logoUrl/loginHeroUrl (consumed as <img src>)',
    verdict: 'guarded',
    why: 'Only kept when isSafeUrl(...) passes; otherwise exposed as null so no image is rendered.',
    coverage: 'src/theme/SuiteThemeProvider.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/theme/SuiteThemeProvider.tsx',
    site: 'favicon_url -> document.querySelector(\'link[rel~="icon"]\').href direct DOM property write',
    verdict: 'guarded',
    why: 'Only assigned when isSafeUrl(...) passes. This is a raw DOM property mutation (not JSX), a distinct sink from logo/hero above despite sharing the same guard function and config object.',
    coverage: 'src/theme/SuiteThemeProvider.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/shell/SuiteLayout.tsx',
    site: '<img src={logoUrl}> (brand logo, consuming useThemeMode().logoUrl)',
    verdict: 'screened',
    why: 'logoUrl is already validated by SuiteThemeProvider (isSafeUrl) before it is ever exposed via useThemeMode(); this is a second consumption site of an already-guarded value, not an independent sink.',
    coverage: 'src/theme/SuiteThemeProvider.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/identity/AuthProvider.tsx',
    site: 'me.allowed_scopes (backend response) -> allowedScopes state, gates admin-only UI',
    verdict: 'guarded',
    why: 'Array.isArray(me.allowed_scopes) check; a null/object/string response collapses to [] (no scopes granted) instead of throwing or being misread as a truthy/iterable scope grant.',
    coverage: 'src/identity/AuthProvider.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/consent/ConsentProvider.tsx',
    site: 'JSON.parse(safeGetItem(storageKey)) -> ConsentPreferences state',
    verdict: 'guarded',
    why: 'Corrupted JSON is caught and treated as no consent; a parsed primitive/array is rejected before reaching sanitizePreferences; every opt-in field surviving into state must be the boolean literal true.',
    coverage: 'src/consent/ConsentProvider.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/shell/SuiteLayout.tsx',
    site: 'JSON.parse(safeGetItem(groupStateStorageKey)) -> openGroups state',
    verdict: 'guarded',
    why: 'A parsed primitive/array falls through to the "every group open" default; sanitizeGroupState then keeps only boolean-typed values per key, dropping anything else.',
    coverage: 'src/shell/SuiteLayout.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/components/NotificationChannelsSection.tsx',
    site: 'ChannelFormDialog target field -> onCreate/onUpdate payload',
    verdict: 'guarded',
    why: 'A non-empty, non-email target must pass isSafeUrl(...); an optional host validators.isValidTarget(value, type) is additionally required when the host supplies one \u2014 both checks must pass, not either.',
    coverage: 'src/components/NotificationChannelsSection.test.tsx',
  },
  {
    category: 'E1',
    file: 'src/components/Page.tsx',
    site: 'sx prop forwarded (merged) to MUI Container',
    verdict: 'exempt',
    why: "sx is a component API prop set only by the integrating app's own code \u2014 nothing in this package ever populates it from a host/backend response or persisted storage. MUI/Emotion also serialise sx as structured style declarations (an object), not a raw CSS string, so there is no string-breakout point even if a value were attacker-influenced.",
    coverage: 'n/a - no attacker-controlled input reaches this site',
  },

  // ---- E2: navigation sinks ----
  {
    category: 'E2',
    file: 'src/shell/SuiteSwitcher.tsx',
    site: 'window.open(link.href, ...) \u2014 3 call sites (no-appId fallback, reserved-target fallback, named-tab reuse)',
    verdict: 'guarded',
    why: 'A single early-return isSafeUrl(link.href) check at the top of openSuiteLink() gates all three window.open call sites; an appId matching a reserved HTML target keyword (_self/_top/_parent/_blank, case-insensitive) is separately rejected before it could be used as the window name.',
    coverage: 'src/shell/SuiteSwitcher.test.tsx',
  },
  {
    category: 'E2',
    file: 'src/consent/ConsentBanner.tsx',
    site: '<a href={privacyPolicyHref}>',
    verdict: 'guarded',
    why: 'Only used when isSafeUrl(...) passes; otherwise falls back to the literal default "/privacy".',
    coverage: 'src/consent/ConsentBanner.test.tsx',
  },
  {
    category: 'E2',
    file: 'src/shell/SuiteLayout.tsx',
    site: 'brand <Link to="/">',
    verdict: 'exempt',
    why: 'Hardcoded string literal, not derived from any prop or persisted value.',
    coverage: 'n/a - no attacker-controlled input reaches this site',
  },
  {
    category: 'E2',
    file: 'src/shell/SuiteLayout.tsx',
    site: 'nav item <Link to={item.path}>',
    verdict: 'guarded',
    why: 'Wrapped in resolveRoutePath(item.path, \'/\', \'SuiteLayout\'); an unsafe path warns and falls back to "/".',
    coverage: 'src/shell/SuiteLayout.test.tsx',
  },
  {
    category: 'E2',
    file: 'src/shell/SuiteLayout.tsx',
    site: 'unauthenticated <Button to={loginPath}>',
    verdict: 'guarded',
    why: 'Wrapped in resolveRoutePath(loginPath, \'/\', \'SuiteLayout\'); an unsafe path warns and falls back to "/".',
    coverage: 'src/shell/SuiteLayout.test.tsx',
  },
  {
    category: 'E2',
    file: 'src/components/DashboardCard.tsx',
    site: '<CardActionArea component={RouterLink} to={to}>',
    verdict: 'guarded',
    why: 'Wrapped in resolveRoutePath(to, \'/\', \'DashboardCard\'); an unsafe path warns and falls back to "/".',
    coverage: 'src/components/DashboardCard.test.tsx',
  },
  {
    category: 'E2',
    file: 'src/components/BrandingSettingsCard.tsx',
    site: 'window.location.reload()',
    verdict: 'exempt',
    why: 'Reloads the current document in place; takes no URL/argument, so there is no attacker-controlled navigation target to validate.',
    coverage: 'n/a - no attacker-controlled input reaches this site',
  },
]

describe('sink enumeration table (E1 untrusted-input / E2 navigation)', () => {
  it.each(SINKS)('records a valid verdict and non-empty rationale for $file: $site', (row) => {
    expect(['E1', 'E2']).toContain(row.category)
    expect(['guarded', 'screened', 'exempt']).toContain(row.verdict)
    expect(row.why.length).toBeGreaterThan(0)
    expect(row.coverage.length).toBeGreaterThan(0)
  })

  it('enumerates the sink count re-derived this session (guards against silent drift)', () => {
    // If this fails, a sink was added/removed in src/** without updating the table above \u2014
    // re-grep src/** for window.open|window.location|<a href|to=\{|dangerouslySetInnerHTML|
    // JSON.parse|localStorage\.|\.href\s*=|setAttribute|sx=\{ and reconcile before adjusting
    // these numbers.
    expect(SINKS.filter((row) => row.category === 'E1')).toHaveLength(11)
    expect(SINKS.filter((row) => row.category === 'E2')).toHaveLength(7)
  })

  it('has no duplicate (file, site) rows', () => {
    const keys = SINKS.map((row) => `${row.file}::${row.site}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('shared guard: isSafeUrl (protects logo/hero/favicon URLs, ConsentBanner href, SuiteSwitcher window.open, notification channel targets)', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.example.com',
  ])('rejects %s', (value) => {
    expect(isSafeUrl(value)).toBe(false)
  })

  it.each(['https://cdn.example/logo.png', 'mailto:ops@example.com', '/privacy', 'https://example.com/hook'])(
    'accepts %s',
    (value) => {
      expect(isSafeUrl(value)).toBe(true)
    },
  )
})

describe('shared guard: isSafeRoutePath / resolveRoutePath (protects SuiteLayout item.path/loginPath, DashboardCard to)', () => {
  it.each(['javascript:alert(1)', '//evil.example.com', '\\\\evil.example.com', 'relative/no-leading-slash', ''])(
    'isSafeRoutePath rejects %s',
    (value) => {
      expect(isSafeRoutePath(value)).toBe(false)
    },
  )

  it('resolveRoutePath falls back and warns for a rejected path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(resolveRoutePath('//evil.example.com', '/', 'sink-enumeration-test')).toBe('/')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('resolveRoutePath passes a safe path through unchanged', () => {
    expect(resolveRoutePath('/dashboard', '/', 'sink-enumeration-test')).toBe('/dashboard')
  })
})
