import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthProvider'
import { SessionExpiryWarning } from './SessionExpiryWarning'
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

function AuthReadySignal() {
  const { isAuthenticated } = useAuth()
  return <span data-testid="auth-ready">{String(isAuthenticated)}</span>
}

function ExternalRefreshTrigger() {
  const { refreshSession } = useAuth()
  return <button onClick={() => void refreshSession()}>external-refresh</button>
}

describe('SessionExpiryWarning', () => {
  afterEach(() => vi.useRealTimers())

  it('renders nothing before the session enters the expiry-warning window', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: [],
      session_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    render(
      <AuthProvider api={api}>
        <AuthReadySignal />
        <SessionExpiryWarning />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth-ready')).toHaveTextContent('true'))
    expect(screen.queryByTestId('session-expiry-warning')).not.toBeInTheDocument()
  })

  it('shows the warning and wires the refresh button to refreshSession', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: [],
      // Already within the SESSION_WARNING_LEAD_MS window, so it renders as soon as the
      // initial session resolves — no timer needs to fire for this test.
      session_expires_at: new Date(Date.now() + 1000).toISOString(),
    })
    render(
      <AuthProvider api={api}>
        <SessionExpiryWarning />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('session-expiry-warning')).toBeInTheDocument())

    await act(async () => {
      screen.getByText('Refresh session').click()
    })
    expect(api.refreshToken).toHaveBeenCalled()
  })

  it('wires the sign-out button to logout', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: [],
      session_expires_at: new Date(Date.now() + 1000).toISOString(),
    })
    render(
      <AuthProvider api={api}>
        <SessionExpiryWarning />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('session-expiry-warning')).toBeInTheDocument())

    act(() => screen.getByText('Sign out').click())
    expect(api.logout).toHaveBeenCalled()
  })

  it('renders the actual remaining time instead of the fixed warning-lead constant (#99)', async () => {
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: [],
      // ~45s out — within the 2-minute warning window, so this renders immediately. The old
      // behavior interpolated the fixed SESSION_WARNING_LEAD_MS constant and would always claim
      // "2 minutes" here regardless of the real remaining time.
      session_expires_at: new Date(Date.now() + 45 * 1000).toISOString(),
    })
    render(
      <AuthProvider api={api}>
        <SessionExpiryWarning />
      </AuthProvider>,
    )
    const alert = await screen.findByTestId('session-expiry-warning')
    expect(alert).toHaveTextContent('1 minutes')
    expect(alert).not.toHaveTextContent('2 minutes')
  })

  it('shows a "skipped" message instead of looking like it worked when coalesced with an in-flight refresh (#103)', async () => {
    let resolveRefresh!: (v: { expires_in: number }) => void
    const api = makeApi({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: [],
      session_expires_at: new Date(Date.now() + 1000).toISOString(),
    })
    api.refreshToken = vi.fn().mockImplementation(
      () => new Promise<{ expires_in: number }>((resolve) => { resolveRefresh = resolve }),
    )
    render(
      <AuthProvider api={api}>
        <ExternalRefreshTrigger />
        <SessionExpiryWarning />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('session-expiry-warning')).toBeInTheDocument())

    // Something else in the host app already has a refresh in flight (e.g. its own "refresh
    // now" affordance) ...
    act(() => screen.getByText('external-refresh').click())
    // ... then the user clicks this Snackbar's own button — the provider coalesces it, and the
    // button must not look like it succeeded.
    await act(async () => {
      screen.getByText('Refresh session').click()
    })
    expect(await screen.findByTestId('refresh-skipped')).toBeInTheDocument()

    await act(async () => {
      resolveRefresh({ expires_in: 3600 })
    })
  })
})
