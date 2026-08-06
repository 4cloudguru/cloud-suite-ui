// Strip embedded source text (sourcesContent) from the sourcemaps in dist/.
// Consumers keep useful stack traces (file/name/position mapping) while the
// published tarball stops shipping the entire source tree inside the maps —
// the public GitHub repo is the reference for source-level debugging.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exported so the strip logic can be unit-tested against a fixture map, without a real build.
export function stripSourcesContent(map) {
  if (!map.sourcesContent) return false
  delete map.sourcesContent
  return true
}

function main() {
  const dist = 'dist'
  // recursive: true so any future nested build output (e.g. per-entry-point
  // subdirectories) still gets its sourcemaps stripped, not just top-level files.
  for (const file of readdirSync(dist, { recursive: true })) {
    if (!file.endsWith('.map')) continue
    const path = join(dist, file)
    const map = JSON.parse(readFileSync(path, 'utf8'))
    if (stripSourcesContent(map)) {
      writeFileSync(path, JSON.stringify(map))
      console.log(`stripped sourcesContent from ${path}`)
    }
  }
}

// Only run the directory scan when executed directly (the build), not when imported by the test.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

