# Contributing

## Prop-contract stability for backend-bound admin components

`BrandingSettingsCard`, `NotificationChannelsSection`, `ApiKeyExpirySettingsCard`, and
`UIThemeConfig` (the whitelabel config type shared by `SuiteThemeProvider` and
`BrandingSettingsCard`) each encode a specific backend feature's domain model in their exported
prop/value types, unlike the generic `PageHeader`/`DashboardCard`/`Page`. Both
[terraform-registry-frontend](https://github.com/sethbacon/terraform-registry-frontend) and
[terraform-state-manager-frontend](https://github.com/sethbacon/terraform-state-manager-frontend)
render all three components and import `UIThemeConfig` directly, so the extraction was not
premature — but they already supply divergent domain vocabularies for the parts each backend
owns. For example, `NotificationChannelsSection`'s host-supplied `events` options are
`module_published` / `approval_pending` / `cve_detected` / `scanner_update_available` in
terraform-registry-frontend and `drift_detected` / `run_failed` in
terraform-state-manager-frontend (verified directly against each app's source, not assumed).

**Treat a prop-contract change to any of these four exports as breaking.** A change to (e.g.)
`NotificationChannelListItem`, `ApiKeyExpirySettingsValue`, or `UIThemeConfig` cannot be exercised
by only one consumer — it forces a synchronized review, and in practice a synchronized release,
across both consumer repos. Before changing one of these types:

- Check both consumer repos for every place they import the changed type and every prop they
  currently pass to a component driven by it.
- An additive change (a new optional field) still warrants a coordinated release, but is lower
  risk than a required-field addition, removal, or rename.
- A required-field/removal/rename change is this package's own breaking change (a `feat!:` /
  `BREAKING CHANGE:` commit — see `commitlint.config.cjs`); land the corresponding consumer-side
  changes in the same release window.
- If either consumer app's domain model diverges further from the shared shape, re-evaluate
  whether the component should grow a more generic slot/prop, or whether the marginal duplication
  of per-app copies would now be cheaper than the shared-versioning coordination cost.

`AuthProvider`'s `AuthApi`/`MeResponse` contract is a deliberate exception to this class, not a
missed instance of it: each host app implements `AuthApi.getCurrentUser()` itself and adapts its
own backend's response into `MeResponse` (terraform-registry-frontend's `toSyntheticMemberships`
is a concrete example — it synthesizes a membership array because the registry backend has no
real multi-org concept). `MeResponse` is this library's own abstract contract that any backend can
be adapted to fit, not a direct mirror of one backend's response shape the way the four exports
above are.

## House style

- 2-space indent, no semicolons, single quotes, arrow callbacks, `export function`/
  `export const ... : React.FC` for components — match the surrounding file's formatting exactly.
- JSDoc on exported props/types; elsewhere, short "why" comments only. Avoid comments that restate
  the next line, and avoid file-header doc blocks on files that don't already have one.
- Tests live next to source as `<Name>.test.tsx` / `<Name>.test.ts`, using `describe`/`it`,
  `@testing-library/react`'s `render`, and `userEvent` where a real click matters. Never weaken or
  delete an existing test to make a change pass — extend it instead.
- User-facing strings resolve through `useTranslation()`'s `t(key, { defaultValue })` — see the
  [Internationalization](README.md#internationalization-i18n) section of the README for the one
  documented exception (`BrandingSettingsCard`'s host-supplied `strings` override layer).
- A new required prop is a breaking change — prefer optional + a dev-mode `console.warn` (mirroring
  `warnIfDefaultKey` in `src/utils/storage.ts`) instead.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`,
  `docs:`, `refactor:`, `test:`, `ci:`, `chore:`); `commitlint` enforces this on every PR.
  `package.json`'s `version` and `CHANGELOG.md` are owned by
  [release-please](https://github.com/googleapis/release-please) — don't edit either by hand.
