import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { safeGetItem, safeSetItem, warnIfDefaultKey } from '../utils/storage'

export interface ConsentPreferences {
  /** Essential cookies — always true, cannot be disabled. */
  essential: true
  /** Error reporting (e.g. Sentry). */
  errorReporting: boolean
  /** Performance / Web Vitals reporting. */
  performanceReporting: boolean
  /** Analytics / usage tracking. */
  analytics: boolean
}

interface ConsentContextType {
  preferences: ConsentPreferences
  hasConsented: boolean
  updatePreferences: (prefs: Partial<Omit<ConsentPreferences, 'essential'>>) => void
  acceptAll: () => void
  rejectAll: () => void
}

const DEFAULT_CONSENT_KEY = 'suite-consent'

const defaultPreferences: ConsentPreferences = {
  essential: true,
  errorReporting: false,
  performanceReporting: false,
  analytics: false,
}

const ConsentContext = createContext<ConsentContextType | undefined>(undefined)

// Strictly coerce a parsed (and therefore untrusted) preferences object: each opt-in field must be
// the boolean literal `true` to count as consent. A tampered/legacy value — a string "false"/"true",
// a number, anything non-boolean — collapses to `false` (opt-out), so it can never round-trip truthy
// into a GDPR consent gate. essential is always true.
function sanitizePreferences(parsed: Record<string, unknown>): ConsentPreferences {
  return {
    essential: true,
    errorReporting: parsed.errorReporting === true,
    performanceReporting: parsed.performanceReporting === true,
    analytics: parsed.analytics === true,
  }
}

function loadPreferences(storageKey: string): { prefs: ConsentPreferences; consented: boolean } {
  const stored = safeGetItem(storageKey)
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored)
      // Only a plain object is a valid stored consent record; a primitive or array is treated as
      // no consent so the banner reappears rather than silently applying a malformed value.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { prefs: sanitizePreferences(parsed as Record<string, unknown>), consented: true }
      }
    } catch {
      // Corrupted JSON — treat as no consent.
    }
  }
  return { prefs: defaultPreferences, consented: false }
}

export interface ConsentProviderProps {
  children: ReactNode
  /** localStorage key for persisted preferences (per app). */
  storageKey?: string
}

export function ConsentProvider({ children, storageKey = DEFAULT_CONSENT_KEY }: ConsentProviderProps) {
  const [{ prefs, consented }, setState] = useState(() => loadPreferences(storageKey))

  useEffect(() => {
    warnIfDefaultKey('ConsentProvider', storageKey, DEFAULT_CONSENT_KEY)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, [])

  // Deliberately never cleared on sign-out or any other session-termination path (unlike
  // SuiteLayout's nav-group state): a consent decision is scoped to this origin, not to a
  // session, so it's correct for it to outlive logout rather than reprompting the next session.
  useEffect(() => {
    if (!consented) return
    safeSetItem(storageKey, JSON.stringify(prefs))
  }, [prefs, consented, storageKey])

  const updatePreferences = useCallback(
    (partial: Partial<Omit<ConsentPreferences, 'essential'>>) => {
      setState((prev) => ({
        prefs: { ...prev.prefs, ...partial, essential: true },
        consented: true,
      }))
    },
    [],
  )

  const acceptAll = useCallback(() => {
    setState({
      prefs: { essential: true, errorReporting: true, performanceReporting: true, analytics: true },
      consented: true,
    })
  }, [])

  const rejectAll = useCallback(() => {
    setState({ prefs: defaultPreferences, consented: true })
  }, [])

  // Unlike AuthProvider/SuiteThemeProvider (both already memoized), this value was a fresh object
  // literal every render, forcing every consumer to re-render on any parent re-render regardless
  // of whether consent actually changed.
  const value = useMemo<ConsentContextType>(
    () => ({
      preferences: prefs,
      hasConsented: consented,
      updatePreferences,
      acceptAll,
      rejectAll,
    }),
    [prefs, consented, updatePreferences, acceptAll, rejectAll],
  )

  return (
    <ConsentContext.Provider value={value}>
      {children}
    </ConsentContext.Provider>
  )
}

export function useConsent(): ConsentContextType {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent must be used within a ConsentProvider')
  return ctx
}
