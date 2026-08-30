import { StrictMode, useState } from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth, ADMIN_SCOPE, sanitizeAuthError } from './AuthProvider'
import type { AuthApi, MeResponse } from './types'

function makeApi(me: MeResponse): AuthApi {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(me),
    login: vi.fn(),
    devLogin: vi.fn().mockResolvedValue(undefined),
    ldapLogin: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    refreshToken: vi.fn().mockResolvedValue({ expires_in: 3600 }),
  }
}

function Probe() {
  const {
    isAuthenticated,
    user,
    roleTemplate,
    sessionExpiresAt,
    hasScope,
    sessionExpiresSoon,
    authError,
    refreshSession,
    logout,
  } = useAuth()
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="name">{user?.name ?? ''}</span>
      <span data-testid="role">{roleTemplate?.name ?? ''}</span>
      <span data-testid="expires-at">{sessionExpiresAt ? sessionExpiresAt.toISOString() : ''}</span>
      <span data-testid="scope">{String(hasScope('state:read'))}</span>
      <span data-testid="scope-mismatch">{String(hasScope('billing:write'))}</span>
      <span data-testid="scope-admin">{String(hasScope(ADMIN_SCOPE))}</span>
      <span data-testid="scope-org">{String(hasScope('billing:write', 'org-a'))}</span>
      <span data-testid="expires-soon">{String(sessionExpiresSoon)}</span>
      <span data-testid="auth-error">{authError ?? 'none'}</span>
      <button onClick={() => void refreshSession()}>refresh</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

function DevLoginAndLogoutProbe() {
  const { devLogin, logout, isAuthenticated } = useAuth()
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <button onClick={() => void devLogin().catch(() => undefined)}>dev-login</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

function LdapLoginAndLogoutProbe() {
  const { ldapLogin, logout, isAuthenticated } = useAuth()
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <button onClick={() => void ldapLogin('ada', 's3cret').catch(() => undefined)}>ldap-login</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

// Accumulates every refreshSession() resolution so coalescing ('skipped' twice in a row, say)
// is visible instead of only the last value.
function RefreshResultProbe() {
  const { refreshSession, logout, isAuthenticated } = useAuth()
  const [results, setResults] = useState<string[]>([])
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="results">{results.join(',')}</span>
      <button
        onClick={() => {
          void refreshSession().then((r) => setResults((prev) => [...prev, r]))
        }}
      >
        refresh
      </button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

describe('AuthProvider', () => {
  it('resolves the user and scopes from the injected api', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    })
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
    expect(screen.getByTestId('name')).toHaveTextContent('Ada')
    expect(screen.getByTestId('scope')).toHaveTextContent('true')
  })

  // Regression guard: StrictMode's dev double-mount reuses the component instance, so the
  // mounted ref survived the first cleanup latched false and the remount's getCurrentUser()
  // result was discarded — every consuming app rendered signed-out under vite dev despite a
  // valid session. Production (no StrictMode double-mount) was unaffected, so only a
  // StrictMode-wrapped render catches this.
  it('hydrates the session under React.StrictMode (dev double-mount)', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    })
    render(
      <StrictMode>
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
    expect(screen.getByTestId('name')).toHaveTextContent('Ada')
    expect(screen.getByTestId('scope')).toHaveTextContent('true')
  })

  it('treats the admin scope as a wildcard', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['admin'],
    })
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('scope')).toHaveTextContent('true'))
    expect(screen.getByTestId('scope-mismatch')).toHaveTextContent('true')
  })

  // Regression guard for the confirmed HIGH audit finding: the only prior tests exercised a
  // MATCHING scope and the admin wildcard — nothing asserted that a non-empty, non-admin,
  // non-matching scope list is correctly DENIED. This is the library's central client-side
  // authorization-adjacent primitive, shared by every consuming app.
  it('denies a scope that is not held and is not the admin wildcard', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    })
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
    expect(screen.getByTestId('scope-mismatch')).toHaveTextContent('false')
    expect(screen.getByTestId('scope-admin')).toHaveTextContent('false')
  })

  // Regression guard: a malformed backend response (allowed_scopes missing, null, or not an
  // array) must not crash the app or grant every scope by accident — it should be treated as
  // "no scopes", the same fail-closed behaviour as an empty array.
  it('treats a non-array allowed_scopes as no scopes, without throwing', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: null as unknown as string[],
    })
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
    expect(screen.getByTestId('scope')).toHaveTextContent('false')
    expect(screen.getByTestId('scope-admin')).toHaveTextContent('false')
  })

  it('is unauthenticated when the api rejects, and exposes a sanitized authError string', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: [],
    })
    api.getCurrentUser = vi.fn().mockRejectedValue(new Error('401'))
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
    expect(screen.getByTestId('auth-error')).toHaveTextContent('401')
  })

  describe('sanitizeAuthError', () => {
    it('maps axios-shaped failures to an HTTP status message', () => {
      expect(sanitizeAuthError({ response: { status: 503 } })).toBe('Session check failed (HTTP 503)')
    })

    it('uses the Error message when present', () => {
      expect(sanitizeAuthError(new Error('boom'))).toBe('boom')
    })

    it('falls back for opaque values and never leaks response payloads', () => {
      const leaky = { response: { data: { secret: 'hunter2' }, headers: { cookie: 'x' } } }
      expect(sanitizeAuthError(leaky)).toBe('Session check failed')
      expect(sanitizeAuthError(undefined)).toBe('Session check failed')
      expect(sanitizeAuthError('raw string')).toBe('Session check failed')
    })
  })

  describe('session-expiry timers', () => {
    afterEach(() => vi.useRealTimers())

    it('flips sessionExpiresSoon once the expiry-lead window is reached', async () => {
      vi.useFakeTimers()
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        // 5 minutes out; SESSION_WARNING_LEAD_MS is 2 minutes, so the warning should fire
        // ~3 minutes from now.
        session_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      // Flush the initial getCurrentUser() microtask (advancing by 0ms under fake timers
      // still lets pending promises resolve) instead of testing-library's waitFor, which
      // polls via setTimeout and would deadlock while fake timers are active.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByTestId('auth')).toHaveTextContent('true')
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('false')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 1000)
      })
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('true')
    })

    it('clears the pending timer on unmount (no warning fires after unmount)', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        session_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      const { unmount } = render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      unmount()
      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    it('does not schedule an immediate warning for a session far beyond MAX_TIMEOUT_MS', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        // ~60 days out — well past the ~2^31ms (~24.8 day) setTimeout ceiling.
        session_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('false')

      vi.useFakeTimers()
      // Advancing well short of the re-arm ceiling must not fire a spurious warning.
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000)
      })
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('false')
    })
  })

  it('refreshSession logs out when the host refreshToken() rejects', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    })
    api.refreshToken = vi.fn().mockRejectedValue(new Error('refresh failed'))
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
    await act(async () => screen.getByText('refresh').click())
    expect(api.logout).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
  })

  it('logout() does not throw when the host api.logout() throws', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    })
    api.logout = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
    expect(() => act(() => screen.getByText('logout').click())).not.toThrow()
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
  })

  it('propagates a devLogin() rejection without leaving stale authenticated state', async () => {
    function DevLoginProbe() {
      const { devLogin, isAuthenticated } = useAuth()
      return (
        <div>
          <span data-testid="auth">{String(isAuthenticated)}</span>
          <button onClick={() => devLogin().catch(() => undefined)}>dev-login</button>
        </div>
      )
    }
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: [],
    })
    api.getCurrentUser = vi.fn().mockRejectedValue(new Error('401'))
    api.devLogin = vi.fn().mockRejectedValue(new Error('bad credentials'))
    render(
      <AuthProvider api={api}>
        <DevLoginProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
    await act(async () => screen.getByText('dev-login').click())
    // devLogin() rejected before loadUser() ran again — still unauthenticated, no partial state.
    expect(screen.getByTestId('auth')).toHaveTextContent('false')
  })

  it('ldapLogin authenticates with the given credentials then resolves the session via /me', async () => {
    function LdapProbe() {
      const { ldapLogin, isAuthenticated } = useAuth()
      return (
        <div>
          <span data-testid="auth">{String(isAuthenticated)}</span>
          <button onClick={() => void ldapLogin('ada', 's3cret')}>ldap-login</button>
        </div>
      )
    }
    const me: MeResponse = {
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    }
    // No session on mount; a valid session only after ldapLogin establishes one.
    const getCurrentUser = vi
      .fn()
      .mockRejectedValueOnce(new Error('401'))
      .mockResolvedValue(me)
    const api: AuthApi = { ...makeApi(me), getCurrentUser }
    render(
      <AuthProvider api={api}>
        <LdapProbe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
    await act(async () => screen.getByText('ldap-login').click())
    expect(api.ldapLogin).toHaveBeenCalledWith('ada', 's3cret')
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
  })

  it('logout() wins a race against an in-flight session load (the stale /me is discarded)', async () => {
    const me: MeResponse = {
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    }
    // Hold the mount-time getCurrentUser() pending so we can log out mid-flight.
    let resolveMe!: (value: MeResponse) => void
    const getCurrentUser = vi.fn().mockImplementation(
      () => new Promise<MeResponse>((resolve) => { resolveMe = resolve }),
    )
    const api: AuthApi = { ...makeApi(me), getCurrentUser }
    render(
      <AuthProvider api={api}>
        <Probe />
      </AuthProvider>,
    )
    // Log out while the initial load is still pending (bumps the generation counter).
    await act(async () => screen.getByText('logout').click())
    // Now let the in-flight /me resolve with a valid session — it must be discarded, not applied.
    await act(async () => {
      resolveMe(me)
      await Promise.resolve()
    })
    expect(screen.getByTestId('auth')).toHaveTextContent('false')
  })

  it('useAuth throws when used outside an AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Bare() {
      useAuth()
      return null
    }
    expect(() => render(<Bare />)).toThrow('useAuth must be used within an AuthProvider')
    spy.mockRestore()
  })

  // E1 — every async path in AuthProvider that touches session state must share the same
  // generation+mounted guard. See remediation batch-a.md for the full enumeration; rows already
  // covered elsewhere: loadUser's success/catch branches (guarded from the start, exercised by
  // "logout() wins a race against an in-flight session load" above), the mount effect's
  // `.finally` (guarded by `mounted.current`, and by the same generation bump on unmount that
  // the race test exercises), and logout()'s own fire-and-forget host-logout call (no
  // continuation mutates state, so no guard is applicable).
  describe('E1 — generation/mounted guard on every async session-mutating path (#98)', () => {
    it('logout() landing mid-devLogin() does not resurrect the session', async () => {
      let resolveDevLogin!: () => void
      const me: MeResponse = {
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
      }
      const api = makeApi(me)
      api.getCurrentUser = vi.fn().mockRejectedValue(new Error('401'))
      api.devLogin = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => { resolveDevLogin = resolve }),
      )
      render(
        <AuthProvider api={api}>
          <DevLoginAndLogoutProbe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
      // Start devLogin — the host call is pending.
      act(() => screen.getByText('dev-login').click())
      // A logout lands while the host's devLogin() is still in flight (e.g. a 401 interceptor
      // firing on an unrelated request).
      act(() => screen.getByText('logout').click())
      // The host's devLogin() now resolves; an unguarded loadUser() would call getCurrentUser()
      // and resurrect the session.
      api.getCurrentUser = vi.fn().mockResolvedValue(me)
      await act(async () => {
        resolveDevLogin()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(screen.getByTestId('auth')).toHaveTextContent('false')
      expect(api.getCurrentUser).not.toHaveBeenCalled()
    })

    it('logout() landing mid-ldapLogin() does not resurrect the session', async () => {
      let resolveLdapLogin!: () => void
      const me: MeResponse = {
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
      }
      const api = makeApi(me)
      api.getCurrentUser = vi.fn().mockRejectedValue(new Error('401'))
      api.ldapLogin = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => { resolveLdapLogin = resolve }),
      )
      render(
        <AuthProvider api={api}>
          <LdapLoginAndLogoutProbe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
      act(() => screen.getByText('ldap-login').click())
      act(() => screen.getByText('logout').click())
      api.getCurrentUser = vi.fn().mockResolvedValue(me)
      await act(async () => {
        resolveLdapLogin()
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(screen.getByTestId('auth')).toHaveTextContent('false')
      expect(api.getCurrentUser).not.toHaveBeenCalled()
    })

    it('refreshSession() catch does not re-invoke api.logout() after an explicit logout', async () => {
      let rejectRefresh!: (err: unknown) => void
      const me: MeResponse = {
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
      }
      const api = makeApi(me)
      api.refreshToken = vi.fn().mockImplementation(
        () => new Promise<{ expires_in: number }>((_resolve, reject) => { rejectRefresh = reject }),
      )
      render(
        <AuthProvider api={api}>
          <RefreshResultProbe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      act(() => screen.getByText('refresh').click()) // refreshToken() now pending
      act(() => screen.getByText('logout').click()) // explicit logout invokes api.logout() once
      expect(api.logout).toHaveBeenCalledTimes(1)
      await act(async () => {
        rejectRefresh(new Error('refresh failed'))
        await Promise.resolve()
        await Promise.resolve()
      })
      // The stale-generation refresh failure must not re-invoke api.logout() a second time.
      expect(api.logout).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('results')).toHaveTextContent('failed')
    })

    it('refreshSession() catch does not call onClearStorage after unmount', async () => {
      let rejectRefresh!: (err: unknown) => void
      const me: MeResponse = {
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
      }
      const api = makeApi(me)
      api.refreshToken = vi.fn().mockImplementation(
        () => new Promise<{ expires_in: number }>((_resolve, reject) => { rejectRefresh = reject }),
      )
      const onClearStorage = vi.fn()
      const { unmount } = render(
        <AuthProvider api={api} onClearStorage={onClearStorage}>
          <RefreshResultProbe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      act(() => screen.getByText('refresh').click())
      unmount()
      await act(async () => {
        rejectRefresh(new Error('refresh failed'))
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(onClearStorage).not.toHaveBeenCalled()
      expect(api.logout).not.toHaveBeenCalled()
    })

    it('refreshSession() re-resolves /me after a successful refresh, picking up new scopes (#99)', async () => {
      const me: MeResponse = {
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
      }
      const updatedMe: MeResponse = { ...me, allowed_scopes: ['state:read', 'billing:write'] }
      const api = makeApi(me)
      const getCurrentUser = vi.fn().mockResolvedValueOnce(me).mockResolvedValue(updatedMe)
      api.getCurrentUser = getCurrentUser
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(screen.getByTestId('scope-mismatch')).toHaveTextContent('false')
      await act(async () => screen.getByText('refresh').click())
      await waitFor(() => expect(screen.getByTestId('scope-mismatch')).toHaveTextContent('true'))
      expect(getCurrentUser).toHaveBeenCalledTimes(2)
    })

    it('refreshSession() reports "skipped" when a refresh is already in flight (#103)', async () => {
      let resolveRefresh!: (v: { expires_in: number }) => void
      const me: MeResponse = {
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
      }
      const api = makeApi(me)
      api.refreshToken = vi.fn().mockImplementation(
        () => new Promise<{ expires_in: number }>((resolve) => { resolveRefresh = resolve }),
      )
      render(
        <AuthProvider api={api}>
          <RefreshResultProbe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      // Both clicks run synchronously (no await between them), so the second call
      // deterministically observes refreshing.current === true set by the first.
      act(() => {
        screen.getByText('refresh').click()
        screen.getByText('refresh').click()
      })
      await waitFor(() => expect(screen.getByTestId('results')).toHaveTextContent('skipped'))
      await act(async () => {
        resolveRefresh({ expires_in: 3600 })
        await Promise.resolve()
        await Promise.resolve()
      })
      await waitFor(() => expect(screen.getByTestId('results')).toHaveTextContent('skipped,refreshed'))
    })
  })

  // E2 — every session-state field the provider owns must be reset on every transition to
  // unauthenticated. See remediation batch-a.md for the full enumeration.
  describe('E2 — every session-state field is reset on every transition (#112)', () => {
    it('logout() resets every session-state field the provider owns', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [
          {
            organization_id: 'org-a',
            organization_name: 'Org A',
            role_template_name: 'Admin',
            role_template_scopes: ['billing:write'],
          },
        ],
        allowed_scopes: ['state:read'],
        session_expires_at: new Date(Date.now() + 1000).toISOString(),
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      await waitFor(() => expect(screen.getByTestId('expires-soon')).toHaveTextContent('true'))
      expect(screen.getByTestId('role')).toHaveTextContent('Admin')
      expect(screen.getByTestId('expires-at')).not.toHaveTextContent('')
      expect(screen.getByTestId('scope-org')).toHaveTextContent('true')

      act(() => screen.getByText('logout').click())

      expect(screen.getByTestId('auth')).toHaveTextContent('false')
      expect(screen.getByTestId('name')).toHaveTextContent('')
      expect(screen.getByTestId('role')).toHaveTextContent('')
      expect(screen.getByTestId('expires-at')).toHaveTextContent('')
      expect(screen.getByTestId('scope')).toHaveTextContent('false')
      expect(screen.getByTestId('scope-org')).toHaveTextContent('false')
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('false')
      expect(screen.getByTestId('auth-error')).toHaveTextContent('none')
    })

    it('logout() clears a stale authError left by a prior failed loadUser', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: [],
      })
      api.getCurrentUser = vi.fn().mockRejectedValue(new Error('network blip'))
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth-error')).toHaveTextContent('network blip'))
      act(() => screen.getByText('logout').click())
      expect(screen.getByTestId('auth-error')).toHaveTextContent('none')
    })

    it('logout() clears any pending session timers (warnTimer + expiryTimer refs)', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: [],
        session_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      act(() => screen.getByText('logout').click())
      // Both the warning timer and the new expiry timer (#99) must be cancelled.
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2)
      clearTimeoutSpy.mockRestore()
    })
  })

  // #99 — a known sessionExpiresAt must be acted on, not just tracked.
  describe('session expiry is acted on, not just tracked (#99)', () => {
    afterEach(() => vi.useRealTimers())

    it('fails closed when a known expiry passes with the warning ignored', async () => {
      vi.useFakeTimers()
      const onClearStorage = vi.fn()
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        session_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      render(
        <AuthProvider api={api} onClearStorage={onClearStorage}>
          <Probe />
        </AuthProvider>,
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByTestId('auth')).toHaveTextContent('true')
      // Past the warning lead but before the real expiry: still authenticated, just warned.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 1000)
      })
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('true')
      expect(screen.getByTestId('auth')).toHaveTextContent('true')
      // Past the actual expiry, with the warning never acted on: fail closed.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
      })
      expect(screen.getByTestId('auth')).toHaveTextContent('false')
      expect(screen.getByTestId('auth-error')).toHaveTextContent('Session expired')
      expect(onClearStorage).toHaveBeenCalledTimes(1)
    })

    // #178 — a client clock far enough ahead of the server makes the server's own
    // session_expires_at read as already-lapsed, and expiring on that re-arms on EVERY /me:
    // a login loop for a session the server considers valid. A 200 from /me is the server
    // asserting the session is live, so it outranks our unsynchronised clock. A genuinely
    // expired session 401s and is failed closed by loadUser's catch instead.
    it('a lapsed server expiry is treated as clock skew, not as an expiry', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const onClearStorage = vi.fn()
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        // In the past against THIS clock, but supplied by a server that answered 200.
        session_expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(screen.getByTestId('auth-error')).toHaveTextContent('none')
      // No delay we can trust, so nothing is scheduled and nothing is warned — the same
      // posture as an unparseable expiry.
      expect(screen.getByTestId('expires-at')).toHaveTextContent('')
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('false')
      // The session survives, so host storage must not be cleared out from under it.
      expect(onClearStorage).not.toHaveBeenCalled()
      // Silent recovery would be its own trap: the skew is still real and still needs fixing.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('clock'))
      warn.mockRestore()
    })

    // The other half of #178: skew cancels when both sides of the subtraction come from this
    // clock, so a non-positive refresh lifetime is a real one and must still fail closed.
    // Without this the skew branch could be widened until it swallowed a genuine expiry.
    //
    // Asserted on expireSession's onClearStorage rather than on the final authError, because
    // refreshSession re-resolves /me straight afterwards and that 200 legitimately restores the
    // session — the fail-closed transition here is real but transient.
    it('a refresh handing back an already-dead lifetime is an expiry, not skew', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const onClearStorage = vi.fn()
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        session_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      api.refreshToken = vi.fn().mockResolvedValue({ expires_in: 0 })
      render(
        <AuthProvider api={api} onClearStorage={onClearStorage}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(onClearStorage).not.toHaveBeenCalled()
      await act(async () => screen.getByText('refresh').click())
      // Took the fail-closed branch, not the skew branch.
      expect(onClearStorage).toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('clock'))
      warn.mockRestore()
    })

    // #71 backlog: "applyMe doesn't clear a stale expiry schedule" — re-derived here because a
    // later /me that omits the expiry must not leave the previous schedule's warning/expiry
    // timers armed against a session the new /me says has no known expiry.
    it('a later /me that omits the expiry clears the previously-armed schedule', async () => {
      const withExpiry: MeResponse = {
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        session_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }
      const withoutExpiry: MeResponse = { ...withExpiry, session_expires_at: undefined }
      const api = makeApi(withExpiry)
      const getCurrentUser = vi.fn().mockResolvedValueOnce(withExpiry).mockResolvedValue(withoutExpiry)
      api.getCurrentUser = getCurrentUser
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('expires-at')).not.toHaveTextContent(''))
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      await act(async () => screen.getByText('refresh').click())
      expect(screen.getByTestId('expires-at')).toHaveTextContent('')
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('false')
      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    // #71 backlog: "scheduleSessionWarning NaN → immediate warning".
    it('a malformed session_expires_at does not immediately warn', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: ['state:read'],
        session_expires_at: 'not-a-real-date',
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(screen.getByTestId('expires-soon')).toHaveTextContent('false')
      expect(screen.getByTestId('expires-at')).toHaveTextContent('')
    })
  })

  // #100 — onClearStorage must fire on every transition to unauthenticated (E2's sibling
  // enumeration), with the host's logout() called first on the explicit-logout path.
  describe('onClearStorage fires on every transition to unauthenticated (#100)', () => {
    const baseMe: MeResponse = {
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: ['state:read'],
    }

    afterEach(() => vi.useRealTimers())

    it('malformed /me (missing user): fires once, does not call api.logout()', async () => {
      const onClearStorage = vi.fn()
      const api = makeApi(baseMe)
      api.getCurrentUser = vi.fn().mockResolvedValue({ ...baseMe, user: null })
      render(
        <AuthProvider api={api} onClearStorage={onClearStorage}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
      expect(onClearStorage).toHaveBeenCalledTimes(1)
      expect(api.logout).not.toHaveBeenCalled()
    })

    it('rejected /me: fires once, does not call api.logout()', async () => {
      const onClearStorage = vi.fn()
      const api = makeApi(baseMe)
      api.getCurrentUser = vi.fn().mockRejectedValue(new Error('network error'))
      render(
        <AuthProvider api={api} onClearStorage={onClearStorage}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('false'))
      expect(onClearStorage).toHaveBeenCalledTimes(1)
      expect(api.logout).not.toHaveBeenCalled()
    })

    it('explicit logout(): fires once, after api.logout()', async () => {
      const order: string[] = []
      const api = makeApi(baseMe)
      api.logout = vi.fn().mockImplementation(() => order.push('api.logout'))
      const onClearStorage = vi.fn().mockImplementation(() => order.push('onClearStorage'))
      render(
        <AuthProvider api={api} onClearStorage={onClearStorage}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      act(() => screen.getByText('logout').click())
      expect(onClearStorage).toHaveBeenCalledTimes(1)
      expect(api.logout).toHaveBeenCalledTimes(1)
      expect(order).toEqual(['api.logout', 'onClearStorage'])
    })

    it('known-expiry lapse: fires once, does not call api.logout() (#99)', async () => {
      vi.useFakeTimers()
      const onClearStorage = vi.fn()
      const api = makeApi({ ...baseMe, session_expires_at: new Date(Date.now() + 1000).toISOString() })
      render(
        <AuthProvider api={api} onClearStorage={onClearStorage}>
          <Probe />
        </AuthProvider>,
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByTestId('auth')).toHaveTextContent('true')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      expect(screen.getByTestId('auth')).toHaveTextContent('false')
      expect(onClearStorage).toHaveBeenCalledTimes(1)
      expect(api.logout).not.toHaveBeenCalled()
    })

    it('warns once per mount when onClearStorage is omitted, and not at all when provided', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const api = makeApi(baseMe)
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toMatch(/no onClearStorage prop was given/)
      warnSpy.mockClear()

      render(
        <AuthProvider api={makeApi(baseMe)} onClearStorage={() => { }}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getAllByTestId('auth')[1]).toHaveTextContent('true'))
      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  // #104 — hasScope must support an org-scoped check, and roleTemplate selection must not
  // depend on membership array order.
  describe('organization-aware scope resolution and deterministic roleTemplate (#104)', () => {
    it('hasScope(scope, organizationId) resolves against the matching membership', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [
          {
            organization_id: 'org-a',
            organization_name: 'Org A',
            role_template_name: 'Member',
            role_template_scopes: ['billing:write'],
          },
        ],
        allowed_scopes: [], // flat scopes deliberately empty/irrelevant to the org-scoped check
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(screen.getByTestId('scope-org')).toHaveTextContent('true')
    })

    it('hasScope(scope, organizationId) returns false when no membership matches that org', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [
          {
            organization_id: 'org-b',
            organization_name: 'Org B',
            role_template_name: 'Admin',
            role_template_scopes: [ADMIN_SCOPE],
          },
        ],
        // The flat scope set would grant it everywhere, but 'org-a' has no membership at all.
        allowed_scopes: [ADMIN_SCOPE],
      })
      render(
        <AuthProvider api={api}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'))
      expect(screen.getByTestId('scope-admin')).toHaveTextContent('true')
      expect(screen.getByTestId('scope-org')).toHaveTextContent('false')
    })

    it('roleTemplate selection is deterministic regardless of membership array order', async () => {
      const memberships: MeResponse['memberships'] = [
        { organization_id: 'org-z', organization_name: 'Org Z', role_template_name: 'Zeta', role_template_scopes: [] },
        { organization_id: 'org-a', organization_name: 'Org A', role_template_name: 'Alpha', role_template_scopes: [] },
      ]
      const apiOrderOne = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships,
        allowed_scopes: [],
      })
      const apiOrderTwo = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [...memberships].reverse(),
        allowed_scopes: [],
      })
      const { unmount } = render(
        <AuthProvider api={apiOrderOne}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('Alpha'))
      unmount()
      render(
        <AuthProvider api={apiOrderTwo}>
          <Probe />
        </AuthProvider>,
      )
      await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('Alpha'))
    })
  })

  describe('sanitizeAuthError redacts host-embedded URLs/paths and caps length (#112)', () => {
    it('maps axios-shaped failures to an HTTP status message', () => {
      expect(sanitizeAuthError({ response: { status: 503 } })).toBe('Session check failed (HTTP 503)')
    })

    it('uses the Error message when present', () => {
      expect(sanitizeAuthError(new Error('boom'))).toBe('boom')
    })

    it('falls back for opaque values and never leaks response payloads', () => {
      const leaky = { response: { data: { secret: 'hunter2' }, headers: { cookie: 'x' } } }
      expect(sanitizeAuthError(leaky)).toBe('Session check failed')
      expect(sanitizeAuthError(undefined)).toBe('Session check failed')
      expect(sanitizeAuthError('raw string')).toBe('Session check failed')
    })

    it('redacts an embedded absolute URL from a fetch-based host error', () => {
      const message = sanitizeAuthError(new Error('Session check failed for https://internal.example.com/secret?token=abc'))
      expect(message).toBe('Session check failed for [redacted]')
    })

    it('redacts an embedded multi-segment path from a hand-rolled host error', () => {
      const message = sanitizeAuthError(new Error('Failed at /api/v1/users/12345/sessions'))
      expect(message).toBe('Failed at [redacted]')
    })

    it('caps an overly long message to the display-safe length', () => {
      const message = sanitizeAuthError(new Error('x'.repeat(500)))
      expect(message.length).toBeLessThanOrEqual(201) // 200 chars + ellipsis
    })
  })

  // #71 backlog: "inconsistent login-vs-logout error containment" and "login() forwards an
  // unvalidated provider string to the host".
  describe('login() containment and provider validation (#71)', () => {
    it('does not throw when the host api.login() throws synchronously', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: [],
      })
      api.login = vi.fn().mockImplementation(() => {
        throw new Error('boom')
      })
      function LoginProbe() {
        const { login } = useAuth()
        return <button onClick={() => login('oidc')}>login</button>
      }
      render(
        <AuthProvider api={api}>
          <LoginProbe />
        </AuthProvider>,
      )
      expect(() => act(() => screen.getByText('login').click())).not.toThrow()
      expect(api.login).toHaveBeenCalledWith('oidc')
    })

    it('does not surface an unhandled rejection when the host api.login() returns a rejected promise', async () => {
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: [],
      })
      // Typed void, but a misbehaving host could still return a promise at runtime.
      api.login = vi.fn().mockReturnValue(Promise.reject(new Error('boom')))
      function LoginProbe() {
        const { login } = useAuth()
        return <button onClick={() => login('oidc')}>login</button>
      }
      render(
        <AuthProvider api={api}>
          <LoginProbe />
        </AuthProvider>,
      )
      act(() => screen.getByText('login').click())
      // Let the rejected promise's microtask settle; an uncaught rejection would fail the test run.
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(api.login).toHaveBeenCalledWith('oidc')
    })

    it('falls back to the default provider and warns when given an invalid provider string', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: [],
      })
      function LoginProbe() {
        const { login } = useAuth()
        return <button onClick={() => login('../evil?x=1')}>login</button>
      }
      render(
        // onClearStorage supplied so the only warning this test can observe is the provider one.
        <AuthProvider api={api} onClearStorage={() => undefined}>
          <LoginProbe />
        </AuthProvider>,
      )
      act(() => screen.getByText('login').click())
      expect(api.login).toHaveBeenCalledWith('oidc')
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('forwards a valid provider string unchanged without warning', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const api = makeApi({
        user: { id: '1', email: 'a@b.com', name: 'Ada' },
        memberships: [],
        allowed_scopes: [],
      })
      function LoginProbe() {
        const { login } = useAuth()
        return <button onClick={() => login('microsoft-entra')}>login</button>
      }
      render(
        // onClearStorage supplied so the only warning this test can observe is the provider one.
        <AuthProvider api={api} onClearStorage={() => undefined}>
          <LoginProbe />
        </AuthProvider>,
      )
      act(() => screen.getByText('login').click())
      expect(api.login).toHaveBeenCalledWith('microsoft-entra')
      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })
})

