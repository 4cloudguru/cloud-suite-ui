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
import { safeGetItem, safeRemoveItem, safeSetItem, warnIfDefaultKey } from '../utils/storage'
import { DEFAULT_ORGANIZATION_KEY, resolveCurrentOrganization } from './organization'
import type {
  AuthApi,
  AuthContextType,
  MeResponse,
  Membership,
  RefreshSessionResult,
  RoleTemplateInfo,
  User,
} from './types'

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
   * session, a lapsed known expiry, or a malformed response) — i.e. on every transition to
   * unauthenticated, so host-cached data does not outlive the logged-out UI. Optional only for
   * backward compatibility: every real integration needs it (both suite apps wire it to clear
   * their own caches), and omitting it logs a one-time dev warning.
   */
  onClearStorage?: () => void
  /**
   * localStorage key under which the selected organization is remembered across reloads. Omit
   * and the choice is not persisted — a multi-organization user then re-picks on every load.
   *
   * The stored value is a HINT, never an authority: it selects a membership only when it
   * matches one the server just returned, so a value edited by hand, or left behind by a
   * different user of the same browser, is discarded rather than honoured. The key is also
   * removed on sign-out, which is belt to that braces.
   */
  organizationStorageKey?: string
}

/**
 * Holds the authenticated session, derived from the backend via the injected
 * {@link AuthApi}. Exposes the canonical auth surface shared by both suite apps
 * and schedules a session-expiry warning. The `api`/`onClearStorage` props are
 * read through refs, so passing a fresh object each render is harmless.
 */
/** Providers forwarded to `AuthApi.login` must be a plain identifier — see `login()` below. */
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** Cap on a passed-through `Error.message` so a verbose host error cannot flood UI state. */
const MAX_ERROR_MESSAGE_LENGTH = 200

// Matches an absolute URL, or a path with 2+ segments — either can carry an internal hostname,
// request id, or query string a fetch-based host's Error.message might embed.
const URL_OR_PATH_PATTERN = /\b\w+:\/\/\S+|(?:\/[^\s/]+){2,}\/?/g

/**
 * Reduce a session-resolution failure to a display-safe string. Exported for tests only (not
 * re-exported from the package barrel): the raw error may carry response bodies, headers, and
 * URLs that must never reach UI state. A passed-through `Error.message` (the only branch not
 * backed by a structured shape this function controls) has URL/path-like substrings redacted
 * and is capped to `MAX_ERROR_MESSAGE_LENGTH` characters — it is NOT otherwise sanitized, so a
 * host should still avoid embedding other sensitive detail in rejection messages.
 */
export function sanitizeAuthError(err: unknown): string {
  const status = (err as { response?: { status?: unknown } })?.response?.status
  if (typeof status === 'number') return `Session check failed (HTTP ${status})`
  if (err instanceof Error && err.message) {
    const redacted = err.message.replace(URL_OR_PATH_PATTERN, '[redacted]').trim()
    const safe = redacted || 'Session check failed'
    return safe.length > MAX_ERROR_MESSAGE_LENGTH ? `${safe.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : safe
  }
  return 'Session check failed'
}

/**
 * Warns once per mount when onClearStorage is omitted — every real integration wires it (see
 * the prop's own doc comment), and a host that forgets to would fail silently: stale
 * cross-user auth data can outlive a logout on a shared/kiosk machine. Mirrors the shape of
 * `warnIfDefaultKey` (src/utils/storage.ts), which this component cannot reuse directly: that
 * helper's signature is key-comparison-specific and does not fit a missing-callback check.
 */
function warnIfNoClearStorage(onClearStorage: (() => void) | undefined): void {
  if (onClearStorage) return
  // eslint-disable-next-line no-console -- one-time integration guidance
  console.warn(
    'AuthProvider: no onClearStorage prop was given. Every real integration needs it to clear ' +
    'app-cached auth data on logout/session-failure — see AuthProviderProps.onClearStorage.',
  )
}

export function AuthProvider({ children, api, onClearStorage, organizationStorageKey }: AuthProviderProps) {
  const apiRef = useRef(api)
  apiRef.current = api
  const onClearStorageRef = useRef(onClearStorage)
  onClearStorageRef.current = onClearStorage

  const [user, setUser] = useState<User | null>(null)
  const [roleTemplate, setRoleTemplate] = useState<RoleTemplateInfo | null>(null)
  const [allowedScopes, setAllowedScopes] = useState<string[]>([])
  // Full membership list, kept only so hasScope(scope, organizationId) can resolve an
  // org-scoped check (#104) — allowedScopes/roleTemplate remain the display/flat surface.
  const [memberships, setMemberships] = useState<Membership[]>([])
  // The organization the user is acting in. Derived from memberships + a remembered hint on
  // every /me, never trusted straight out of storage — see resolveCurrentOrganization.
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const organizationKeyRef = useRef(organizationStorageKey)
  organizationKeyRef.current = organizationStorageKey
  const [isLoading, setIsLoading] = useState(true)
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null)
  const [sessionExpiresSoon, setSessionExpiresSoon] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Fires the fail-closed transition at the known sessionExpiresAt instant (#99) —
  // independent of warnTimer, which only flips the sessionExpiresSoon banner.
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic token bumped on logout and unmount. Any in-flight loadUser()/refreshSession()
  // captures the current value and discards its result if the token has since moved on — so a
  // late getCurrentUser()/refreshToken() cannot resurrect a session the user already ended.
  const generation = useRef(0)
  const mounted = useRef(true)
  const refreshing = useRef(false)

  const clearSessionTimers = useCallback(() => {
    if (warnTimer.current) {
      clearTimeout(warnTimer.current)
      warnTimer.current = null
    }
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current)
      expiryTimer.current = null
    }
  }, [])

  // Reset all session state to unauthenticated. Does NOT call onClearStorage — callers decide.
  // Clearing authError here is safe: every fail-closed call site (loadUser's malformed/catch
  // branches, expireSession) sets its own message AFTER calling this, so the real message
  // always wins — only logout(), which sets no message, is left with a genuinely clean
  // authError (closes the "stale error survives an intentional sign-out" gap, #112).
  const resetSessionState = useCallback(() => {
    clearSessionTimers()
    setUser(null)
    setRoleTemplate(null)
    setAllowedScopes([])
    setMemberships([])
    setCurrentOrganizationId(null)
    // Forget the remembered choice on every transition to unauthenticated, so it cannot be
    // inherited by whoever signs in next on a shared browser. resolveCurrentOrganization would
    // discard a foreign id anyway; this stops it from lingering at all.
    if (organizationKeyRef.current) safeRemoveItem(organizationKeyRef.current)
    setSessionExpiresAt(null)
    setSessionExpiresSoon(false)
    setAuthError(null)
  }, [clearSessionTimers])

  // Fail-closed transition when a known session expiry passes unattended: the server has
  // certainly ended the session by now, so stop rendering the scope-gated UI instead of waiting
  // for the next /me call to notice (#99).
  const expireSession = useCallback(() => {
    resetSessionState()
    onClearStorageRef.current?.()
    setAuthError('Session expired')
  }, [resetSessionState])

  const scheduleSessionWarning = useCallback(
    (expiresAt: Date) => {
      clearSessionTimers()
      const time = expiresAt.getTime()
      if (!Number.isFinite(time)) {
        // Malformed/unparseable expiry — don't schedule (setTimeout(fn, NaN) coerces to 0ms and
        // would fire immediately). Leave the session un-warned and un-expired instead.
        setSessionExpiresAt(null)
        setSessionExpiresSoon(false)
        return
      }
      const maxDelay = time - Date.now()
      if (maxDelay > MAX_TIMEOUT_MS) {
        // Too far out to schedule directly (setTimeout delays > 2^31-1ms overflow and fire
        // immediately). Re-check closer to expiry instead of silently never warning/expiring.
        setSessionExpiresAt(expiresAt)
        setSessionExpiresSoon(false)
        warnTimer.current = setTimeout(() => scheduleSessionWarning(expiresAt), MAX_TIMEOUT_MS)
        return
      }
      if (maxDelay <= 0) {
        // Already lapsed by the time this resolved — fail closed immediately rather than
        // rendering a warning for a session the client already knows is dead.
        expireSession()
        return
      }
      setSessionExpiresAt(expiresAt)
      setSessionExpiresSoon(false)
      // Arm a second, independent timer at the expiry instant itself: an ignored warning must
      // not leave the UI rendered against a session the client already knows is dead (#99).
      expiryTimer.current = setTimeout(expireSession, maxDelay)

      const warnDelay = maxDelay - SESSION_WARNING_LEAD_MS
      if (warnDelay <= 0) {
        setSessionExpiresSoon(true)
      } else {
        warnTimer.current = setTimeout(() => setSessionExpiresSoon(true), warnDelay)
      }
    },
    [clearSessionTimers, expireSession],
  )

  useEffect(() => {
    // Re-arm on every effect run, not just via the initializer: StrictMode's dev double-mount
    // (mount -> cleanup -> remount) reuses the same component instance, so the ref survives the
    // first cleanup. Without this line the flag latches false and the remount's getCurrentUser()
    // result is discarded — the session never hydrates under vite dev.
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current++
      clearSessionTimers()
    }
  }, [clearSessionTimers])

  const applyMe = useCallback(
    (me: MeResponse) => {
      setUser(me.user)
      setAllowedScopes(Array.isArray(me.allowed_scopes) ? me.allowed_scopes : [])
      const nextMemberships = me.memberships ?? []
      setMemberships(nextMemberships)
      // Re-derived on EVERY /me, not just the first: a membership removed server-side must drop
      // the selection that depended on it, and re-deriving is what notices.
      const remembered = organizationKeyRef.current ? safeGetItem(organizationKeyRef.current) : null
      const selected = resolveCurrentOrganization(nextMemberships, remembered)
      setCurrentOrganizationId(selected)
      if (organizationKeyRef.current) {
        if (selected) safeSetItem(organizationKeyRef.current, selected)
        else safeRemoveItem(organizationKeyRef.current)
      }
      // Deterministic tie-break (#104): sort candidates by organization_id and take the first,
      // rather than trusting the server's membership array order — otherwise a multi-org
      // account can display a role from an unrelated organization depending on response order.
      const primary = (me.memberships ?? [])
        .filter((m) => m.role_template_name)
        .sort((a, b) => a.organization_id.localeCompare(b.organization_id))[0]
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
        clearSessionTimers()
        setSessionExpiresAt(null)
        setSessionExpiresSoon(false)
      }
    },
    [scheduleSessionWarning, clearSessionTimers],
  )

  // `expectedGen` lets a caller that already captured a generation before its OWN await (e.g.
  // devLogin/ldapLogin/refreshSession) share this guard instead of re-deriving it: if the
  // generation has already moved on (a logout/unmount raced ahead of the caller), loadUser
  // aborts before even calling getCurrentUser(). With no expectedGen it self-issues a fresh
  // generation exactly as before (#98).
  const loadUser = useCallback(
    async (expectedGen?: number) => {
      if (expectedGen !== undefined && expectedGen !== generation.current) return
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
        // Clear BEFORE applying: applyMe -> scheduleSessionWarning can fail the session closed
        // immediately (an already-lapsed expiry) and set its own 'Session expired' message, which
        // a trailing clear here would silently overwrite.
        setAuthError(null)
        applyMe(me)
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
    },
    [applyMe, resetSessionState],
  )

  // On mount, resolve the session from the backend.
  useEffect(() => {
    loadUser().finally(() => {
      if (mounted.current) setIsLoading(false)
    })
  }, [loadUser])

  useEffect(() => {
    warnIfNoClearStorage(onClearStorage)
    if (organizationStorageKey) {
      warnIfDefaultKey('AuthProvider', organizationStorageKey, DEFAULT_ORGANIZATION_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, mirrors
    // warnIfDefaultKey's usage in SuiteThemeProvider/ConsentProvider
  }, [])

  const login = useCallback((provider = 'oidc') => {
    // Providers are short host-defined identifiers (e.g. "oidc", "ldap", "google") forwarded
    // verbatim to the host, which may build a login URL from it — reject anything that isn't a
    // plain identifier so a caller can never smuggle path/query/control characters through (#71).
    const safeProvider = PROVIDER_ID_PATTERN.test(provider) ? provider : 'oidc'
    if (safeProvider !== provider) {
      // eslint-disable-next-line no-console -- flags an app bug, not a runtime condition to fail silently on
      console.warn(
        `AuthProvider: login() received an invalid provider "${provider}"; falling back to "${safeProvider}". ` +
        'Providers must match /^[A-Za-z0-9_-]+$/.',
      )
    }
    // Contain both a synchronous throw and a rejected promise from a misbehaving host
    // implementation, mirroring logout()'s containment below — login() was otherwise the only
    // unguarded entry point (#71).
    try {
      Promise.resolve(apiRef.current.login(safeProvider)).catch(() => { })
    } catch {
      // synchronous throw — login() has no local state to unwind.
    }
  }, [])

  const devLogin = useCallback(async () => {
    // Capture the generation before the host call so a logout() landing mid-flight is not
    // silently undone by the loadUser() below (#98).
    const gen = generation.current
    await apiRef.current.devLogin()
    await loadUser(gen)
  }, [loadUser])

  const ldapLogin = useCallback(
    async (username: string, password: string) => {
      const gen = generation.current
      await apiRef.current.ldapLogin(username, password)
      await loadUser(gen)
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

  const refreshSession = useCallback(async (): Promise<RefreshSessionResult> => {
    // Coalesce concurrent refreshes so rapid callers don't fire multiple token rotations. This
    // is a genuine no-op skip, not a guarded mutation — reset unconditionally in `finally`
    // regardless of generation/mounted so a stale-generation refresh can never wedge the flag.
    if (refreshing.current) return 'skipped'
    refreshing.current = true
    const gen = generation.current
    try {
      const { expires_in } = await apiRef.current.refreshToken()
      // Discard if a logout / unmount happened during the refresh (#98) — the rotated
      // credential is simply not applied to a session that already ended.
      if (gen !== generation.current || !mounted.current) return 'skipped'
      scheduleSessionWarning(new Date(Date.now() + expires_in * 1000))
      // Re-resolve /me so a server-side scope/role change made during the session is not
      // frozen for the tab's lifetime by a credential-only rotation (#99).
      await loadUser(gen)
      return 'refreshed'
    } catch {
      // Same guard the success branch applies (#98): a rejection that lands after the session
      // already ended (explicit logout) or after unmount must not re-run logout()'s side
      // effects (a second host revocation call, a second onClearStorage()) on a dead session.
      if (gen === generation.current && mounted.current) logout()
      return 'failed'
    } finally {
      refreshing.current = false
    }
  }, [scheduleSessionWarning, logout, loadUser])

  const hasScope = useCallback(
    (scope: string, organizationId?: string) => {
      if (organizationId === undefined) return scopeSatisfied(allowedScopes, scope)
      const membership = memberships.find((m) => m.organization_id === organizationId)
      if (!membership) return false
      return scopeSatisfied(membership.role_template_scopes ?? [], scope)
    },
    [allowedScopes, memberships],
  )

  /**
   * Select the organization to act in, then re-resolve the session.
   *
   * THE RE-RESOLUTION IS THE POINT. allowed_scopes is the effective set for the SELECTED
   * organization; keeping the previous one after a switch shows a user affordances for an
   * organization they are no longer acting in — the exact hazard MeResponse.allowed_scopes
   * warns hosts about. loadUser() performs the getCurrentUser() that warning calls for, and its
   * generation guard means a switch racing a logout is discarded rather than resurrecting a
   * session.
   *
   * An id the user has no membership for is IGNORED, not stored. A selection the server would
   * refuse on every write is worse than no selection: the picker would show it as current while
   * nothing worked.
   */
  const setCurrentOrganization = useCallback(
    (organizationId: string) => {
      const wanted = typeof organizationId === 'string' ? organizationId.trim() : ''
      if (wanted === '') return
      if (!memberships.some((m) => m?.organization_id === wanted)) return
      if (wanted === currentOrganizationId) return

      setCurrentOrganizationId(wanted)
      if (organizationKeyRef.current) safeSetItem(organizationKeyRef.current, wanted)
      void loadUser()
    },
    [memberships, currentOrganizationId, loadUser],
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
      memberships,
      currentOrganizationId,
      setCurrentOrganization,
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
      memberships,
      currentOrganizationId,
      setCurrentOrganization,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
