import type { ReactNode } from 'react'

export interface NavItem {
  /** Route path this item links to. */
  path: string
  /** i18n key for the label. */
  labelKey: string
  /** i18n key for the sidebar tooltip (optional). */
  tooltipKey?: string
  /** Leading icon element. */
  icon: ReactNode
  /**
   * Scope required to see this item. Omit (or pass null) for items visible to
   * every authenticated user — no more `scope: null` boilerplate per item.
   */
  scope?: string | null
}

export interface NavGroup {
  key: string
  /** i18n key for the collapsible group header. */
  labelKey: string
  items: NavItem[]
  /**
   * Optional item rendered standalone (no group header) immediately above this
   * group's header, and only when the group is visible after scope filtering.
   * Used for an admin "Dashboard" link that sits just above the first admin group.
   */
  standaloneItem?: NavItem
}

export interface SuiteLink {
  /** Display label for the suite entry. */
  label: string
  /** Absolute URL to the suite app. */
  href: string
  /** Marks the current app (highlighted in the switcher). */
  current?: boolean
  /**
   * Stable window name of the target app. When set, the switcher reuses a single
   * tab per sibling (window.open(href, appId)) instead of spawning a new tab each
   * time. Omit for plain new-tab navigation. Must not be one of the browser's
   * reserved target keywords (`_self`, `_top`, `_parent`, `_blank`, case-insensitive)
   * — one of those would turn "open a sibling tab" into an in-place navigation of the
   * current tab; the switcher rejects these at runtime (console.warn + falls back to
   * a plain new tab) rather than trusting the caller.
   */
  appId?: string
}

export interface SuiteLanguageOption {
  code: string
  label: string
}
