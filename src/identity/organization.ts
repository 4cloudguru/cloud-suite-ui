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
 * An organization a caller may act in, for the purpose of choosing one.
 *
 * A {@link Membership} is assignable to this, which is the common case: for an
 * ordinary caller the organizations they may act in ARE their memberships.
 *
 * It exists as a separate, narrower type because for one caller they are not the
 * same set. A PLATFORM ADMINISTRATOR reaches every organization in the
 * deployment and belongs to none of them — the server-side resolver returns a
 * scope whose `Permits` answers true for any id while carrying no organization
 * ids at all — so their memberships describe neither what they may act in nor
 * what they should be offered. Nothing here is an authorization statement: the
 * server re-derives the caller's scope on every request and refuses an
 * organization they may not reach, whatever this list says.
 */
export interface SelectableOrganization {
  organization_id: string
  organization_name?: string | null
}

/**
 * The organizations a caller may choose between: their memberships, plus any the
 * host has established they may additionally act in.
 *
 * Order is memberships first, then the extras, and an id is kept only once —
 * with the MEMBERSHIP winning, so a name carried by a membership is not
 * displaced by a barer entry describing the same organization.
 *
 * With no extras this returns the memberships unchanged, which is what keeps
 * every existing host on exactly its previous behaviour.
 */
export function actingOrganizationChoices(
  memberships: SelectableOrganization[] | null | undefined,
  additional?: SelectableOrganization[] | null,
): SelectableOrganization[] {
  const seen = new Set<string>()
  const out: SelectableOrganization[] = []
  const push = (o: SelectableOrganization | null | undefined) => {
    const id = typeof o?.organization_id === 'string' ? o.organization_id.trim() : ''
    if (id === '' || seen.has(id)) return
    seen.add(id)
    out.push(o as SelectableOrganization)
  }
  if (Array.isArray(memberships)) memberships.forEach(push)
  if (Array.isArray(additional)) additional.forEach(push)
  return out
}

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
 * # The single-choice case is the only implicit one
 *
 * A caller with exactly one organization to choose from is acting in it; there
 * is no choice to make and no picker to show, so a single-organization
 * deployment behaves exactly as it always has.
 *
 * # `additional` is what a platform administrator is offered
 *
 * A platform administrator reaches every organization and belongs to none, so
 * their memberships are the wrong universe to derive a choice from: an empty one
 * resolves to null, and the server then refuses every write with "name the
 * organization to act in" while the picker, seeing nothing to choose between,
 * renders nothing. That is a deadlock, not a prompt.
 *
 * Passing the organizations such a caller may act in closes it. Omit the
 * argument and this behaves exactly as it did — the union is then the
 * memberships themselves.
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
  additional?: SelectableOrganization[] | null,
): string | null {
  const list = actingOrganizationChoices(memberships, additional)
  if (list.length === 0) return null

  const wanted = typeof remembered === 'string' ? remembered.trim() : ''
  if (wanted !== '') {
    const match = list.find((m) => m?.organization_id === wanted)
    if (match) return match.organization_id
    // Remembered but no longer reachable: fall through and re-derive, rather
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
 * {@link resolveCurrentOrganization} about when a choice exists — including
 * about `additional`, which both take and must weigh identically.
 */
export function shouldOfferOrganizationChoice(
  memberships: SelectableOrganization[] | null | undefined,
  additional?: SelectableOrganization[] | null,
): boolean {
  return actingOrganizationChoices(memberships, additional).length > 1
}
