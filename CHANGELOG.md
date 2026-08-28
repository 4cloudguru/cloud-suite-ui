# Changelog

All notable changes to this project are documented in this file. It is maintained
automatically by [release-please](https://github.com/googleapis/release-please)
from [Conventional Commits](https://www.conventionalcommits.org/).

## [0.11.0](https://github.com/4cloudguru/cloud-suite-ui/compare/v0.10.0...v0.11.0) (2026-08-28)


### Features

* **identity:** let a platform administrator name the organization they act in ([#177](https://github.com/4cloudguru/cloud-suite-ui/issues/177)) ([c6e61a9](https://github.com/4cloudguru/cloud-suite-ui/commit/c6e61a9e64f4ade479c13501fe82c288389e77ac))


### Documentation

* point at the estate tenancy model ([#174](https://github.com/4cloudguru/cloud-suite-ui/issues/174)) ([35f2ad9](https://github.com/4cloudguru/cloud-suite-ui/commit/35f2ad9aa7c21c9b43bc8b269a5a965124661517))

## [0.10.0](https://github.com/4cloudguru/cloud-suite-ui/compare/v0.9.2...v0.10.0) (2026-08-21)


### Features

* **identity:** let a user choose the organization they are acting in ([#164](https://github.com/4cloudguru/cloud-suite-ui/issues/164)) ([d812445](https://github.com/4cloudguru/cloud-suite-ui/commit/d812445c8bc7919b35f04b79365be21fa3554d45))

## [0.9.2](https://github.com/4cloudguru/cloud-suite-ui/compare/v0.9.1...v0.9.2) (2026-08-21)


### Bug Fixes

* **ci:** refuse to run signature-replay when Dependabot edited the workflow ([#153](https://github.com/4cloudguru/cloud-suite-ui/issues/153)) ([b4ea2fd](https://github.com/4cloudguru/cloud-suite-ui/commit/b4ea2fd8d175d56aa0ec5e10cabfbe97c15459ba))


### Documentation

* **security:** record the shared-workflow trust relationship, and fix what it invalidated ([#160](https://github.com/4cloudguru/cloud-suite-ui/issues/160)) ([ad3d423](https://github.com/4cloudguru/cloud-suite-ui/commit/ad3d423f1d3145e00e398125496bcd37474d25ba))

## [0.9.1](https://github.com/4cloudguru/cloud-suite-ui/compare/v0.9.0...v0.9.1) (2026-08-12)


### Bug Fixes

* **ci:** spend the replay credential on the one private checkout only ([#139](https://github.com/4cloudguru/cloud-suite-ui/issues/139)) ([1acdbf4](https://github.com/4cloudguru/cloud-suite-ui/commit/1acdbf46b5ba819c74e6b7685f8c3d0065340f80))

## [0.9.0](https://github.com/4cloudguru/cloud-suite-ui/compare/v0.8.1...v0.9.0) (2026-08-12)


### ⚠ BREAKING CHANGES

* the package is renamed from @sethbacon/terraform-suite-ui to @4cloudguru/cloud-suite-ui, and now resolves from registry.npmjs.org rather than npm.pkg.github.com. Consumers must update the dependency name, and may delete their .npmrc scope line and NODE_AUTH_TOKEN wiring, because the package is public and needs no authentication to install. Previously published @sethbacon versions remain resolvable, so nothing breaks until a consumer chooses to move.

### Features

* republish as @4cloudguru/cloud-suite-ui on npmjs ([#136](https://github.com/4cloudguru/cloud-suite-ui/issues/136)) ([43aad40](https://github.com/4cloudguru/cloud-suite-ui/commit/43aad404d8190aadcda1e97f824dea2d59e4941d))


### Bug Fixes

* **ci:** check out the two ADO extension repos the replay gate requires ([#133](https://github.com/4cloudguru/cloud-suite-ui/issues/133)) ([b3b3764](https://github.com/4cloudguru/cloud-suite-ui/commit/b3b3764943dcbcebce392a1bccd54ef3d925cc43))
* **ci:** repair the empty `with:` blocks that broke five workflows at startup ([#131](https://github.com/4cloudguru/cloud-suite-ui/issues/131)) ([6132bea](https://github.com/4cloudguru/cloud-suite-ui/commit/6132bea61101e4256de05f8754d0caa8372f8982))

## [0.8.1](https://github.com/sethbacon/terraform-suite-ui/compare/v0.8.0...v0.8.1) (2026-08-07)


### Bug Fixes

* **ci:** stop requesting an App-token permission the installation lacks ([#127](https://github.com/sethbacon/terraform-suite-ui/issues/127)) ([6d6b6a3](https://github.com/sethbacon/terraform-suite-ui/commit/6d6b6a3dd2c8a44ce357f2e85114dcab1c7f44cd))
* **identity:** apply the session guards consistently on every async path ([#120](https://github.com/sethbacon/terraform-suite-ui/issues/120)) ([7ee4b58](https://github.com/sethbacon/terraform-suite-ui/commit/7ee4b58124d0d8e96ee00df222f5957298263c8f)), closes [#98](https://github.com/sethbacon/terraform-suite-ui/issues/98) [#99](https://github.com/sethbacon/terraform-suite-ui/issues/99) [#100](https://github.com/sethbacon/terraform-suite-ui/issues/100) [#103](https://github.com/sethbacon/terraform-suite-ui/issues/103) [#104](https://github.com/sethbacon/terraform-suite-ui/issues/104) [#112](https://github.com/sethbacon/terraform-suite-ui/issues/112)
* validate host-supplied values at every trust boundary and navigation sink ([#121](https://github.com/sethbacon/terraform-suite-ui/issues/121)) ([9de5100](https://github.com/sethbacon/terraform-suite-ui/commit/9de51005827583801b5aa06e7f12c3e2bdf16bcf)), closes [#96](https://github.com/sethbacon/terraform-suite-ui/issues/96) [#101](https://github.com/sethbacon/terraform-suite-ui/issues/101) [#109](https://github.com/sethbacon/terraform-suite-ui/issues/109) [#110](https://github.com/sethbacon/terraform-suite-ui/issues/110) [#111](https://github.com/sethbacon/terraform-suite-ui/issues/111) [#113](https://github.com/sethbacon/terraform-suite-ui/issues/113) [#116](https://github.com/sethbacon/terraform-suite-ui/issues/116)


### Documentation

* correct the drifted README claims and record the contracts ([#123](https://github.com/sethbacon/terraform-suite-ui/issues/123)) ([cd20722](https://github.com/sethbacon/terraform-suite-ui/commit/cd207224fcba2350b51c35f863178893b8bbdafb)), closes [#108](https://github.com/sethbacon/terraform-suite-ui/issues/108) [#115](https://github.com/sethbacon/terraform-suite-ui/issues/115) [#118](https://github.com/sethbacon/terraform-suite-ui/issues/118)


### Refactor

* **shell:** decompose SuiteLayout and NotificationChannelsSection ([#125](https://github.com/sethbacon/terraform-suite-ui/issues/125)) ([3ce8d6d](https://github.com/sethbacon/terraform-suite-ui/commit/3ce8d6dd869cc00d19612c71fe9e54600ead5b9b)), closes [#114](https://github.com/sethbacon/terraform-suite-ui/issues/114)

## [0.8.0](https://github.com/sethbacon/terraform-suite-ui/compare/v0.7.1...v0.8.0) (2026-08-01)


### Features

* **components:** add BrandingSettingsCard ([#92](https://github.com/sethbacon/terraform-suite-ui/issues/92)) ([3c37f61](https://github.com/sethbacon/terraform-suite-ui/commit/3c37f61ebdb1264b2ea541da1826d6ea52fc9b8e))

## [0.7.1](https://github.com/sethbacon/terraform-suite-ui/compare/v0.7.0...v0.7.1) (2026-07-31)


### Bug Fixes

* **identity:** hydrate the session under StrictMode's dev double-mount ([#89](https://github.com/sethbacon/terraform-suite-ui/issues/89)) ([40b19a4](https://github.com/sethbacon/terraform-suite-ui/commit/40b19a49bf40509985d89c1a6a9bce8dd0b1de23))

## [0.7.0](https://github.com/sethbacon/terraform-suite-ui/compare/v0.6.1...v0.7.0) (2026-07-23)


### ⚠ BREAKING CHANGES

* AuthContextType.authError changed from unknown to string | null. Hosts that inspected the raw error object must switch to the message string (no known consumers do — both suite frontends were grepped). NavItem.scope: string | null -> scope?: string | null is source-compatible for all existing consumers.

### Features

* sanitize authError to a string, make NavItem.scope optional, widen Node engines ([#85](https://github.com/sethbacon/terraform-suite-ui/issues/85)) ([e0fba2a](https://github.com/sethbacon/terraform-suite-ui/commit/e0fba2a7105ac6d04ac74a3066772dd3e3de64b8))


### Bug Fixes

* **theme,components:** validate whitelabel colours with MUI's parser; re-seed expiry card on value change ([#81](https://github.com/sethbacon/terraform-suite-ui/issues/81)) ([2d17d03](https://github.com/sethbacon/terraform-suite-ui/commit/2d17d03930fd582e970a9cfd2b3034fd1e3db366))

## [0.6.1](https://github.com/sethbacon/terraform-suite-ui/compare/v0.6.0...v0.6.1) (2026-07-21)


### Bug Fixes

* **shell:** make SuiteSwitcher reuse one tab per sibling regardless of origin ([#77](https://github.com/sethbacon/terraform-suite-ui/issues/77)) ([49e0855](https://github.com/sethbacon/terraform-suite-ui/commit/49e0855991a6ead27ba5858907d16e7a7641cdc2))

## [0.6.0](https://github.com/sethbacon/terraform-suite-ui/compare/v0.5.4...v0.6.0) (2026-07-18)


### Features

* **components:** add NotificationChannelsSection and ApiKeyExpirySettingsCard ([9692107](https://github.com/sethbacon/terraform-suite-ui/commit/96921073cf470ed6abb992cb06e371fc275e32b1))

## [0.5.4](https://github.com/sethbacon/terraform-suite-ui/compare/v0.5.3...v0.5.4) (2026-07-14)


### Bug Fixes

* **ci:** correct dependabot schedule interval from biweekly to weekly ([#44](https://github.com/sethbacon/terraform-suite-ui/issues/44)) ([0742715](https://github.com/sethbacon/terraform-suite-ui/commit/0742715bcc97ecb016b854f1ce08578c3ecc9ba2))
* **ci:** ignore major TypeScript bumps in dependabot config ([#47](https://github.com/sethbacon/terraform-suite-ui/issues/47)) ([0e28a60](https://github.com/sethbacon/terraform-suite-ui/commit/0e28a6038799687dd7e8740a04b86bb7fb7c230e))

## [0.5.3](https://github.com/sethbacon/terraform-suite-ui/compare/v0.5.2...v0.5.3) (2026-07-11)


### Bug Fixes

* address 2026-07-10 security audit findings (2 high, 16 medium, misc low) ([f847427](https://github.com/sethbacon/terraform-suite-ui/commit/f847427412858c43c90714818466b3406a4af6e4))
* **ci:** relax commitlint body-max-line-length rule ([4ed035c](https://github.com/sethbacon/terraform-suite-ui/commit/4ed035cb03a74d2733d97127ba27e97e1cec32ac))
* harden identity, shell, consent and theme modules per security audit ([6c36deb](https://github.com/sethbacon/terraform-suite-ui/commit/6c36deb587704eea81f42107aa82c498ec160eef))


### Documentation

* add SECURITY.md and a security-model section to README ([a4969a5](https://github.com/sethbacon/terraform-suite-ui/commit/a4969a5e2614a9f1b846417b8cd720dc00638dd3))

## [0.5.2](https://github.com/sethbacon/terraform-suite-ui/compare/v0.5.1...v0.5.2) (2026-06-30)


### Bug Fixes

* **shell:** left-align nested page Containers in content area ([013c05c](https://github.com/sethbacon/terraform-suite-ui/commit/013c05cbc2c2dfdaf0e11a19c10c90d0eb4a6081))
* **shell:** left-align nested page Containers in content area ([7b58330](https://github.com/sethbacon/terraform-suite-ui/commit/7b583301d99080aacf359389c2267bcffb67bc59))

## [0.5.1](https://github.com/sethbacon/terraform-suite-ui/compare/v0.5.0...v0.5.1) (2026-06-30)


### Bug Fixes

* **shell:** show user name and email in the account menu ([54d719e](https://github.com/sethbacon/terraform-suite-ui/commit/54d719e2d17b0f90a3dfa63987ed49ab6c448412))
* **shell:** show user name and email in the account menu ([4a1755d](https://github.com/sethbacon/terraform-suite-ui/commit/4a1755d52f6af3ccca89c22fb78fb7223daa461c))

## [0.5.0](https://github.com/sethbacon/terraform-suite-ui/compare/v0.4.1...v0.5.0) (2026-06-30)


### Features

* **shell:** render the whitelabel logo as the SuiteLayout brand ([73f88b9](https://github.com/sethbacon/terraform-suite-ui/commit/73f88b9cf067705d47e9f3f6dcdce8c4dd372871))
* **shell:** render the whitelabel logo as the SuiteLayout brand ([e66e16f](https://github.com/sethbacon/terraform-suite-ui/commit/e66e16f2ce0d6d5f740f0a77fef41c9827f67467))

## [0.4.1](https://github.com/sethbacon/terraform-suite-ui/compare/v0.4.0...v0.4.1) (2026-06-30)


### Bug Fixes

* **shell:** left-align SuiteLayout content container ([0185b78](https://github.com/sethbacon/terraform-suite-ui/commit/0185b781785bb1fec4287d0cdbd3e917c33917d3))
* **shell:** left-align SuiteLayout content container ([8b13771](https://github.com/sethbacon/terraform-suite-ui/commit/8b137719cafc96fa11da898c842ffad8a83126dd))

## [0.4.0](https://github.com/sethbacon/terraform-suite-ui/compare/v0.3.0...v0.4.0) (2026-06-29)


### Features

* **shell:** add content slots, Suspense, standalone nav items, persisted groups to SuiteLayout ([c0df035](https://github.com/sethbacon/terraform-suite-ui/commit/c0df0355fab4ab0730a9cb9fcbaf2184cb325e57))
* **shell:** content slots, Suspense, standalone nav items + persisted groups for SuiteLayout ([a92e1df](https://github.com/sethbacon/terraform-suite-ui/commit/a92e1df4b67cc3e5c8428656579f0ac919a68612))

## [0.3.0](https://github.com/sethbacon/terraform-suite-ui/compare/v0.2.0...v0.3.0) (2026-06-29)


### Features

* **shell:** add settingsMenu mode + supportMenu slot to SuiteLayout ([b50a381](https://github.com/sethbacon/terraform-suite-ui/commit/b50a381b86811e6ef7043d39f32c2f6c7d5a0cc2))
* **shell:** add settingsMenu mode and supportMenu slot to SuiteLayout ([3836ab9](https://github.com/sethbacon/terraform-suite-ui/commit/3836ab9928771ec4c946fe6b7fe849f367e5aafc))

## [0.2.0](https://github.com/sethbacon/terraform-suite-ui/compare/v0.1.0...v0.2.0) (2026-06-29)


### Features

* **shell:** direct-open SuiteSwitcher with single-tab reuse ([fdda204](https://github.com/sethbacon/terraform-suite-ui/commit/fdda204572aafc170f3302b91d5c478735058836))
* **shell:** direct-open SuiteSwitcher with single-tab reuse ([1c5ef83](https://github.com/sethbacon/terraform-suite-ui/commit/1c5ef83169690f35ff3209fe54bafbd22b6d144e))

## 0.1.0

Initial release of the shared UI foundation for the Terraform suite frontends:

- **tokens** — brand colours, dark surfaces, font stack, border radius, RTL languages.
- **theme** — `createAppTheme`, `SuiteThemeProvider` (RTL + system theme + whitelabel), `useThemeMode`.
- **identity** — `AuthProvider` (driven by an injected `AuthApi`), `useAuth`, `SessionExpiryWarning`.
- **consent** — `ConsentProvider`, `ConsentBanner`.
- **components** — `PageHeader` (with icon), `DashboardCard`, `Page`.
- **shell** — `SuiteLayout`, `SuiteSwitcher`, nav types.
