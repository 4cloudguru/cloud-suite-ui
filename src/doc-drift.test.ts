import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Guards the #108 defect class: a README claim that silently drifts from the package.json/ci.yml
// value it describes, or a barrel export the README's "What's inside" table never picked up.
// Every check re-derives the real value from its source of truth instead of hardcoding an
// expected string, so it keeps catching drift the next time either side changes.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const readRepoFile = (relativePath: string): string => readFileSync(path.join(ROOT, relativePath), 'utf8')

const pkg = JSON.parse(readRepoFile('package.json')) as { engines?: { node?: string } }
const readme = readRepoFile('README.md')
const ci = readRepoFile('.github/workflows/ci.yml')

describe('README does not drift from package.json / ci.yml (#108)', () => {
  it('every backtick-quoted "engines" Node range in README matches package.json exactly', () => {
    const enginesRange = pkg.engines?.node
    expect(enginesRange, 'package.json engines.node must be set for this check to be meaningful').toBeTruthy()
    const quotedRanges = [...readme.matchAll(/`(>=\d+\.\d+\.\d+ <\d+)`/g)].map((m) => m[1])
    expect(quotedRanges.length, 'README should quote the engines range at least once').toBeGreaterThan(0)
    for (const quoted of quotedRanges) {
      expect(quoted).toBe(enginesRange)
    }
  })

  it('the npm audit --audit-level README advertises matches the one ci.yml actually runs', () => {
    const ciMatch = ci.match(/npm audit --audit-level=(\S+)/)
    expect(ciMatch, 'ci.yml must run npm audit for this check to be meaningful').toBeTruthy()
    expect(readme).toContain(`npm audit --audit-level=${ciMatch![1]}`)
  })
})

describe('every named component/hook/provider export appears in the README "What\'s inside" table (#108 E3)', () => {
  // Areas whose barrel re-exports every value 1:1 by name in the table today. Tokens is
  // deliberately excluded: it paraphrases a few constants ("dark surfaces", "font stack") by
  // established convention rather than naming every one.
  const barrelFiles = [
    'src/components/index.ts',
    'src/identity/index.ts',
    'src/consent/index.ts',
    'src/shell/index.ts',
    'src/theme/index.ts',
    'src/utils/index.ts',
  ]

  const valueExportNames = barrelFiles.flatMap((relativePath) => {
    const content = readRepoFile(relativePath)
    return [...content.matchAll(/^export \{([^}]+)\} from/gm)].flatMap((m) =>
      m[1]
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    )
  })

  it('the enumeration itself found every barrel\'s exports (a regex change should not silently empty this list)', () => {
    expect(valueExportNames.length).toBeGreaterThanOrEqual(barrelFiles.length)
  })

  it.each(valueExportNames)('%s is named in README.md', (name) => {
    // Accept either a bare `name` or a documented call signature `name(...)` — the table quotes
    // createAppTheme with its parameters. Anything else means the export is genuinely missing.
    const documented = new RegExp('`' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[`(]')
    expect(readme).toMatch(documented)
  })
})
