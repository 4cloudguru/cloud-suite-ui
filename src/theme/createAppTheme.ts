import { createTheme, decomposeColor, recomposeColor, type Theme } from '@mui/material/styles'
import {
  BORDER_RADIUS,
  BRAND_PRIMARY,
  DARK_BG_DEFAULT,
  DARK_BG_PAPER,
  FONT_FAMILY,
  SECONDARY_DARK,
  SECONDARY_LIGHT,
} from '../tokens'
import type { Direction, ThemeMode, ThemeOverrides } from './types'

// A runtime whitelabel colour override is written verbatim into the ':root' custom
// properties inside Emotion's own trusted <style> element (see styleOverrides below) —
// a value containing CSS syntax characters could break out of the declaration into
// arbitrary CSS/HTML, which a style-src CSP does not stop. Reject anything that could
// break out of a CSS value BEFORE probing it at all.
const UNSAFE_COLOR_CHARS = /[;{}<>\\]/i

// createTheme -> augmentColor parses each palette colour with MUI's decomposeColor
// and THROWS for anything it cannot parse (a CSS named colour, a hex missing its
// '#', or a color() with an unsupported colour space like "color(display-p4 …)"). A
// prefix regex is not enough, because it accepts color() strings the parser then
// rejects — so, once past the character/url() check above, canonicalise through
// decomposeColor + recomposeColor and use only that MUI-produced string. This also
// means the palette/CSS never see the raw host value, only MUI's own canonical
// re-serialisation of it, even when the input was otherwise well-formed.
function normalizeThemeColor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (UNSAFE_COLOR_CHARS.test(trimmed) || trimmed.includes('url(')) return undefined
  try {
    return recomposeColor(decomposeColor(trimmed))
  } catch {
    return undefined
  }
}

/**
 * Builds the MUI theme for the given mode. Colours, font stack, and the component
 * baseline are identical across the suite so the apps share look-and-feel. When
 * prefersReducedMotion is set, all MUI transitions are disabled to honour the OS
 * accessibility preference. direction flips the theme to RTL for right-to-left
 * languages. overrides applies runtime whitelabel colours (each validated; an
 * invalid colour falls back to the built-in token so createTheme never throws).
 */
export function createAppTheme(
  mode: ThemeMode,
  prefersReducedMotion = false,
  direction: Direction = 'ltr',
  overrides: ThemeOverrides = {},
): Theme {
  const primary = normalizeThemeColor(overrides.primary) ?? BRAND_PRIMARY
  const secondaryOverride = mode === 'dark' ? overrides.secondaryDark : overrides.secondaryLight
  const secondary =
    normalizeThemeColor(secondaryOverride) ?? (mode === 'dark' ? SECONDARY_DARK : SECONDARY_LIGHT)

  const themeOptions = {
    direction,
    palette: {
      mode,
      primary: { main: primary },
      secondary: { main: secondary },
      ...(mode === 'dark' && {
        background: { default: DARK_BG_DEFAULT, paper: DARK_BG_PAPER },
      }),
    },
    typography: {
      fontFamily: FONT_FAMILY,
    },
    shape: { borderRadius: BORDER_RADIUS },
    ...(prefersReducedMotion && {
      transitions: {
        create: () => 'none',
        duration: {
          shortest: 0,
          shorter: 0,
          short: 0,
          standard: 0,
          complex: 0,
          enteringScreen: 0,
          leavingScreen: 0,
        },
      },
    }),
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            '--brand-primary': primary,
            '--brand-secondary': secondary,
          },
          'pre, code': {
            backgroundColor: mode === 'dark' ? '#2d2d2d' : '#f5f5f5',
            color: mode === 'dark' ? '#e6e6e6' : '#1e1e1e',
          },
          body: {
            scrollbarColor: mode === 'dark' ? '#6b6b6b #2b2b2b' : undefined,
            '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
              backgroundColor: mode === 'dark' ? '#2b2b2b' : undefined,
            },
            '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
              backgroundColor: mode === 'dark' ? '#6b6b6b' : undefined,
              borderRadius: BORDER_RADIUS,
            },
          },
        },
      },
    },
  }

  try {
    return createTheme(themeOptions)
  } catch {
    // Defensive net: a colour that slipped past isValidThemeColor and broke
    // createTheme must never white-screen the app. Rebuild with the built-in
    // tokens only (createAppTheme with no overrides uses known-valid values, so
    // this cannot recurse further).
    if (primary !== BRAND_PRIMARY || overrides.secondaryDark || overrides.secondaryLight) {
      return createAppTheme(mode, prefersReducedMotion, direction, {})
    }
    throw new Error('createAppTheme: built-in theme tokens failed to build')
  }
}
