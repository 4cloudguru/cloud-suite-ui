import type { Membership } from './types'

/**
 * The request header carrying the organization a caller has selected.
 *
 * The same name is defined on the server side, in terraform-suite-identity's
 * `identity/tenantscope` (`ActingOrganizationHeader`). Both backends and both
 * frontends must agree on one name — a shared frontend can only send one, and
 * two servers reading two names is the defect that package was created to close.
 *
 * WHAT THE SERVER DOES WITH IT MATTERS MORE THAN WHAT WE SEND. The value is a
 * CLAIM. The server verifies it against a scope it resolved itself and refuses
 * anything the caller may not reach. Nothing here is a permission check; sending
 * a different value simply gets refused.
 */
export const ORGANIZATION_HEADER = 'X-Organization-Id'

/** Sentinel compared against `organizationStorageKey` to nudge integrators. */
export const DEFAULT_ORGANIZATION_KEY = 'cloud-suite.organization'

/**
 * Decide which organization is selected, given the memberships the server just
 * returned and whatever choice was remembered from last time.
 *
 * # A remembered organization is never trusted, only matched
 *
 * The remembered value comes from browser storage, which the user can edit and
 * which outlives the session that wrote it. It is therefore treated as a HINT:
 * it selects a membership only when it matches one the server just sent. It
 * never becomes the answer on its own.
 *
 * That is what makes the shared-browser case safe. If one user selects an
 * organization and a different user signs in afterwards, the remembered id does
 * not match any of the new memberships and is discarded — the second user is
 * never placed in the first user's organization, whatever storage says.
 * (AuthProvider also clears the key on sign-out, which is belt to this braces.)
 *
 * # The single-membership case is the only implicit one
 *
 * A caller who belongs to exactly one organization is acting in it; there is no
 * choice to make and no picker to show, so a single-organization deployment
 * behaves exactly as it always has.
 *
 * With several and nothing remembered, this returns null RATHER THAN GUESSING.
 * Picking the first would depend on an ordering the server does not promise and
 * would be invisible to the person it was chosen for. Null means "ask them" —
 * and the server refuses an unnamed write in the same situation, so the two ends
 * agree about when a choice is required.
 */
export function resolveCurrentOrganization(
  memberships: Membership[] | null | undefined,
  remembered: string | null | undefined,
): string | null {
  const list = Array.isArray(memberships) ? memberships : []
  if (list.length === 0) return null

  const wanted = typeof remembered === 'string' ? remembered.trim() : ''
  if (wanted !== '') {
    const match = list.find((m) => m?.organization_id === wanted)
    if (match) return match.organization_id
    // Remembered but no longer a member: fall through and re-derive, rather
    // than keeping a selection the server would refuse on every write.
  }

  if (list.length === 1) {
    const only = list[0]?.organization_id
    return typeof only === 'string' && only.trim() !== '' ? only : null
  }

  return null
}

/**
 * Whether a host should offer a picker at all.
 *
 * Exposed so a host does not re-derive the rule and disagree with
 * {@link resolveCurrentOrganization} about when a choice exists.
 */
export function shouldOfferOrganizationChoice(
  memberships: Membership[] | null | undefined,
): boolean {
  return (Array.isArray(memberships) ? memberships : []).length > 1
}
