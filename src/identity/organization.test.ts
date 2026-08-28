import { describe, expect, it } from 'vitest'

import {
  ORGANIZATION_HEADER,
  actingOrganizationChoices,
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

// ---------------------------------------------------------------------------
// The platform-administrator case (sethbacon/terraform-state-manager-backend#437)
//
// A platform administrator reaches EVERY organization and belongs to NONE, so
// memberships describe neither what they may act in nor what to offer them. The
// server refuses an unnamed write from such a caller unconditionally — not only
// when they reach several — so "no memberships" must not mean "no choice".

describe('organizations a caller may act in beyond their memberships', () => {
  const extra = (id: string, name?: string) => ({ organization_id: id, organization_name: name })

  it('is exactly the memberships when nothing extra is supplied', () => {
    // The compatibility property the whole change rests on: every existing host
    // passes no extras, so the universe it sees must be byte-identical.
    expect(actingOrganizationChoices([member('a'), member('b')])).toEqual([
      member('a'),
      member('b'),
    ])
    expect(actingOrganizationChoices([member('a')], [])).toEqual([member('a')])
    expect(actingOrganizationChoices([member('a')], null)).toEqual([member('a')])
  })

  it('keeps an organization once, and lets the membership carry the name', () => {
    const choices = actingOrganizationChoices([member('a', 'Alpha')], [extra('a'), extra('b', 'B')])
    expect(choices.map((o) => o.organization_id)).toEqual(['a', 'b'])
    expect(choices[0].organization_name).toBe('Alpha')
  })

  it('drops blank and whitespace-only ids rather than offering an unselectable row', () => {
    expect(
      actingOrganizationChoices([], [extra(''), extra('   '), extra('real')]).map(
        (o) => o.organization_id,
      ),
    ).toEqual(['real'])
  })

  // THE DEADLOCK, stated as an assertion. Without the extras an administrator
  // who belongs to nothing resolves to null and is offered nothing, while the
  // server demands they name one: no header, no picker, no way out.
  it('offers a choice to an administrator who belongs to no organization', () => {
    expect(resolveCurrentOrganization([], null)).toBeNull()
    expect(shouldOfferOrganizationChoice([])).toBe(false)

    const directory = [extra('a', 'Alpha'), extra('b', 'Beta')]
    expect(shouldOfferOrganizationChoice([], directory)).toBe(true)
    expect(resolveCurrentOrganization([], null, directory)).toBeNull() // still theirs to pick
    expect(resolveCurrentOrganization([], 'b', directory)).toBe('b')
  })

  // No pointless click: a universe of exactly one is implied, exactly as a
  // single membership always has been.
  it('implies the only organization even when it came from the extras', () => {
    expect(resolveCurrentOrganization([], null, [extra('only')])).toBe('only')
    expect(shouldOfferOrganizationChoice([], [extra('only')])).toBe(false)
  })

  // An administrator who happens to hold one membership must still be offered
  // the rest of the deployment; before this they were silently pinned to their
  // own organization with no control to change it.
  it('widens an administrator who holds a single membership', () => {
    expect(shouldOfferOrganizationChoice([member('mine')])).toBe(false)
    expect(shouldOfferOrganizationChoice([member('mine')], [extra('other')])).toBe(true)
    expect(resolveCurrentOrganization([member('mine')], 'other', [extra('other')])).toBe('other')
  })

  it('still discards a remembered id that is in neither set', () => {
    expect(resolveCurrentOrganization([member('a')], 'ghost', [extra('b')])).toBeNull()
  })
})
