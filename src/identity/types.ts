import type { SelectableOrganization } from './organization'

export interface User {
  id: string
  email: string
  name: string
}

export interface Membership {
  organization_id: string
  organization_name: string
  role_template_name?: string | null
  role_template_scopes?: string[]
}

export interface MeResponse {
  user: User
  memberships: Membership[]
  /**
   * Flat, organization-less effective scope set. Must be the effective set for whatever
   * organization is currently selected in the host app — if a host unions scopes across
   * memberships instead, the {@link ADMIN_SCOPE} wildcard reveals admin affordances for every
   * organization the user belongs to, not just the selected one. Hosts that let a user switch
   * organization must refresh/re-mount the provider (a fresh `getCurrentUser()`) on switch
   * rather than reusing a stale `allowed_scopes`. For an org-scoped check, prefer
   * {@link AuthContextType.hasScope}'s optional `organizationId` argument, which resolves
   * against the matching {@link Membership.role_template_scopes} instead of this field.
   */
  allowed_scopes: string[]
  session_expires_at?: string
}

/**
 * Primary role template summary, informational/display-only (e.g. "show the user's role name
 * in a profile menu"). Selected deterministically from the candidate memberships that carry a
 * role template by sorting on `organization_id` and taking the first — NOT by array position,
 * since the server's membership ordering is not a meaningful tie-break. Its `scopes` field is
 * NOT necessarily the user's full effective scope set and must never be used for gating. Use
 * {@link AuthContextType.hasScope} / `allowedScopes` for that — they are the sole
 * authorization-adjacent surface this library exposes.
 */
export interface RoleTemplateInfo {
  id?: string
  name: string
  display_name: string
  scopes?: string[]
}

export interface AuthContextType {
  user: User | null
  /** Display-only — do NOT use for authorization gating. See {@link RoleTemplateInfo}. */
  roleTemplate: RoleTemplateInfo | null
  allowedScopes: string[]
  isAuthenticated: boolean
  isLoading: boolean
  /** Absolute session expiry, or null when unknown. */
  sessionExpiresAt: Date | null
  /** True once the session is within the expiry-warning window. */
  sessionExpiresSoon: boolean
  /**
   * A sanitized, display-safe message from the most recent failed
   * `getCurrentUser()`/session-resolution call, or null. Lets a host distinguish a real
   * "not logged in" state from a transient network/backend error if it wants to (e.g. show a
   * retry banner instead of redirecting to login) — `isAuthenticated` is always false in both
   * cases, since the library fails closed regardless. The raw error object is deliberately NOT
   * exposed: it can carry response bodies, headers, and URLs that must not leak into UI state.
   * A passed-through `Error.message` is truncated and stripped of URL/path-like substrings
   * (see `sanitizeAuthError`), but is otherwise host-controlled. Cleared by `resetSessionState`
   * (so both `logout()` and every fail-closed transition start clean, though the fail-closed
   * paths immediately set their own message afterward).
   */
  authError: string | null
  login: (provider?: string) => void
  devLogin: () => Promise<void>
  ldapLogin: (username: string, password: string) => Promise<void>
  logout: () => void
  /**
   * Rotate the session before it lapses; logs out on failure. Resolves to `'refreshed'` once
   * the host's `refreshToken()` succeeds (the session is then re-resolved via a background
   * `getCurrentUser()` so scopes/role cannot go stale), `'skipped'` when coalesced with an
   * already-in-flight refresh (or discarded by a logout/unmount race) — callers should treat
   * this as "nothing happened, try again" rather than success — or `'failed'` when
   * `refreshToken()` itself rejected.
   */
  refreshSession: () => Promise<RefreshSessionResult>
  /**
   * UI-visibility gate ONLY — NOT an authorization boundary. Every consuming app's backend
   * must independently enforce authorization on every request; this check exists purely to
   * hide/show nav items and UI affordances the user is not expected to use. With no
   * `organizationId`, resolves against the flat `allowedScopes` (see its caveats on
   * {@link MeResponse.allowed_scopes}). With `organizationId`, resolves against the matching
   * {@link Membership.role_template_scopes} instead (still honouring the {@link ADMIN_SCOPE}
   * wildcard within that membership), and returns `false` when no membership matches.
   */
  hasScope: (scope: string, organizationId?: string) => boolean
  /**
   * The organization the user is currently acting in, or null when there is a choice to make
   * and nobody has made it.
   *
   * Resolved from {@link MeResponse.memberships} and a remembered choice — see
   * `resolveCurrentOrganization`. A caller who belongs to exactly one organization always has
   * this set and never sees a picker, so a single-organization deployment is unchanged.
   *
   * Null with several memberships means "ask them". It is NOT an error state: the server
   * refuses an unnamed write in exactly the same situation, so the two ends agree about when a
   * choice is required.
   *
   * Hosts send this as the `ORGANIZATION_HEADER` on every request. It is a CLAIM — the server
   * verifies it against a scope it resolved itself and refuses anything the caller may not
   * reach — so this is not, and must not be treated as, an authorization boundary.
   */
  /**
   * Every organization the user belongs to, as the server last reported them.
   *
   * Exposed so a host can render an organization picker without re-fetching /me or keeping its
   * own copy that drifts. It is a DISPLAY surface: `role_template_scopes` on a membership is
   * what {@link AuthContextType.hasScope}'s `organizationId` form resolves against, and neither
   * is an authorization boundary — the server enforces on every request regardless.
   */
  memberships: Membership[]
  /**
   * The organizations the caller may CHOOSE BETWEEN when naming the one a write belongs to:
   * {@link memberships} plus any `selectableOrganizations` the host supplied.
   *
   * Distinct from `memberships` because for a platform administrator the two are different
   * sets — they reach every organization and belong to none — and a picker driven by
   * memberships alone therefore offers such a caller nothing at all, while the server refuses
   * every write of theirs for want of a choice.
   *
   * Like `memberships` this is a DISPLAY surface and not an authorization boundary; the server
   * re-derives scope on every request and refuses anything the caller may not reach.
   */
  organizationChoices: SelectableOrganization[]
  currentOrganizationId: string | null
  /**
   * Select the organization to act in, then RE-RESOLVE the session.
   *
   * The re-resolution is the point, not a side effect: {@link MeResponse.allowed_scopes} is the
   * effective set for the selected organization, so continuing to use the previous one after a
   * switch shows the user affordances for an organization they are no longer acting in. This
   * performs the `getCurrentUser()` that {@link MeResponse.allowed_scopes} tells hosts they must.
   *
   * Ignores an id the user has no membership for, rather than storing it: a selection the
   * server would refuse on every write is worse than no selection at all.
   */
  setCurrentOrganization: (organizationId: string) => void
}

/** Outcome of a {@link AuthContextType.refreshSession} call. */
export type RefreshSessionResult = 'refreshed' | 'skipped' | 'failed'

/**
 * The backend contract the AuthProvider drives. Each app supplies its own
 * implementation (cookie-based, bearer-token, etc.) — the provider only cares
 * about this surface.
 */
export interface AuthApi {
  getCurrentUser: () => Promise<MeResponse>
  /**
   * Redirect the browser to begin an SSO login for the given provider. `provider` is validated
   * by the caller against `/^[A-Za-z0-9_-]+$/` before it reaches this method (falls back to the
   * default otherwise), so implementations can rely on it being a plain identifier.
   */
  login: (provider: string) => void
  /** Establish a dev session (sets the session cookie/token), then resolve via /me. */
  devLogin: () => Promise<unknown>
  /** Establish an LDAP session, then resolve via /me. */
  ldapLogin: (username: string, password: string) => Promise<unknown>
  logout: () => void
  /**
   * Rotate the session; returns the new TTL in seconds. This library awaits the returned
   * promise with no timeout or `AbortController` of its own — a host implementation that can
   * hang indefinitely must enforce its own timeout, or every later `refreshSession()` call
   * coalesces into the same stuck call (surfaced to callers as `'skipped'`, never resolving to
   * `'refreshed'`/`'failed'` until the host's promise finally settles).
   */
  refreshToken: () => Promise<{ expires_in: number }>
}
