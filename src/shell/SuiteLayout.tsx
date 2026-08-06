import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Outlet, Link as RouterLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import MenuIcon from '@mui/icons-material/Menu'
import Brightness4 from '@mui/icons-material/Brightness4'
import Brightness7 from '@mui/icons-material/Brightness7'
import AccountCircle from '@mui/icons-material/AccountCircle'
import LogoutIcon from '@mui/icons-material/Logout'
import LoginIcon from '@mui/icons-material/Login'
import TranslateIcon from '@mui/icons-material/Translate'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import SettingsIcon from '@mui/icons-material/Settings'
import CheckIcon from '@mui/icons-material/Check'
import { useAuth, SessionExpiryWarning } from '../identity'
import { useThemeMode } from '../theme'
import { safeGetItem, safeRemoveItem, safeSetItem, warnIfDefaultKey } from '../utils/storage'
import { resolveRoutePath } from '../utils/url'
import type { NavGroup, NavItem } from './types'

const DRAWER_WIDTH = 240
// Sentinel compared against groupStateStorageKey to decide when to nudge integrators via
// warnIfDefaultKey — see the groupStateStorageKey JSDoc below.
const DEFAULT_GROUP_STATE_KEY = 'suite-nav-groups'

export interface SuiteLanguageOption {
  code: string
  label: string
}

export interface SuiteLayoutProps {
  /** Standalone Home item shown above the grouped sections. */
  homeItem: NavItem
  /** Flat nav items shown above the collapsible groups (optional). */
  primaryNavItems?: NavItem[]
  /** Collapsible, scope-filtered feature/admin groups. */
  navGroups?: NavGroup[]
  /** Element rendered at the start of the AppBar (e.g. a SuiteSwitcher). */
  suiteSwitcher?: ReactNode
  /** Extra AppBar actions inserted before the theme toggle (help, search, etc.). */
  appBarActions?: ReactNode
  /** Overlay element rendered at the root (e.g. a command palette). */
  commandPalette?: ReactNode
  /**
   * Content rendered inside the main container, above the routed Outlet (e.g.
   * breadcrumbs or an advisory banner). Re-renders with the route.
   */
  contentHeader?: ReactNode
  /**
   * Right inset (px) applied to the main content on desktop, e.g. to make room
   * for a persistent right-hand help panel. Animated. Default 0.
   */
  contentInsetRight?: number
  /** Fallback shown while a lazy routed page loads. Default a centered spinner. */
  contentFallback?: ReactNode
  /**
   * When set (per app), collapsible group open/closed state is persisted to
   * localStorage under this key and every group defaults to open. Omit for
   * in-memory state where only the active group starts open. If this exactly
   * matches the library's generic default key, a one-time console.warn nudges
   * you to pass an app-specific key so two same-origin sibling suite apps
   * don't collide (see warnIfDefaultKey).
   */
  groupStateStorageKey?: string
  /**
   * Combine the theme toggle and language picker into a single Settings (gear)
   * menu instead of separate AppBar controls. Default false (separate controls).
   */
  settingsMenu?: boolean
  /**
   * Optional support/help control (a self-contained button + menu) rendered
   * between the settings control and the account control.
   */
  supportMenu?: ReactNode
  /** Languages for the language menu; omit/empty to hide it. */
  languages?: SuiteLanguageOption[]
  /** Content container max width (default 'lg'). */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | false
  /** Route for the sign-in button when unauthenticated (default '/login'). */
  loginPath?: string
}

// Strictly coerce a parsed (and therefore untrusted) group-open-state record: only entries whose
// value is the boolean literal true/false are kept, so a tampered/legacy value (string, number,
// nested object/array) can't corrupt rendering \u2014 it's simply dropped and that group falls back
// to defaultGroupOpen(key) via the isGroupOpen/toggleGroup `??` lookup, same as a never-persisted
// key. Mirrors ConsentProvider's sanitizePreferences.
function sanitizeGroupState(parsed: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') result[key] = value
  }
  return result
}

/**
 * Parameterised application shell shared by the suite apps: fixed AppBar (brand,
 * suite switcher slot, theme toggle, language + account menus), a responsive
 * Drawer rendering the injected nav (scope-filtered, collapsible groups, active
 * styling), a skip link, the routed content outlet, and the session-expiry
 * warning. Branding (logo or product name) comes from the theme/whitelabel context.
 */
export function SuiteLayout({
  homeItem,
  primaryNavItems = [],
  navGroups = [],
  suiteSwitcher,
  appBarActions,
  commandPalette,
  contentHeader,
  contentInsetRight = 0,
  contentFallback,
  groupStateStorageKey,
  settingsMenu = false,
  supportMenu,
  languages = [],
  maxWidth = 'lg',
  loginPath = '/login',
}: SuiteLayoutProps) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { mode, toggleTheme, productName, logoUrl } = useThemeMode()
  const { isAuthenticated, isLoading, user, logout, hasScope } = useAuth()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))

  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null)
  const [langAnchor, setLangAnchor] = useState<null | HTMLElement>(null)
  const [settingsAnchor, setSettingsAnchor] = useState<null | HTMLElement>(null)
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
        onClick={() => setMobileOpen(false)}
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

  const changeLanguage = (code: string) => {
    void i18n.changeLanguage(code)
    setLangAnchor(null)
    setSettingsAnchor(null)
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 0,
          '&:focus': {
            left: 8,
            top: 8,
            zIndex: (z) => z.zIndex.tooltip + 1,
            px: 2,
            py: 1,
            bgcolor: 'background.paper',
            borderRadius: 1,
          },
        }}
      >
        {t('a11y.skipToContent', { defaultValue: 'Skip to content' })}
      </Box>

      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar>
          {!isDesktop && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={t('nav.toggle', { defaultValue: 'Toggle navigation' })}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          {suiteSwitcher}
          <Box
            component={RouterLink}
            to="/"
            aria-label={productName}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              color: 'inherit',
              textDecoration: 'none',
              ml: suiteSwitcher ? 1 : 0,
            }}
          >
            {logoUrl ? (
              <Box
                component="img"
                src={logoUrl}
                alt={productName}
                sx={{ height: 32, maxWidth: 180, objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
                {productName}
              </Typography>
            )}
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          {appBarActions}
          {settingsMenu ? (
            <>
              <Tooltip title={t('settings.title', { defaultValue: 'Settings' })}>
                <IconButton
                  color="inherit"
                  onClick={(e) => setSettingsAnchor(e.currentTarget)}
                  aria-label={t('settings.title', { defaultValue: 'Settings' })}
                >
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={settingsAnchor}
                open={Boolean(settingsAnchor)}
                onClose={() => setSettingsAnchor(null)}
              >
                <MenuItem
                  onClick={() => {
                    toggleTheme()
                    setSettingsAnchor(null)
                  }}
                >
                  <ListItemIcon>
                    {mode === 'dark' ? (
                      <Brightness7 fontSize="small" />
                    ) : (
                      <Brightness4 fontSize="small" />
                    )}
                  </ListItemIcon>
                  {mode === 'dark'
                    ? t('settings.themeLight', { defaultValue: 'Light mode' })
                    : t('settings.themeDark', { defaultValue: 'Dark mode' })}
                </MenuItem>
                {languages.length > 0 && <Divider />}
                {languages.map((l) => (
                  <MenuItem
                    key={l.code}
                    selected={i18n.language?.startsWith(l.code)}
                    onClick={() => changeLanguage(l.code)}
                  >
                    <ListItemIcon>
                      {i18n.language?.startsWith(l.code) ? <CheckIcon fontSize="small" /> : null}
                    </ListItemIcon>
                    {l.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          ) : (
            <>
              <Tooltip title={t('theme.toggle', { defaultValue: 'Toggle theme' })}>
                <IconButton
                  color="inherit"
                  onClick={toggleTheme}
                  aria-label={t('theme.toggle', { defaultValue: 'Toggle theme' })}
                >
                  {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
                </IconButton>
              </Tooltip>
              {languages.length > 0 && (
                <>
                  <Tooltip title={t('language.select', { defaultValue: 'Language' })}>
                    <IconButton
                      color="inherit"
                      onClick={(e) => setLangAnchor(e.currentTarget)}
                      aria-label={t('language.select', { defaultValue: 'Language' })}
                    >
                      <TranslateIcon />
                    </IconButton>
                  </Tooltip>
                  <Menu
                    anchorEl={langAnchor}
                    open={Boolean(langAnchor)}
                    onClose={() => setLangAnchor(null)}
                  >
                    {languages.map((l) => (
                      <MenuItem
                        key={l.code}
                        selected={i18n.language?.startsWith(l.code)}
                        onClick={() => changeLanguage(l.code)}
                      >
                        {l.label}
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              )}
            </>
          )}
          {supportMenu}
          {isAuthenticated ? (
            <>
              <Tooltip title={user?.name ?? user?.email ?? ''}>
                <IconButton
                  color="inherit"
                  onClick={(e) => setAccountAnchor(e.currentTarget)}
                  aria-label={t('header.account', { defaultValue: 'Account' })}
                >
                  <AccountCircle />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={accountAnchor}
                open={Boolean(accountAnchor)}
                onClose={() => setAccountAnchor(null)}
              >
                <MenuItem disabled sx={{ opacity: 1 }}>
                  <Box>
                    {user?.name && <Typography variant="body2">{user.name}</Typography>}
                    {user?.email && (
                      <Typography variant="caption" color="text.secondary">
                        {user.email}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={() => {
                    setAccountAnchor(null)
                    // Persisted nav-group state is cleared by the isAuthenticated-transition
                    // effect above, not here — logout() flips isAuthenticated, which is the one
                    // mechanism covering this click and every other session-ending path.
                    logout()
                  }}
                >
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  {t('auth.signOut', { defaultValue: 'Sign out' })}
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              color="inherit"
              startIcon={<LoginIcon />}
              component={RouterLink}
              to={resolveRoutePath(loginPath, '/', 'SuiteLayout')}
            >
              {t('header.login', { defaultValue: 'Sign in' })}
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        id="main-content"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          transition: theme.transitions.create('margin'),
          mr: { md: contentInsetRight ? `${contentInsetRight}px` : 0 },
        }}
      >
        <Toolbar />
        <Container
          maxWidth={maxWidth}
          sx={{
            py: 4,
            mx: 0,
            // Left-align any page-provided nested Containers instead of letting
            // their default `auto` margins center them within the content area.
            '& .MuiContainer-root': { marginLeft: 0 },
          }}
        >
          {contentHeader}
          <Suspense
            fallback={
              contentFallback ?? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                  <CircularProgress aria-label={t('common.loading', { defaultValue: 'Loading' })} />
                </Box>
              )
            }
          >
            <Outlet />
          </Suspense>
        </Container>
      </Box>

      {commandPalette}
      <SessionExpiryWarning />
    </Box>
  )
}
