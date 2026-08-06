import { describe, expect, it } from 'vitest'
import { stripSourcesContent } from './strip-sourcemap-sources.mjs'

describe('stripSourcesContent', () => {
  it('removes sourcesContent from a map that has it', () => {
    const map = {
      version: 3,
      sources: ['../src/index.ts'],
      sourcesContent: ['export const x = 1'],
      mappings: 'AAAA',
    }

    expect(stripSourcesContent(map)).toBe(true)
    expect(map.sourcesContent).toBeUndefined()
  })

  it('leaves a map without sourcesContent untouched and reports no change', () => {
    const map = { version: 3, sources: ['../src/index.ts'], mappings: 'AAAA' }

    expect(stripSourcesContent(map)).toBe(false)
    expect(map).not.toHaveProperty('sourcesContent')
  })
})
