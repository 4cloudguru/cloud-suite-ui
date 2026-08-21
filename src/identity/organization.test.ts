import { describe, expect, it } from 'vitest'

import {
  ORGANIZATION_HEADER,
  resolveCurrentOrganization,
  shouldOfferOrganizationChoice,
} from './organization'
import type { Membership } from './types'

const member = (id: string, name = id): Membership => ({
  organization_id: id,
  organization_name: name,
})

describe('resolveCurrentOrganization', () => {
  it('uses a remembered organization the user is still a member of', () => {
    expect(resolveCurrentOrganization([member('a'), member('b')], 'b')).toBe('b')
  })

  // The shared-browser case. One user selects an organization, signs out, a
  // different user signs in: the remembered id matches none of the new
  // memberships and must be discarded, never inherited.
  it('discards a remembered organization the user is not a member of', () => {
    expect(resolveCurrentOrganization([member('a'), member('b')], 'someone-elses')).toBeNull()
  })

  it('discards a remembered organization even when only one membership exists', () => {
    // Falls through to the single-membership rule and returns THAT one — not the
    // remembered value, which the server would refuse on every write.
    expect(resolveCurrentOrganization([member('a')], 'someone-elses')).toBe('a')
  })

  it('implies the only organization a caller has', () => {
    expect(resolveCurrentOrganization([member('only')], null)).toBe('only')
    expect(resolveCurrentOrganization([member('only')], '')).toBe('only')
    expect(resolveCurrentOrganization([member('only')], '   ')).toBe('only')
  })

  // Picking the first would depend on an ordering the server does not promise,
  // and would be invisible to the person it was chosen for. The server refuses
  // an unnamed write in the same situation, so both ends agree a choice is due.
  it('refuses to choose between several', () => {
    expect(resolveCurrentOrganization([member('a'), member('b'), member('c')], null)).toBeNull()
  })

  it('has nothing to select when there are no memberships', () => {
    expect(resolveCurrentOrganization([], 'a')).toBeNull()
    expect(resolveCurrentOrganization(null, 'a')).toBeNull()
    expect(resolveCurrentOrganization(undefined, 'a')).toBeNull()
  })

  it('trims a remembered value rather than failing to match on whitespace', () => {
    expect(resolveCurrentOrganization([member('a'), member('b')], '  b  ')).toBe('b')
  })

  it('tolerates a malformed membership list', () => {
    const ragged = [
      undefined as unknown as Membership,
      { organization_id: '', organization_name: '' } as Membership,
      member('real'),
    ]
    expect(resolveCurrentOrganization(ragged, 'real')).toBe('real')
    // A single membership carrying no id is not a selection.
    expect(resolveCurrentOrganization([{ organization_id: '' } as Membership], null)).toBeNull()
  })

  it('does not treat a non-string remembered value as a selection', () => {
    expect(resolveCurrentOrganization([member('a'), member('b')], 42 as unknown as string)).toBeNull()
  })
})

describe('shouldOfferOrganizationChoice', () => {
  it('is false for zero or one membership, so a single-org deployment shows no picker', () => {
    expect(shouldOfferOrganizationChoice([])).toBe(false)
    expect(shouldOfferOrganizationChoice([member('only')])).toBe(false)
    expect(shouldOfferOrganizationChoice(null)).toBe(false)
  })

  it('is true once there is an actual choice', () => {
    expect(shouldOfferOrganizationChoice([member('a'), member('b')])).toBe(true)
  })

  // The rule must agree with resolveCurrentOrganization about when a choice
  // exists, or a host renders a picker for a decision already made — or worse,
  // renders none while the selection is null and every write is refused.
  it('agrees with resolveCurrentOrganization about when a choice is due', () => {
    for (const list of [[], [member('a')], [member('a'), member('b')]]) {
      const resolved = resolveCurrentOrganization(list, null)
      if (shouldOfferOrganizationChoice(list)) {
        expect(resolved).toBeNull()
      } else if (list.length === 1) {
        expect(resolved).not.toBeNull()
      }
    }
  })
})

describe('ORGANIZATION_HEADER', () => {
  // Defined identically in terraform-suite-identity's identity/tenantscope
  // (ActingOrganizationHeader). Changing it is a coordinated release across two
  // backends and two frontends, not an edit.
  it('matches the name the servers read', () => {
    expect(ORGANIZATION_HEADER).toBe('X-Organization-Id')
  })
})
