import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AuthApi, AuthContextType, MeResponse, RoleTemplateInfo, User } from './types'

/** How long before session expiry the warning appears. */
export const SESSION_WARNING_LEAD_MS = 2 * 60 * 1000

// setTimeout delays beyond 2^31-1 ms overflow and fire immediately in browsers/Node. Re-arm
// scheduling a comfortable margin below that ceiling rather than at the exact boundary.
const MAX_TIMEOUT_MS = 2 ** 31 - 1 - 60_000

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

/**
 * The wildcard scope: a user holding this scope satisfies every {@link AuthContextType.hasScope}
 * check. This mirrors the backend's own admin-wildcard check (see the shared identity module) —
 * it is a UI-visibility convenience only, not a security boundary; the backend independently
 * enforces authorization on every request regardless of what this client-side check returns.
 */
export const ADMIN_SCOPE = 'admin'

// hasScope mirrors the backend's check: the ADMIN_SCOPE wildcard grants everything.
function scopeSatisfied(scopes: string[], scope: string): boolean {
  return Array.isArray(scopes) && (scopes.includes(ADMIN_SCOPE) || scopes.includes(scope))
}

export interface AuthProviderProps {
  children: ReactNode
  /** App-specific backend contract that drives authentication. */
  api: AuthApi
  /**
   * Clears any app-specific cached auth storage when the session ends. Called on explicit
   * logout AND when the session fails closed (a rejected/401 `getCurrentUser()`, a lapsed
   * session, or a malformed response) — i.e. on every transition to unauthenticated, so
   * host-cached data does not outlive the logged-out UI.
   */
  onClearStorage?: () => void
}

/**
 * Holds the authenticated session, derived from the backend via the injected
 * {@link AuthApi}. Exposes the canonical auth surface shared by both suite apps
 * and schedules a session-expiry warning. The `api`/`onClearStorage` props are
 * read through refs, so passing a fresh object each render is harmless.
 */
/**
 * Reduce a session-resolution failure to a display-safe string. Exported for
 * tests only (not re-exported from the package barrel): the raw error may
 * carry response bodies, headers, and URLs that must never reach UI state.
 */
export function sanitizeAuthError(err: unknown): string {
  const status = (err as { response?: { status?: unknown } })?.response?.status
  if (typeof status === 'number') return `Session check failed (HTTP ${status})`
  if (err instanceof Error && err.message) return err.message
  return 'Session check failed'
}

export function AuthProvider({ children, api, onClearStorage }: AuthProviderProps) {
  const apiRef = useRef(api)
  apiRef.current = api
  const onClearStorageRef = useRef(onClearStorage)
  onClearStorageRef.current = onClearStorage

  const [user, setUser] = useState<User | null>(null)
  const [roleTemplate, setRoleTemplate] = useState<RoleTemplateInfo | null>(null)
  const [allowedScopes, setAllowedScopes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null)
  const [sessionExpiresSoon, setSessionExpiresSoon] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic token bumped on logout and unmount. Any in-flight loadUser()/refreshSession()
  // captures the current value and discards its result if the token has since moved on — so a
  // late getCurrentUser()/refreshToken() cannot resurrect a session the user already ended.
  const generation = useRef(0)
  const mounted = useRef(true)
  const refreshing = useRef(false)

  const clearWarnTimer = useCallback(() => {
    if (warnTimer.current) {
      clearTimeout(warnTimer.current)
      warnTimer.current = null
    }
  }, [])

  const scheduleSessionWarning = useCallback(
    (expiresAt: Date) => {
      clearWarnTimer()
      const time = expiresAt.getTime()
      if (!Number.isFinite(time)) {
        // Malformed/unparseable expiry — don't schedule (setTimeout(fn, NaN) coerces to 0ms and
        // would fire the warning immediately). Leave the session un-warned instead.
        setSessionExpiresAt(null)
        setSessionExpiresSoon(false)
        return
      }
      setSessionExpiresAt(expiresAt)
      setSessionExpiresSoon(false)
      const delay = time - Date.now() - SESSION_WARNING_LEAD_MS
      if (delay > MAX_TIMEOUT_MS) {
        // Too far out to schedule directly (setTimeout delays > 2^31-1ms overflow and fire
        // immediately). Re-check closer to expiry instead of silently never warning.
        warnTimer.current = setTimeout(() => scheduleSessionWarning(expiresAt), MAX_TIMEOUT_MS)
        return
      }
      if (delay <= 0) {
        setSessionExpiresSoon(true)
        return
      }
      warnTimer.current = setTimeout(() => setSessionExpiresSoon(true), delay)
    },
    [clearWarnTimer],
  )

  // Reset all session state to unauthenticated. Does NOT call onClearStorage — callers decide.
  const resetSessionState = useCallback(() => {
    clearWarnTimer()
    setUser(null)
    setRoleTemplate(null)
    setAllowedScopes([])
    setSessionExpiresAt(null)
    setSessionExpiresSoon(false)
  }, [clearWarnTimer])

  useEffect(() => {
    // Re-arm on every effect run, not just via the initializer: StrictMode's dev double-mount
    // (mount -> cleanup -> remount) reuses the same component instance, so the ref survives the
    // first cleanup. Without this line the flag latches false and the remount's getCurrentUser()
    // result is discarded — the session never hydrates under vite dev.
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current++
      clearWarnTimer()
    }
  }, [clearWarnTimer])

  const applyMe = useCallback(
    (me: MeResponse) => {
      setUser(me.user)
      setAllowedScopes(Array.isArray(me.allowed_scopes) ? me.allowed_scopes : [])
      const primary = me.memberships?.find((m) => m.role_template_name)
      setRoleTemplate(
        primary?.role_template_name
          ? {
            name: primary.role_template_name,
            display_name: primary.role_template_name,
            scopes: primary.role_template_scopes,
          }
          : null,
      )
      if (me.session_expires_at) {
        scheduleSessionWarning(new Date(me.session_expires_at))
      } else {
        // A later /me that omits the expiry must clear any prior schedule/warning rather than
        // leaving a stale "session expiring soon" banner armed.
        clearWarnTimer()
        setSessionExpiresAt(null)
        setSessionExpiresSoon(false)
      }
    },
    [scheduleSessionWarning, clearWarnTimer],
  )

  const loadUser = useCallback(async () => {
    const gen = ++generation.current
    try {
      const me = await apiRef.current.getCurrentUser()
      // Discard if a logout / unmount / newer load happened while this request was in flight.
      if (gen !== generation.current || !mounted.current) return
      if (!me || me.user == null) {
        // Resolved but malformed (missing user) — fail closed rather than flipping
        // isAuthenticated true with an undefined user.
        resetSessionState()
        onClearStorageRef.current?.()
        setAuthError('Malformed session response: missing user')
        return
      }
      applyMe(me)
      setAuthError(null)
    } catch (err) {
      if (gen !== generation.current || !mounted.current) return
      // Fail closed regardless of WHY getCurrentUser() rejected (real 401 vs a transient
      // network/backend error) — an authenticated-looking UI must never linger on a stale
      // session. Clear host-cached auth storage on this path too (not only on explicit logout),
      // so a lapsed/expired session does not leave stale app data behind. authError is exposed
      // (sanitized to a display-safe string) so a host CAN still distinguish the two cases.
      resetSessionState()
      onClearStorageRef.current?.()
      setAuthError(sanitizeAuthError(err))
    }
  }, [applyMe, resetSessionState])

  // On mount, resolve the session from the backend.
  useEffect(() => {
    loadUser().finally(() => {
      if (mounted.current) setIsLoading(false)
    })
  }, [loadUser])

  const login = useCallback((provider = 'oidc') => {
    apiRef.current.login(provider)
  }, [])

  const devLogin = useCallback(async () => {
    await apiRef.current.devLogin()
    await loadUser()
  }, [loadUser])

  const ldapLogin = useCallback(
    async (username: string, password: string) => {
      await apiRef.current.ldapLogin(username, password)
      await loadUser()
    },
    [loadUser],
  )

  const logout = useCallback(() => {
    generation.current++ // invalidate any in-flight loadUser() / refreshSession()
    resetSessionState()
    // Call the host logout BEFORE clearing app storage: a bearer-style host may need the token
    // (which onClearStorage clears) to authenticate its server-side revocation call. Guard both
    // a synchronous throw and a rejected promise from a misbehaving host implementation so the
    // event handler that triggered logout never sees an uncaught error.
    try {
      Promise.resolve(apiRef.current.logout()).catch(() => { })
    } catch {
      // synchronous throw — local state is already cleared, so logout still "succeeds".
    }
    onClearStorageRef.current?.()
  }, [resetSessionState])

  const refreshSession = useCallback(async () => {
    // Coalesce concurrent refreshes so rapid callers don't fire multiple token rotations.
    if (refreshing.current) return
    refreshing.current = true
    const gen = generation.current
    try {
      const { expires_in } = await apiRef.current.refreshToken()
      // Skip rescheduling if a logout / unmount happened during the refresh.
      if (gen === generation.current && mounted.current) {
        scheduleSessionWarning(new Date(Date.now() + expires_in * 1000))
      }
    } catch {
      logout()
    } finally {
      refreshing.current = false
    }
  }, [scheduleSessionWarning, logout])

  const hasScope = useCallback(
    (scope: string) => scopeSatisfied(allowedScopes, scope),
    [allowedScopes],
  )

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      roleTemplate,
      allowedScopes,
      isAuthenticated: user !== null,
      isLoading,
      sessionExpiresAt,
      sessionExpiresSoon,
      authError,
      login,
      devLogin,
      ldapLogin,
      logout,
      refreshSession,
      hasScope,
    }),
    [
      user,
      roleTemplate,
      allowedScopes,
      isLoading,
      sessionExpiresAt,
      sessionExpiresSoon,
      authError,
      login,
      devLogin,
      ldapLogin,
      logout,
      refreshSession,
      hasScope,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
