/**
 * Safe localStorage helpers shared by the providers (theme, consent, shell). Access to
 * `localStorage` throws in some environments (disabled cookies, sandboxed iframes, private
 * browsing quota) — these wrappers degrade to in-memory-only behaviour instead of crashing.
 */

/** Reads a localStorage key, returning null when storage is unavailable or throws. */
export function safeGetItem(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

/**
 * Writes a localStorage key, silently ignoring failures. Storage may be unavailable (private
 * browsing, quota exceeded, disabled) — the caller's in-memory state is still correct for the
 * session, so persistence is simply skipped.
 */
export function safeSetItem(storageKey: string, value: string): void {
  try {
    localStorage.setItem(storageKey, value)
  } catch {
    // Storage unavailable — skip persistence.
  }
}

/**
 * Removes a localStorage key, silently ignoring failures (see safeSetItem).
 */
export function safeRemoveItem(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Storage unavailable — nothing to remove.
  }
}

/**
 * Warns (once, when called from a mount-only effect) that a provider is using its generic default
 * storage key. Two same-origin sibling suite apps sharing a default key would collide, so this
 * nudges integrators to pass an app-specific key. No-op when a custom key is already set.
 */
export function warnIfDefaultKey(providerName: string, storageKey: string, defaultKey: string): void {
  if (storageKey !== defaultKey) return
  // eslint-disable-next-line no-console -- one-time integration guidance
  console.warn(
    `${providerName}: no storageKey prop was given, so state is persisted under the generic key ` +
    `"${defaultKey}". If this app shares an origin with a sibling suite app, pass an app-specific ` +
    'storageKey to avoid the two apps colliding.',
  )
}
