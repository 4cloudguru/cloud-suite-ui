import { Suspense, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Box, CircularProgress, Container, Toolbar, useMediaQuery, useTheme } from '@mui/material'
import { SessionExpiryWarning } from '../identity'
import { SuiteAppBar } from './SuiteAppBar'
import { SuiteNavDrawer } from './SuiteNavDrawer'
import type { NavGroup, NavItem, SuiteLanguageOption } from './types'

export type { SuiteLanguageOption } from './types'

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
  const { t } = useTranslation()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [mobileOpen, setMobileOpen] = useState(false)

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

      <SuiteAppBar
        isDesktop={isDesktop}
        onToggleMobileNav={() => setMobileOpen((v) => !v)}
        suiteSwitcher={suiteSwitcher}
        appBarActions={appBarActions}
        settingsMenu={settingsMenu}
        supportMenu={supportMenu}
        languages={languages}
        loginPath={loginPath}
      />

      <SuiteNavDrawer
        homeItem={homeItem}
        primaryNavItems={primaryNavItems}
        navGroups={navGroups}
        groupStateStorageKey={groupStateStorageKey}
        isDesktop={isDesktop}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

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
