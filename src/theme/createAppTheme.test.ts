import { describe, expect, it, vi } from 'vitest'
import { recomposeColor } from '@mui/material/styles'
import { createAppTheme } from './createAppTheme'
import { BRAND_PRIMARY, DARK_BG_DEFAULT } from '../tokens'

// Wraps the real recomposeColor in a spy that forwards to the actual implementation by
// default, so every test below keeps exercising real MUI colour canonicalisation — only
// the one test that calls mockImplementationOnce below ever sees different behaviour.
vi.mock('@mui/material/styles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mui/material/styles')>()
  return { ...actual, recomposeColor: vi.fn(actual.recomposeColor) }
})

describe('createAppTheme', () => {
  it('uses the brand primary by default', () => {
    expect(createAppTheme('light').palette.primary.main).toBe(BRAND_PRIMARY)
  })

  it('applies dark surfaces in dark mode', () => {
    expect(createAppTheme('dark').palette.background.default).toBe(DARK_BG_DEFAULT)
  })

  it('honours colour overrides, canonicalised through MUI recompose/decompose', () => {
    // '#123456' is a valid override, but the palette/CSS only ever see MUI's own
    // canonical re-serialisation of it, never the raw host string — see
    // normalizeThemeColor. recomposeColor(decomposeColor('#123456')) === 'rgb(18, 52, 86)'.
    const theme = createAppTheme('light', false, 'ltr', { primary: '#123456' })
    expect(theme.palette.primary.main).toBe('rgb(18, 52, 86)')
  })

  it('sets the text direction', () => {
    expect(createAppTheme('light', false, 'rtl').direction).toBe('rtl')
  })

  it('disables transitions when reduced motion is requested', () => {
    expect(createAppTheme('light', true).transitions.create()).toBe('none')
  })

  it('falls back to the built-in token for a regex-shaped but unparseable colour', () => {
    // These pass a naive /^(rgb|rgba|hsl|hsla|color)\(/ prefix check but MUI's
    // decomposeColor throws on them inside createTheme — the exact class of value
    // that used to white-screen the app (issue #79).
    for (const evil of ['color(display-p4 1 1 1)', 'color(evilspace 1 2 3)']) {
      const theme = createAppTheme('light', false, 'ltr', { primary: evil })
      expect(theme.palette.primary.main).toBe(BRAND_PRIMARY)
    }
  })

  it('accepts a valid color() value in a supported colour space', () => {
    const theme = createAppTheme('light', false, 'ltr', { primary: 'color(display-p3 0.5 0.3 0.2)' })
    expect(theme.palette.primary.main).toBe('color(display-p3 0.5 0.3 0.2)')
  })

  it('still rejects plainly invalid colours (named colours, missing #)', () => {
    for (const bad of ['not-a-color', 'red', '123456']) {
      const theme = createAppTheme('light', false, 'ltr', { primary: bad })
      expect(theme.palette.primary.main).toBe(BRAND_PRIMARY)
    }
  })

  it('never throws for any override shape (defensive net)', () => {
    // Even if a value somehow slips past validation, createAppTheme must return
    // a usable theme rather than crash the app render tree.
    for (const v of ['color(', 'rgb(', 'hsl(banana)', '#zzz', '']) {
      expect(() => createAppTheme('dark', false, 'ltr', { primary: v })).not.toThrow()
    }
  })

  describe('CSS-breakout rejection (issue #96)', () => {
    // Table-driven: every payload shape that could break out of the ':root' custom
    // property / palette.primary.main CSS value must be rejected outright (falls back
    // to BRAND_PRIMARY) rather than reaching createTheme or the stylesheet at all.
    it.each([
      [
        'the exact breakout payload from the issue',
        'rgb(0,0,0);}html{filter:invert(1)}#pwn{background:url(https://attacker.example/beacon)',
      ],
      ['a shorter } / { breakout', 'rgb(0,0,0);}html{display:none}#x{'],
      ['a bare url() reference with no other syntax chars', 'url(https://attacker.example/x.css)'],
      ['an angle-bracket payload', 'red<style>html{display:none}</style>'],
      ['a backslash escape payload', 'red\\;}body{display:none}'],
    ])('rejects %s and falls back to the brand token', (_label, payload) => {
      const theme = createAppTheme('light', false, 'ltr', { primary: payload })
      expect(theme.palette.primary.main).toBe(BRAND_PRIMARY)
      expect(theme.palette.primary.main).not.toContain('}')
    })

    it('never lets the breakout payload reach the :root custom property either', () => {
      const theme = createAppTheme('light', false, 'ltr', {
        primary: 'rgb(0,0,0);}html{display:none}#x{',
      })
      const cssBaseline = (
        theme.components?.MuiCssBaseline?.styleOverrides as
          | { ':root'?: Record<string, string> }
          | undefined
      )?.[':root']
      expect(cssBaseline?.['--brand-primary']).toBe(BRAND_PRIMARY)
      expect(cssBaseline?.['--brand-primary']).not.toContain('}')
    })
  })

  it('falls back to the built-in token if canonicalisation ever produces something createTheme rejects (defensive net)', () => {
    // recomposeColor/decomposeColor round-trip every value MUI's own createTheme accepts today,
    // so this path is not naturally reachable with a real colour string (confirmed: 'not-a-real-
    // color' makes MUI's own createTheme throw "Unsupported color", the same as any other
    // unparseable string) — this proves the outer try/catch fallback in createAppTheme still
    // works if a future MUI version's recomposeColor ever produced something createTheme itself
    // rejects, by forcing exactly that for one call.
    vi.mocked(recomposeColor).mockImplementationOnce(() => 'not-a-real-color')
    const theme = createAppTheme('light', false, 'ltr', { primary: '#123456' })
    expect(theme.palette.primary.main).toBe(BRAND_PRIMARY)
  })
})
