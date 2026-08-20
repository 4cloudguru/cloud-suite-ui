# Security Policy

## Supported Versions

This package follows [semantic versioning](https://semver.org/) and is released from a single
`main` branch (see [CHANGELOG.md](CHANGELOG.md)). Only the latest published `0.x` version is
supported; please upgrade before reporting an issue against an older version.

## Past Fixes

[CHANGELOG.md](CHANGELOG.md)'s `0.5.3` entry, "address 2026-07-10 security audit findings (2 high,
16 medium, misc low)", fixed findings from an internal security review — see the
[v0.5.3 release](https://github.com/4cloudguru/cloud-suite-ui/releases/tag/v0.5.3) for the
linked fix commits. Apps on an older `0.x` version should upgrade.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for a security vulnerability.

Instead, use [GitHub's private vulnerability reporting](https://github.com/4cloudguru/cloud-suite-ui/security/advisories/new)
for this repository, or contact the maintainer directly. Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal repro is very helpful)
- Any suggested remediation, if you have one

We will acknowledge receipt as soon as possible and aim to provide an initial assessment within a
few business days. Because `@4cloudguru/cloud-suite-ui` is consumed by both suite frontends
(`terraform-registry-frontend`, `terraform-state-manager-frontend`), a confirmed vulnerability
here may affect both apps — please give us a reasonable window to release a fix before any public
disclosure.

## Release Automation Trust Anchor

Releases are cut by a GitHub App, not a personal access token. The token is minted by
`actions/create-github-app-token` inside the SHARED release-please workflow that
[release-please.yml](.github/workflows/release-please.yml) calls — that file is a caller and no
longer contains the token step itself, so an audit has to follow its pinned `uses:` line. The App
should be installed **only on this repository** (not org-wide) and granted the minimum
permissions release-please needs (`contents: write`, `pull-requests: write`); it should not hold
`packages: write` or any other scope — publishing to the registry is a separate step, gated behind
the `release` environment, in [publish.yml](.github/workflows/publish.yml). If you are auditing
this repository's supply chain, verify the App's installation scope from the organization's
GitHub App settings, since it is not something this repository's own files can assert about
themselves.

## Dependency Override: `esbuild` Pinned Under `tsup`

`package.json`'s `overrides` block forces the `esbuild` copy nested under `tsup` to `^0.28.1`.
Commit `cb79b95` ("pin esbuild to patched 0.28.1") added this to patch
[GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) ("esbuild allows
arbitrary file read when running the development server on Windows", low severity, CWE-22),
which affects `esbuild` `>=0.27.3 <0.28.1`. It is still needed: `tsup@8.5.1` alone resolves its
private `esbuild` dependency to `0.27.7` — inside the vulnerable range — and `npm audit` reports
that one low-severity finding with the override removed; with it in place, `npm audit` is clean.
The override is scoped under `tsup` rather than applied flatly so it only rewrites `tsup`'s own
build-time dependency, not every `esbuild` in the graph.

`tsup@8.5.1` itself still declares `"esbuild": "^0.27.0"`, so the override installs a version
outside what `tsup` asked for. This is accepted: `esbuild` is a `tsup` build-time dependency only
(it is never shipped to consumers of this package), the override is a patch-level security bump
with no breaking change to the CLI/API surface `tsup` uses, and this repository's own `build`,
`test`, and `typecheck` jobs exercise `tsup` against the overridden `0.28.1` on every run. Drop
the override once `tsup` bumps its own declared range past `0.28.1`.

## Shared CI workflows

Part of this repository's CI is **defined in another repository** — [`4cloudguru/shared-workflows`](https://github.com/4cloudguru/shared-workflows) — and called from `.github/workflows/`. That is a real supply-chain relationship, and it is recorded here so an audit of this repository does not stop at this repository's own tree.

**What runs, and where it is pinned.** Each caller in `.github/workflows/` names the shared workflow on its `uses:` line, pinned to a full 40-hex commit SHA with a trailing comment naming the release that SHA is. The tag is a label; the SHA is what runs. An unlabelled SHA is rejected by the workflow-hardening gate, because a bare 40-hex ref cannot be reviewed or updated deliberately.

**Why the pins have to agree across repositories.** A shared definition drifts differently from a duplicated file: every repository looks like it is using "the shared one" while sitting on different commits, which is *harder* to see than divergent files, not easier. A signature in `security-orchestration` (`shared-workflow-pin-parity`) reports **disagreement** between callers of the same shared workflow — it reports disagreement rather than staleness, because a repository deliberately held back is a decision while N repositories disagreeing without anyone deciding is drift.

**What the shared repository is itself protected by.** Its `main` requires its own zizmor and actionlint checks with `enforce_admins` enabled, restricts which third-party actions may run to an explicit allowlist, issues a read-only default `GITHUB_TOKEN`, and runs the workflow-hardening gate against itself.

**What this repository still controls.** Triggers, concurrency, and the secrets it passes. Secrets are passed **by name** — never `secrets: inherit`, which would forward every secret in this repository to a workflow owned by someone else. Any `vars.*` a shared workflow reads resolve against **this** repository, so credentials and their installation scope do not move.
