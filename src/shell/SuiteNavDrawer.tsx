import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Collapse,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { useAuth } from '../identity'
import { useThemeMode } from '../theme'
import { safeGetItem, safeRemoveItem, safeSetItem, warnIfDefaultKey } from '../utils/storage'
import { resolveRoutePath } from '../utils/url'
import type { NavGroup, NavItem } from './types'

const DRAWER_WIDTH = 240
// Sentinel compared against groupStateStorageKey to decide when to nudge integrators via
// warnIfDefaultKey — see the groupStateStorageKey JSDoc on SuiteLayoutProps.
const DEFAULT_GROUP_STATE_KEY = 'suite-nav-groups'

// Strictly coerce a parsed (and therefore untrusted) group-open-state record: only entries whose
// value is the boolean literal true/false are kept, so a tampered/legacy value (string, number,
// nested object/array) can't corrupt rendering — it's simply dropped and that group falls back
// to defaultGroupOpen(key) via the isGroupOpen/toggleGroup `??` lookup, same as a never-persisted
// key. Mirrors ConsentProvider's sanitizePreferences.
function sanitizeGroupState(parsed: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') result[key] = value
  }
  return result
}

export interface SuiteNavDrawerProps {
  /** Standalone Home item shown above the grouped sections. */
  homeItem: NavItem
  /** Flat nav items shown above the collapsible groups (optional). */
  primaryNavItems: NavItem[]
  /** Collapsible, scope-filtered feature/admin groups. */
  navGroups: NavGroup[]
  /**
   * When set (per app), collapsible group open/closed state is persisted to
   * localStorage under this key and every group defaults to open. Omit for
   * in-memory state where only the active group starts open. If this exactly
   * matches the library's generic default key, a one-time console.warn nudges
   * you to pass an app-specific key so two same-origin sibling suite apps
   * don't collide (see warnIfDefaultKey).
   */
  groupStateStorageKey?: string
  /** True at md+ breakpoints — selects the permanent vs temporary Drawer variant. */
  isDesktop: boolean
  /** Whether the temporary (mobile) drawer is open. Ignored at desktop widths. */
  mobileOpen: boolean
  /** Closes the temporary (mobile) drawer — on backdrop dismiss or nav-item click. */
  onCloseMobile: () => void
}

/**
 * Responsive nav Drawer: scope-filtered, collapsible groups with active-route
 * styling and localStorage-persisted open/closed state. Internal to SuiteLayout.
 */
export function SuiteNavDrawer({
  homeItem,
  primaryNavItems,
  navGroups,
  groupStateStorageKey,
  isDesktop,
  mobileOpen,
  onCloseMobile,
}: SuiteNavDrawerProps) {
  const theme = useTheme()
  const { t } = useTranslation()
  const location = useLocation()
  const { mode } = useThemeMode()
  const { isAuthenticated, isLoading, hasScope } = useAuth()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (!groupStateStorageKey) return {}
    const stored = safeGetItem(groupStateStorageKey)
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored)
        // Only a plain object is a valid stored group-state record; a primitive or array is
        // treated as no persisted state (falls through to "default every group open" below)
        // rather than silently applying a malformed value — mirrors ConsentProvider's
        // loadPreferences.
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return sanitizeGroupState(parsed as Record<string, unknown>)
        }
      } catch {
        // ignore malformed storage
      }
    }
    // Default every group to open when persistence is enabled.
    return Object.fromEntries(navGroups.map((g) => [g.key, true]))
  })

  useEffect(() => {
    if (groupStateStorageKey) warnIfDefaultKey('SuiteLayout', groupStateStorageKey, DEFAULT_GROUP_STATE_KEY)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, [])

  // AuthProvider (off limits here) fails closed the same way on every route to unauthenticated:
  // explicit sign-out, a rejected/malformed session check, a failed refreshSession(), or expiry.
  // Rather than hooking each of those individually, watch isAuthenticated itself so there is one
  // mechanism for all of them. Edge-triggered on a *prior* true value so it never fires on an
  // initial unauthenticated mount (a user who never signed in this tab keeps their layout), and
  // skipped while isLoading is true since isAuthenticated isn't meaningful yet mid-mount-check.
  const wasAuthenticated = useRef(isAuthenticated)
  useEffect(() => {
    if (isLoading) return
    if (wasAuthenticated.current && !isAuthenticated && groupStateStorageKey) {
      safeRemoveItem(groupStateStorageKey)
    }
    wasAuthenticated.current = isAuthenticated
  }, [isAuthenticated, isLoading, groupStateStorageKey])

  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((g) => ({
          ...g,
          items: (g.items ?? []).filter((it) => it.scope == null || hasScope(it.scope)),
        }))
        .filter((g) => g.items.length > 0),
    [navGroups, hasScope],
  )

  const activeGroupKey = useMemo(
    () =>
      visibleGroups.find((g) => g.items.some((it) => location.pathname.startsWith(it.path)))?.key ??
      null,
    [visibleGroups, location.pathname],
  )

  // Default open-state for a group with no explicit entry yet: always open when persistence is
  // enabled (matches the initializer above), otherwise only the currently-active group.
  const defaultGroupOpen = (key: string) => (groupStateStorageKey ? true : key === activeGroupKey)

  // Shared by isGroupOpen and toggleGroup so both look up an explicit entry the same way and
  // fall back to defaultGroupOpen identically (previously hand-duplicated in each).
  const resolveGroupOpen = (state: Record<string, boolean>, key: string) => state[key] ?? defaultGroupOpen(key)

  const isGroupOpen = (key: string) => resolveGroupOpen(openGroups, key)

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const current = resolveGroupOpen(prev, key)
      const next = { ...prev, [key]: !current }
      if (groupStateStorageKey) {
        safeSetItem(groupStateStorageKey, JSON.stringify(next))
      }
      return next
    })
  }

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const itemSx = (active: boolean) =>
    active
      ? {
        borderLeft: `3px solid ${theme.palette.primary.main}`,
        backgroundColor: alpha(theme.palette.primary.main, mode === 'dark' ? 0.16 : 0.12),
        '& .MuiListItemText-primary': { fontWeight: 600 },
      }
      : { borderLeft: '3px solid transparent' }

  const renderItem = (item: NavItem) => {
    const active = isActive(item.path)
    const button = (
      <ListItemButton
        component={RouterLink}
        to={resolveRoutePath(item.path, '/', 'SuiteLayout')}
        selected={active}
        onClick={() => onCloseMobile()}
        sx={itemSx(active)}
      >
        <ListItemIcon sx={{ color: active ? 'primary.main' : undefined, minWidth: 40 }}>
          {item.icon}
        </ListItemIcon>
        <ListItemText primary={t(item.labelKey)} />
      </ListItemButton>
    )
    return (
      <li key={item.path}>
        {item.tooltipKey ? (
          <Tooltip title={t(item.tooltipKey)} placement="right">
            <span>{button}</span>
          </Tooltip>
        ) : (
          button
        )}
      </li>
    )
  }

  const drawerContent = (
    <Box>
      <Toolbar />
      <List component="ul">
        {homeItem ? renderItem(homeItem) : null}
        {primaryNavItems.map(renderItem)}
      </List>
      {visibleGroups.map((group) => (
        <Box key={group.key}>
          <Divider />
          {group.standaloneItem && (
            <List component="ul" disablePadding>
              {renderItem(group.standaloneItem)}
            </List>
          )}
          <ListItemButton onClick={() => toggleGroup(group.key)}>
            <ListItemText
              primary={
                <Typography variant="overline" color="text.secondary">
                  {t(group.labelKey)}
                </Typography>
              }
            />
            {isGroupOpen(group.key) ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
          <Collapse in={isGroupOpen(group.key)} unmountOnExit>
            <List component="ul" disablePadding>
              {group.items.map(renderItem)}
            </List>
          </Collapse>
        </Box>
      ))}
    </Box>
  )

  return (
    <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
      <Drawer
        variant={isDesktop ? 'permanent' : 'temporary'}
        open={isDesktop ? true : mobileOpen}
        onClose={() => onCloseMobile()}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        {drawerContent}
      </Drawer>
    </Box>
  )
}
