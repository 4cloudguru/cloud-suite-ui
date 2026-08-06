import { useRef, useState } from 'react'
import { IconButton, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import AppsIcon from '@mui/icons-material/Apps'
import type { SuiteLink } from './types'
import { isSafeUrl } from '../utils/url'

export interface SuiteSwitcherProps {
  links: SuiteLink[]
  /** Tooltip / aria-label for the trigger (default 'Switch app'). */
  tooltip?: string
  /**
   * This app's stable window name. When set (with a link's appId) for a same-origin
   * sibling, the switcher claims it on the current tab before opening the sibling, so the
   * sibling can reuse one tab for the reciprocal (sibling-opens-us) case too. Tab reuse for
   * the link being opened itself works regardless of origin — see {@link openSuiteLink}.
   */
  currentAppId?: string
}

/** True when href resolves to the current document's origin. */
function isSameOrigin(href: string): boolean {
  try {
    return new URL(href, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

// _self/_top/_parent are reserved HTML target keywords: passing one as the window.open target
// name would navigate the CURRENT tab in place rather than opening a sibling. _blank is also
// rejected here even though it's otherwise a valid target, because it collides with the
// no-appId fallback's own hardcoded use of "_blank" as a fresh-tab-every-time marker — treating
// it as a reusable named target would silently defeat this component's own tab-tracking Map.
const RESERVED_WINDOW_TARGETS = /^_(self|top|parent|blank)$/i

/**
 * Opens a sibling suite app. `link.href` is first validated against an
 * http(s)/mailto/tel/relative allowlist (see {@link isSafeUrl}) — a shared component's
 * navigation sink is reachable from every consuming app, so it is validated here as
 * defense-in-depth even though today's callers supply first-party suite URLs.
 *
 * Every link carrying an `appId` reuses one tab, same-origin OR cross-origin:
 * - If that tab is still open (tracked in `openWindows`, scoped to this component
 *   instance), it is only **focused**, never re-navigated, so whatever page or
 *   in-progress state the user left it on stays intact.
 * - Otherwise a new tab is opened under the stable name `appId` — deliberately without
 *   the `noopener` window feature, because `noopener` makes the browser treat any custom
 *   target name like `_blank` (a fresh browsing context every time; see MDN's
 *   `Window.open()` "features" docs), which is exactly what caused repeat clicks to pile
 *   up tabs. Instead, `opener` is nulled out in script immediately after opening, before
 *   the sibling's (possibly cross-origin) document can load: the new tab starts on
 *   `about:blank`, which is always same-origin to us, so this write reliably lands before
 *   any cross-origin navigation completes — closing off reverse-tabnabbing without the
 *   browser-level flag that would otherwise defeat reuse.
 *
 * Links without an `appId` have no stable identity to reuse by, so they keep opening a
 * fresh `noopener,noreferrer` tab every time, same as before. An `appId` matching one of
 * the reserved HTML target keywords (`_self`/`_top`/`_parent`/`_blank`, case-insensitive)
 * is rejected the same way — it falls back to the fresh-tab path rather than risk
 * navigating the current tab in place.
 *
 * Note for anyone adding security response headers later: don't add
 * `Cross-Origin-Opener-Policy: same-origin` (or `same-origin-allow-popups`) to a suite
 * app's responses — COOP forces its own browsing-context-group switch on mismatch, which
 * makes a tracked reference report `.closed` immediately and would silently defeat reuse.
 */
function openSuiteLink(link: SuiteLink, currentAppId: string | undefined, openWindows: Map<string, Window>): void {
  if (!isSafeUrl(link.href)) {
    // eslint-disable-next-line no-console -- surfaced for the integrating app to notice/fix
    console.warn(`SuiteSwitcher: refusing to open unsafe link href "${link.href}"`)
    return
  }

  if (!link.appId) {
    window.open(link.href, '_blank', 'noopener,noreferrer')
    return
  }

  if (RESERVED_WINDOW_TARGETS.test(link.appId)) {
    // eslint-disable-next-line no-console -- surfaced for the integrating app to notice/fix
    console.warn(`SuiteSwitcher: refusing to use reserved window target name "${link.appId}"; opening a plain new tab instead`)
    window.open(link.href, '_blank', 'noopener,noreferrer')
    return
  }

  if (currentAppId && link.appId === currentAppId) {
    // Non-blocking: this is almost always a caller misconfiguration (a link identifying
    // itself as the current app), which could navigate the current tab in place instead of
    // opening a sibling — but not unsafe enough on its own to refuse to open the link.
    // eslint-disable-next-line no-console -- surfaced for the integrating app to notice/fix
    console.warn(
      `SuiteSwitcher: link.appId "${link.appId}" matches currentAppId; opening it could navigate the current tab in place instead of a sibling tab`,
    )
  }

  const existing = openWindows.get(link.appId)
  if (existing && !existing.closed) {
    existing.focus()
    return
  }

  if (currentAppId && isSameOrigin(link.href)) window.name = currentAppId
  const opened = window.open(link.href, link.appId)
  if (opened) {
    try {
      opened.opener = null
    } catch {
      // A cross-origin navigation can race the assignment; the named-tab reuse still holds.
    }
    openWindows.set(link.appId, opened)
    opened.focus()
  }
}

/**
 * AppBar control that switches between the suite's apps. A single link renders a
 * direct-open button (the common two-app suite case); several render a menu.
 * Links carrying an appId reuse one tab per sibling, same- or cross-origin (see
 * openSuiteLink); the tracked window handles live for this component instance.
 */
export function SuiteSwitcher({ links, tooltip = 'Switch app', currentAppId }: SuiteSwitcherProps) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)
  const openWindows = useRef(new Map<string, Window>()).current

  if (links.length === 0) return null

  if (links.length === 1) {
    const link = links[0]
    return (
      <Tooltip title={tooltip}>
        <IconButton
          color="inherit"
          edge="start"
          aria-label={tooltip}
          sx={{ mr: 1 }}
          onClick={() => openSuiteLink(link, currentAppId, openWindows)}
        >
          <AppsIcon />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <>
      <Tooltip title={tooltip}>
        <IconButton
          color="inherit"
          edge="start"
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label={tooltip}
        >
          <AppsIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {links.map((link) => (
          <MenuItem
            key={link.href}
            selected={link.current}
            onClick={() => {
              setAnchor(null)
              openSuiteLink(link, currentAppId, openWindows)
            }}
          >
            <ListItemText primary={link.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
