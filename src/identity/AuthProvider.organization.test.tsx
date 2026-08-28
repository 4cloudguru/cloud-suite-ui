import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

import { AuthProvider, useAuth } from './AuthProvider'
import type { AuthApi, MeResponse, Membership } from './types'

const STORAGE_KEY = 'test.organization'

const member = (id: string): Membership => ({ organization_id: id, organization_name: id })

function meWith(memberships: Membership[]): MeResponse {
  return {
    user: { id: 'u1', email: 'u@example.test', name: 'U' },
    memberships,
    allowed_scopes: ['state:read'],
  }
}

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

let lastSetCurrentOrganization: ((id: string) => void) | null = null
let lastLogout: (() => void) | null = null

function Probe() {
  const { currentOrganizationId, setCurrentOrganization, logout, isLoading } = useAuth()
  lastSetCurrentOrganization = setCurrentOrganization
  lastLogout = logout
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="org">{currentOrganizationId ?? 'none'}</span>
    </div>
  )
}

function renderWith(memberships: Membership[], api = makeApi(meWith(memberships))) {
  render(
    <AuthProvider api={api} onClearStorage={() => {}} organizationStorageKey={STORAGE_KEY}>
      <Probe />
    </AuthProvider>,
  )
  return api
}

afterEach(() => {
  localStorage.clear()
  lastSetCurrentOrganization = null
  lastLogout = null
  vi.restoreAllMocks()
})

describe('AuthProvider organization selection', () => {
  it('implies the only organization a caller has, so no picker is ever needed', async () => {
    renderWith([member('only')])
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('only'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('only')
  })

  it('leaves the choice unmade when there are several and nothing is remembered', async () => {
    renderWith([member('a'), member('b')])
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('org').textContent).toBe('none')
  })

  it('honours a remembered choice the user is still a member of', async () => {
    localStorage.setItem(STORAGE_KEY, 'b')
    renderWith([member('a'), member('b')])
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('b'))
  })

  // The shared-browser case: one user's remembered choice must never become
  // another user's acting organization.
  it('discards a remembered organization the user has no membership for', async () => {
    localStorage.setItem(STORAGE_KEY, 'someone-elses-org')
    renderWith([member('a'), member('b')])
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('org').textContent).toBe('none')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('re-resolves the session on switch, because allowed_scopes is per-organization', async () => {
    const api = renderWith([member('a'), member('b')])
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1)

    await act(async () => {
      lastSetCurrentOrganization?.('b')
    })

    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('b'))
    expect(api.getCurrentUser).toHaveBeenCalledTimes(2)
  })

  it('ignores a selection the user has no membership for', async () => {
    const api = renderWith([member('a'), member('b')])
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    const callsBefore = (api.getCurrentUser as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => {
      lastSetCurrentOrganization?.('not-mine')
    })

    expect(screen.getByTestId('org').textContent).toBe('none')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect((api.getCurrentUser as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('forgets the remembered organization on sign-out', async () => {
    renderWith([member('only')])
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe('only'))

    await act(async () => {
      lastLogout?.()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId('org').textContent).toBe('none')
  })

  // A membership removed server-side must drop a selection that depended on it.
  // Re-deriving on every /me is what notices; deriving once on mount would not.
  it('drops a selection when the membership behind it disappears', async () => {
    localStorage.setItem(STORAGE_KEY, 'b')
    const api = makeApi(meWith([member('a'), member('b')]))
    renderWith([member('a'), member('b')], api)
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('b'))

    // The next /me no longer carries organization b.
    ;(api.getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      meWith([member('a'), member('c')]),
    )
    await act(async () => {
      lastSetCurrentOrganization?.('a')
    })

    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('a'))
    expect(localStorage.getItem(STORAGE_KEY)).toBe('a')
  })

  it('works with no storage key at all, simply not remembering', async () => {
    const api = makeApi(meWith([member('only')]))
    render(
      <AuthProvider api={api} onClearStorage={() => {}}>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('only'))
    expect(localStorage.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// selectableOrganizations must not outlive the session.
//
// resetSessionState clears the selection and forgets the remembered key so a
// signed-out browser holds no acting organization. The re-resolve effect runs on
// the same state change, and a host that keeps passing the prop through a logout
// would have a single-entry universe re-selected the instant the session ended --
// the one value that must never be inherited by whoever signs in next.
describe('a supplied organization universe and sign-out', () => {
  it('does not re-select an organization after logout', async () => {
    const api = makeApi(meWith([]))
    render(
      <AuthProvider
        api={api}
        onClearStorage={() => {}}
        organizationStorageKey={STORAGE_KEY}
        selectableOrganizations={[{ organization_id: 'only', organization_name: 'Only' }]}
      >
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('only'))

    await act(async () => {
      lastLogout?.()
    })
    await waitFor(() => expect(screen.getByTestId('org').textContent).toBe('none'))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
