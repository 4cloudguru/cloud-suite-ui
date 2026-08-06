import { useRef } from 'react'

/**
 * Shared "seed local form state from a prop, but only once per identity/content key" pattern used
 * by the settings-card and dialog forms. Callers compute their own `seedKey` (identity-based, e.g.
 * a record id, or content-based, e.g. a joined string of the incoming values) and, when `dirty` is
 * true, seeding is suppressed entirely — an in-progress edit must never be silently clobbered by a
 * prop change that reflects data the user is already editing.
 *
 * The returned `resetSeedTracking` is opt-in: identity-keyed consumers (e.g. a dialog that must
 * always reseed on reopen, even for the same record) call it when the key goes back to null;
 * content-keyed consumers (e.g. a settings card keyed on field values) must NOT call it on a
 * transient null key, or an in-progress edit would be reseeded/clobbered on the next loading blip.
 *
 * The seeded-key bookkeeping is a ref, not state: it only needs to be read back synchronously
 * within this same render to compute `shouldSeed`, and a caller (e.g. an identity-keyed dialog)
 * may need to call `resetSeedTracking` unconditionally on every render while closed. A state
 * setter called unconditionally during render schedules React's render-phase-update retry on
 * every pass regardless of whether the value actually changed (that no-op bailout only applies
 * to setters called outside the currently-rendering component), which would throw "Too many
 * re-renders"; mutating a ref never schedules a re-render, so it stays safe to call every pass.
 */
export function useSeedFromKey(seedKey: string | null, dirty = false): [boolean, () => void] {
  const seededForRef = useRef<string | null>(null)
  const shouldSeed = seedKey !== null && seededForRef.current !== seedKey && !dirty
  if (shouldSeed) seededForRef.current = seedKey
  return [shouldSeed, () => { seededForRef.current = null }]
}
