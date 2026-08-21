import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AuthProvider } from '../identity/AuthProvider'
import type { AuthApi, MeResponse, Membership } from '../identity/types'
import { OrganizationPicker } from './OrganizationPicker'

const member = (id: string, name: string): Membership => ({
  organization_id: id,
  organization_name: name,
})

function makeApi(memberships: Membership[]): AuthApi {
  const me: MeResponse = {
    user: { id: 'u1', email: 'u@example.test', name: 'U' },
    memberships,
    allowed_scopes: ['state:read'],
  }
  return {
    getCurrentUser: vi.fn().mockResolvedValue(me),
    login: vi.fn(),
    devLogin: vi.fn().mockResolvedValue(undefined),
    ldapLogin: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    refreshToken: vi.fn().mockResolvedValue({ expires_in: 3600 }),
  }
}

function renderPicker(memberships: Membership[], api = makeApi(memberships)) {
  render(
    <AuthProvider api={api} onClearStorage={() => {}} organizationStorageKey="test.org">
      <OrganizationPicker />
    </AuthProvider>,
  )
  return api
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('OrganizationPicker', () => {
  // The common case. A single-organization deployment must gain no new UI at
  // all — the user is already acting in their one organization.
  it('renders nothing when there is no choice to make', async () => {
    const api = renderPicker([member('only', 'Only Org')])
    await waitFor(() => expect(api.getCurrentUser).toHaveBeenCalled())
    expect(screen.queryByLabelText('Switch organization')).toBeNull()
  })

  it('renders nothing when the user belongs to no organization', async () => {
    const api = renderPicker([])
    await waitFor(() => expect(api.getCurrentUser).toHaveBeenCalled())
    expect(screen.queryByLabelText('Switch organization')).toBeNull()
  })

  it('prompts when several organizations exist and none is chosen', async () => {
    renderPicker([member('a', 'Alpha'), member('b', 'Beta')])
    await waitFor(() => expect(screen.getByLabelText('Switch organization')).toBeTruthy())
    expect(screen.getByText('Select organization')).toBeTruthy()
  })

  it('shows the chosen organization by name', async () => {
    localStorage.setItem('test.org', 'b')
    renderPicker([member('a', 'Alpha'), member('b', 'Beta')])
    await waitFor(() => expect(screen.getByText('Beta')).toBeTruthy())
  })

  it('switches, and re-resolves the session so scopes cannot go stale', async () => {
    const user = userEvent.setup()
    const api = renderPicker([member('a', 'Alpha'), member('b', 'Beta')])
    await waitFor(() => expect(screen.getByLabelText('Switch organization')).toBeTruthy())
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1)

    await act(async () => {
      await user.click(screen.getByLabelText('Switch organization'))
    })
    await act(async () => {
      await user.click(screen.getByText('Beta'))
    })

    await waitFor(() => expect(api.getCurrentUser).toHaveBeenCalledTimes(2))
  })

  it('falls back to the id when an organization has no name', async () => {
    localStorage.setItem('test.org', 'b')
    renderPicker([member('a', 'Alpha'), member('b', '')])
    await waitFor(() => expect(screen.getByLabelText('Switch organization')).toBeTruthy())
    await act(async () => {
      await userEvent.setup().click(screen.getByLabelText('Switch organization'))
    })
    expect(screen.getByText('b')).toBeTruthy()
  })
})
