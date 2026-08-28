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

// ---------------------------------------------------------------------------
// The platform administrator (sethbacon/terraform-state-manager-backend#437).
//
// This is the live defect these tests exist for. The server refuses an unnamed
// write from a platform administrator UNCONDITIONALLY -- not only when they
// reach several organizations -- because reaching every organization is not the
// same as belonging to one. A picker driven by memberships therefore renders
// NOTHING for exactly the caller who is required to choose, and the refusal
// ("name the organization to act in") names a header the UI has no control for.
describe('OrganizationPicker for a caller who is not a member of what they may act in', () => {
  function renderWithDirectory(
    memberships: Membership[],
    directory: { organization_id: string; organization_name?: string }[],
  ) {
    const api = makeApi(memberships)
    render(
      <AuthProvider
        api={api}
        onClearStorage={() => {}}
        organizationStorageKey="test.org"
        selectableOrganizations={directory}
      >
        <OrganizationPicker />
      </AuthProvider>,
    )
    return api
  }

  it('offers the deployment to an administrator who belongs to nothing', async () => {
    renderWithDirectory([], [
      { organization_id: 'a', organization_name: 'Alpha' },
      { organization_id: 'b', organization_name: 'Beta' },
    ])
    const button = await screen.findByLabelText('Switch organization')
    await userEvent.click(button)
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  // The click has to STICK. setCurrentOrganization used to validate against
  // memberships alone, so an administrator could open the menu, choose, and have
  // the selection silently discarded -- the write still refused, for want of the
  // header the click was meant to supply.
  it('records a choice the caller has no membership for', async () => {
    renderWithDirectory([], [
      { organization_id: 'a', organization_name: 'Alpha' },
      { organization_id: 'b', organization_name: 'Beta' },
    ])
    await userEvent.click(await screen.findByLabelText('Switch organization'))
    await userEvent.click(await screen.findByText('Beta'))
    await waitFor(() => expect(localStorage.getItem('test.org')).toBe('b'))
    expect(await screen.findByText('Beta')).toBeInTheDocument()
  })

  // The directory is a SEPARATE request and settles after /me. If the provider
  // only resolved during applyMe, the picker would populate while the selection
  // stayed at the membership-only answer.
  it('re-resolves when the directory arrives after the session', async () => {
    const api = makeApi([])
    const { rerender } = render(
      <AuthProvider api={api} onClearStorage={() => {}} organizationStorageKey="test.org">
        <OrganizationPicker />
      </AuthProvider>,
    )
    await waitFor(() => expect(api.getCurrentUser).toHaveBeenCalled())
    expect(screen.queryByLabelText('Switch organization')).toBeNull()

    rerender(
      <AuthProvider
        api={api}
        onClearStorage={() => {}}
        organizationStorageKey="test.org"
        selectableOrganizations={[{ organization_id: 'only', organization_name: 'Only' }]}
      >
        <OrganizationPicker />
      </AuthProvider>,
    )
    // A universe of exactly one is implied and shows no control, but the
    // SELECTION must now exist -- that is the header the write needs.
    await waitFor(() => expect(localStorage.getItem('test.org')).toBe('only'))
    expect(screen.queryByLabelText('Switch organization')).toBeNull()
  })

  // The compatibility property. An ordinary single-organization caller is the
  // common case and must gain no UI, whatever this change added.
  it('still renders nothing for a single-organization caller with no extras', async () => {
    const api = renderPicker([member('only', 'Only Org')])
    await waitFor(() => expect(api.getCurrentUser).toHaveBeenCalled())
    expect(screen.queryByLabelText('Switch organization')).toBeNull()
  })
})
