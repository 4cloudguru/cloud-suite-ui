/**
 * Returns true iff `value` is safe to assign to a DOM navigation/URL sink (`href`, `src`,
 * `window.open`, `location`, etc.): an absolute `http:`/`https:`/`mailto:`/`tel:` URL, or a
 * same-document-relative path/hash (`/foo`, `./foo`, `#foo`). Rejects everything else,
 * including `javascript:`/`data:`/`vbscript:`/`file:` schemes and protocol-relative URLs
 * (`//evil.com`), which is an allowlist (not a denylist) precisely so unknown/future schemes
 * fail closed rather than open.
 *
 * This is a defense-in-depth boundary check for a SHARED component library: even though today's
 * callers may only ever supply trusted values, a sink reused across every consuming app should
 * not assume that will always remain true.
 */
export function isSafeUrl(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return false

  // Reject any embedded ASCII control character (C0 range + DEL). Critically, the WHATWG URL
  // parser STRIPS embedded tab/newline (U+0009/U+000A/U+000D) from a URL before parsing, so a
  // value like "/\t/evil.com" — which the relative-path fast-path below would treat as a safe
  // path — is silently normalized by the browser to the protocol-relative "//evil.com" (an
  // off-origin redirect) at the sink. Rejecting control characters here closes that
  // normalization gap for the relative-path fast-path (and hardens the absolute-URL path too).
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false

  // Protocol-relative ("//evil.com") and its backslash variants ("/\evil.com", "\\evil.com")
  // — browsers may treat a leading backslash as a slash, an ambiguous-scheme trick used to
  // bypass naive "starts with /" checks. Treat all of these as unsafe.
  if (/^[/\\]{2}/.test(trimmed) || /^\/\\/.test(trimmed)) return false

  // Relative path or same-page anchor — never carries a scheme, safe.
  if (/^[/#.]/.test(trimmed)) return true

  // Absolute URL: parse and allowlist the scheme. Use the URL constructor (not a
  // startsWith/regex prefix check) so whitespace/control-character/encoding bypass
  // tricks (e.g. "java\tscript:") don't slip past a naive string match.
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:'
  } catch {
    return false
  }
}

/**
 * Returns true iff `value` is safe to assign to an in-app react-router `to=` prop. A route prop
 * can never legitimately be absolute or protocol-relative, so this is stricter than
 * {@link isSafeUrl}: it requires a single leading `/` and rejects the `//`/`/\` protocol-relative
 * tricks the same way, but — unlike isSafeUrl — also rejects `#`/`.`-relative forms and absolute
 * http(s)/mailto/tel URLs, none of which are valid react-router route paths.
 */
export function isSafeRoutePath(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return false
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false
  if (!trimmed.startsWith('/')) return false
  if (/^[/\\]{2}/.test(trimmed)) return false
  return true
}

/**
 * Resolves a react-router `to=` target: returns `value` unchanged when it passes
 * {@link isSafeRoutePath}, otherwise logs a console.warn naming `caller` (so an integrator can
 * find the misconfigured prop) and falls back to `fallback` — matching SuiteSwitcher's
 * fail-closed handling of an unsafe link href.
 */
export function resolveRoutePath(value: string, fallback: string, caller: string): string {
  if (isSafeRoutePath(value)) return value
  // eslint-disable-next-line no-console -- surfaced for the integrating app to notice/fix
  console.warn(`${caller}: rejecting unsafe route path "${value}"; falling back to "${fallback}"`)
  return fallback
}
