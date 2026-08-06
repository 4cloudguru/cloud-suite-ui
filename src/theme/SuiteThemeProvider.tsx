import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { createAppTheme } from './createAppTheme'
import { RTL_LANGUAGES } from '../tokens'
import type { Direction, SuiteThemeContextValue, ThemeMode, UIThemeConfig } from './types'
import { isSafeUrl } from '../utils/url'
import { safeGetItem, safeSetItem, warnIfDefaultKey } from '../utils/storage'

const ThemeContext = createContext<SuiteThemeContextValue | undefined>(undefined)

const DEFAULT_STORAGE_KEY = 'suite-theme'
const DEFAULT_PRODUCT_NAME = 'Terraform Suite'

function getDirection(lang: string): Direction {
  return RTL_LANGUAGES.has(lang.split('-')[0]) ? 'rtl' : 'ltr'
}

// Exported (module-internal only, not part of the public barrel) so the SSR/no-window guard
// can be unit-tested directly without going through a full component render.
export function readInitialMode(storageKey: string): ThemeMode {
  const stored = safeGetItem(storageKey)
  if (stored === 'light' || stored === 'dark') return stored
  // useState initializers run during SSR too, where `window` doesn't exist — fall back to 'light'.
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

export function readReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
}

// getUITheme is a host-provided integration point; its return value's shape is not guaranteed
// at runtime despite the UIThemeConfig type (a misconfigured host, or a compromised/buggy
// backend behind it, could send non-string fields). Coerce anything that isn't actually a
// string to undefined before it reaches theme/URL code that assumes strings.
function sanitizeUiThemeConfig(config: UIThemeConfig): UIThemeConfig {
  const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
  return {
    product_name: str(config.product_name),
    primary_color: str(config.primary_color),
    secondary_color_light: str(config.secondary_color_light),
    secondary_color_dark: str(config.secondary_color_dark),
    logo_url: str(config.logo_url),
    favicon_url: str(config.favicon_url),
    login_hero_url: str(config.login_hero_url),
  }
}

export interface SuiteThemeProviderProps {
  children: ReactNode
  /** localStorage key for the persisted light/dark choice (per app). */
  storageKey?: string
  /** Default product name when no whitelabel config provides one. */
  defaultProductName?: string
  /**
   * Optional runtime whitelabel config fetch. Tolerates an absent method, a sync
   * return, or a pending/rejecting promise. When omitted, built-in defaults apply.
   */
  getUITheme?: () => Promise<UIThemeConfig | null> | UIThemeConfig | null | undefined
}

/**
 * Holds the light/dark preference (persisted to localStorage), tracks text
 * direction from the active i18n language, follows the OS colour scheme until an
 * explicit choice is made, and applies an optional runtime whitelabel config.
 * Installs the MUI theme + CssBaseline.
 */
export function SuiteThemeProvider({
  children,
  storageKey = DEFAULT_STORAGE_KEY,
  defaultProductName = DEFAULT_PRODUCT_NAME,
  getUITheme,
}: SuiteThemeProviderProps) {
  const { i18n } = useTranslation()
  const [mode, setMode] = useState<ThemeMode>(() => readInitialMode(storageKey))
  const [direction, setDirection] = useState<Direction>(() => getDirection(i18n.language ?? 'en'))
  const [uiTheme, setUiTheme] = useState<UIThemeConfig | null>(null)
  const [reducedMotion, setReducedMotion] = useState<boolean>(readReducedMotion)

  useEffect(() => {
    warnIfDefaultKey('SuiteThemeProvider', storageKey, DEFAULT_STORAGE_KEY)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, [])

  const toggleTheme = useCallback(() => {
    setMode((current) => {
      const next: ThemeMode = current === 'light' ? 'dark' : 'light'
      safeSetItem(storageKey, next)
      return next
    })
  }, [storageKey])

  // Sync direction when the i18n language changes, and reflect it on <html dir/lang>.
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      const dir = getDirection(lng)
      setDirection(dir)
      document.documentElement.dir = dir
      document.documentElement.lang = lng
    }
    handleLanguageChanged(i18n.language ?? 'en')
    i18n.on('languageChanged', handleLanguageChanged)
    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [i18n])

  // Follow the OS colour scheme until the user picks a theme explicitly.
  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mediaQuery) return undefined
    const handleChange = (e: MediaQueryListEvent) => {
      if (!safeGetItem(storageKey)) {
        setMode(e.matches ? 'dark' : 'light')
      }
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [storageKey])

  // Reduced-motion is OS-driven too; keep it live like the color-scheme listener above.
  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mediaQuery) return undefined
    const handleChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Fetch the runtime whitelabel config once on mount; fall back to defaults.
  useEffect(() => {
    if (!getUITheme) return undefined
    let cancelled = false
    // Call getUITheme() inside .then() so a SYNCHRONOUS throw from the host callback becomes a
    // rejected promise the .catch() below handles, rather than escaping this effect uncaught.
    Promise.resolve()
      .then(() => getUITheme())
      .then((config) => {
        if (cancelled || !config) return
        const sanitized = sanitizeUiThemeConfig(config)
        setUiTheme(sanitized)
        if (sanitized.favicon_url && isSafeUrl(sanitized.favicon_url)) {
          const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
          if (link) link.href = sanitized.favicon_url
        }
      })
      .catch(() => {
        // ignore — built-in defaults apply
      })
    return () => {
      cancelled = true
    }
  }, [getUITheme])

  const theme = useMemo(
    () =>
      createAppTheme(mode, reducedMotion, direction, {
        primary: uiTheme?.primary_color,
        secondaryLight: uiTheme?.secondary_color_light,
        secondaryDark: uiTheme?.secondary_color_dark,
      }),
    [mode, reducedMotion, direction, uiTheme],
  )

  const value = useMemo<SuiteThemeContextValue>(
    () => ({
      mode,
      toggleTheme,
      direction,
      productName: uiTheme?.product_name ?? defaultProductName,
      logoUrl: uiTheme?.logo_url && isSafeUrl(uiTheme.logo_url) ? uiTheme.logo_url : null,
      loginHeroUrl:
        uiTheme?.login_hero_url && isSafeUrl(uiTheme.login_hero_url) ? uiTheme.login_hero_url : null,
    }),
    [mode, toggleTheme, direction, uiTheme, defaultProductName],
  )

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  )
}

export function useThemeMode(): SuiteThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeMode must be used within SuiteThemeProvider')
  return ctx
}
