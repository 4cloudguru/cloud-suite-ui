# @4cloudguru/cloud-suite-ui

Shared UI foundation for the Terraform suite frontends
([terraform-registry-frontend](https://github.com/sethbacon/terraform-registry-frontend)
and [terraform-state-manager-frontend](https://github.com/sethbacon/terraform-state-manager-frontend)).
It centralises the look-and-feel and cross-cutting behaviour so both apps stay in
visual and behavioural parity from a single source of truth.

## What's inside

| Area           | Exports                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tokens**     | `BRAND_PRIMARY`, `SECONDARY_LIGHT`, `SECONDARY_DARK`, dark surfaces, font stack, `BORDER_RADIUS`, `RTL_LANGUAGES`                                                     |
| **Theme**      | `createAppTheme(mode, prefersReducedMotion, direction, overrides)`, `SuiteThemeProvider`, `useThemeMode`                                                              |
| **Identity**   | `AuthProvider` (parameterised by an `AuthApi`), `useAuth` (returns `hasScope`), `ADMIN_SCOPE`, `SESSION_WARNING_LEAD_MS`, `SessionExpiryWarning`, types               |
| **Consent**    | `ConsentProvider`, `useConsent`, `ConsentBanner`                                                                                                                      |
| **Components** | `PageHeader`, `DashboardCard`, `Page`, `NotificationChannelsSection`, `ApiKeyExpirySettingsCard`, `BrandingSettingsCard` (requires a host-supplied `validators` prop) |
| **Shell**      | `SuiteLayout` (parameterised by nav + branding + auth), `SuiteSwitcher`, nav types                                                                                    |
| **Utils**      | `isSafeUrl` (host-supplied URL guard for navigation / image sinks)                                                                                                    |

Framework packages (React, MUI, Emotion, i18next, react-router) are
**peer dependencies** — the consuming app provides a single copy at runtime.

## Develop

Requires Node `>=22.0.0 <25` (see `engines` in `package.json`).

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # tsup -> dist/ (ESM + .d.ts)
```

## Publishing (GitHub Packages)

Publishing is automated by [`.github/workflows/publish.yml`](.github/workflows/publish.yml):
create a GitHub Release tagged `vX.Y.Z` (matching `package.json`) and the workflow
builds, type-checks, tests, and runs `npm publish` to `https://npm.pkg.github.com`
using the repo's `GITHUB_TOKEN`.

**Integrity guarantees for consumers:**

- The publish job refuses to publish unless the triggering ref is exactly the git tag matching
  `package.json`'s version — a manual `workflow_dispatch` run against an arbitrary branch is
  rejected, not just discouraged. This tag/version check is the guarantee enforced by code in
  this repository. The job also targets a GitHub Environment (`release`); any human-review gate
  on that environment must be configured as a required-reviewer rule in repo **Settings** (not
  tracked in git), so independent-review protection is not guaranteed by this repository alone.
- Before `npm publish`, CI asserts the tarball (`npm pack --dry-run`) only contains `dist/` plus
  `package.json`/`README.md`/`LICENSE`/`NOTICE` — no source, tests, or config files ship.
- Every release generates [GitHub Artifact Attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
  — build provenance plus a CycloneDX SBOM — bound to the exact published npm tarball. Verify by
  fetching the tarball and checking it:

  ```bash
  npm pack @4cloudguru/cloud-suite-ui
  gh attestation verify --repo 4cloudguru/cloud-suite-ui ./4cloudguru-cloud-suite-ui-*.tgz
  ```

  Releases also carry [npm provenance](https://docs.npmjs.com/generating-provenance-statements),
  verifiable without the `gh` CLI:

  ```bash
  npm audit signatures
  ```

- CI runs `npm audit --audit-level=moderate` on every push/PR, and CodeQL (`javascript-typescript`)
  runs on every push/PR plus a weekly schedule (see [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml)).
- A [`commitlint`](https://commitlint.js.org/) check on every PR enforces Conventional Commits,
  since [release-please](.github/workflows/release-please.yml) derives version bumps solely from
  commit messages.

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

## Consuming (in each frontend)

The package is public on the npm registry, so no `.npmrc` or auth token is needed:

```bash
npm install @4cloudguru/cloud-suite-ui
```

```tsx
import { SuiteThemeProvider, PageHeader, useAuth } from '@4cloudguru/cloud-suite-ui'
```

> This package is a **build-time** dependency only; each app remains independently
> deployable. Wiring the two apps to consume it is intentionally a separate step.

> This package is **ESM-only** (`"type": "module"`, a single `import` export condition, no
> `require`) — consume it from an ESM build/toolchain. It also declares `engines.node`
> (`>=22.0.0 <25`); installing under an older/newer Node major is unsupported.

## Internationalization (i18n)

Every component resolves user-facing copy through `useTranslation()`'s `t(key, { defaultValue })`,
so a host app's i18next configuration owns translation and an incomplete bundle still renders
readable English.

`BrandingSettingsCard` layers a **host-supplied `strings` prop** on top of that same contract, for
apps that already have translated copy for their own field labels/help text and would rather pass
it straight through than duplicate it into an i18next bundle. Precedence per field is
`strings.fields[key]?.label ?? t('branding.fields.<key>.label', { defaultValue: '<English label>' })`
(and the same for `helperText`) — an app that supplies no `strings` entry for a field still gets a
translatable label/helper text via `t()`; supplying an entry with e.g. `errorText` but no
`helperText` intentionally renders no helper at all (the host is presumed to own that field's copy
outright), rather than falling back to the `t()`-resolved English.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the prop-contract stability convention that applies to
`BrandingSettingsCard`, `NotificationChannelsSection`, `ApiKeyExpirySettingsCard`, and
`UIThemeConfig` specifically — a separate concern from this section's translation contract, which
applies uniformly to every component.

## Security model

- **Token custody is the host app's responsibility.** `AuthProvider` is parameterised by an
  `AuthApi` your app implements (`getCurrentUser`/`login`/`logout`/`refreshToken`/etc.) — this
  library never reads or writes a token/cookie itself. Prefer an HttpOnly cookie over storing a
  bearer token in `localStorage`/`sessionStorage` if your backend supports it.
- **`onClearStorage` is how you clear YOUR app's cached auth data when the session ends** — on
  explicit logout AND when the session fails closed (a 401, a lapsed session, or a malformed
  `/me` response). Pass it whenever your app caches anything auth-related (a bearer token, query
  data keyed to the signed-in user) outside of `AuthProvider`'s own React state.
- **`hasScope`/`allowedScopes` are UI-visibility gates only — NOT an authorization boundary.**
  They hide/show nav items and affordances client-side; every backend endpoint must
  independently re-enforce authorization on every request regardless of what the client believes.
  The special `ADMIN_SCOPE` (`'admin'`) wildcard mirrors the backend's own admin-wildcard
  convention — do not rely on it as a security control in this library.
- **`refreshSession()` logs out on failure** (a failed token refresh clears the session rather
  than leaving a stale/ambiguous state); `authError` on the auth context is a sanitized,
  display-safe string describing the most recent failed session-resolution call — never the raw
  error object, response body, headers, or URLs — if your app wants to distinguish a network blip
  from a real "not logged in" state.
- Pass an app-specific `storageKey` to `ConsentProvider`/`SuiteThemeProvider`, and an app-specific
  `groupStateStorageKey` to `SuiteLayout`, if your app shares an origin with a sibling suite app —
  the default keys are generic and will collide otherwise (all three log a one-time console
  warning if you don't). `SuiteLayout` clears its own persisted nav-group state on every
  transition to unauthenticated; consent preferences deliberately survive, since a consent
  decision is origin-scoped rather than session-scoped.
- **`isSafeUrl` is the URL guard the shared components apply to host-supplied URLs** before using
  them for navigation (`SuiteSwitcher`) or image sinks (`SuiteLayout`/`SuiteThemeProvider`
  branding). It is exported so your app can apply the same allowlist (http/https/mailto/tel and
  relative paths only) to any backend- or user-influenced URL at its own boundary. Compose rather
  than re-derive it — an app that needs a narrower rule should call `isSafeUrl` first and layer its
  own check on top, so a future fix to the shared parsing logic reaches every consumer:

  ```ts
  export function isSafeExternalUrl(value: string | null | undefined): value is string {
    if (!isSafeUrl(value)) return false // shared base allowlist + normalisation
    if (/^[/#.]/.test(value.trim())) return true // relative — already screened above
    return new URL(value.trim()).protocol === 'https:' // app-specific narrowing
  }
  ```

- Route props (`SuiteLayout`'s `NavItem.path` and `loginPath`, `DashboardCard`'s `to`) must be
  in-app paths beginning with `/`. Anything absolute or protocol-relative is rejected with a
  console warning and falls back to `/`.
