import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AppBar,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import Brightness4 from '@mui/icons-material/Brightness4'
import Brightness7 from '@mui/icons-material/Brightness7'
import AccountCircle from '@mui/icons-material/AccountCircle'
import LogoutIcon from '@mui/icons-material/Logout'
import LoginIcon from '@mui/icons-material/Login'
import TranslateIcon from '@mui/icons-material/Translate'
import SettingsIcon from '@mui/icons-material/Settings'
import CheckIcon from '@mui/icons-material/Check'
import { useAuth } from '../identity'
import { useThemeMode } from '../theme'
import { resolveRoutePath } from '../utils/url'
import type { SuiteLanguageOption } from './types'

export interface SuiteAppBarProps {
  /** True at md+ breakpoints — hides the mobile nav-toggle button. */
  isDesktop: boolean
  /** Opens/closes the temporary (mobile) nav Drawer. */
  onToggleMobileNav: () => void
  /** Element rendered at the start of the AppBar (e.g. a SuiteSwitcher). */
  suiteSwitcher?: ReactNode
  /** Extra AppBar actions inserted before the theme toggle (help, search, etc.). */
  appBarActions?: ReactNode
  /** Combine the theme toggle and language picker into a single Settings (gear) menu. */
  settingsMenu: boolean
  /**
   * Optional support/help control (a self-contained button + menu) rendered
   * between the settings control and the account control.
   */
  supportMenu?: ReactNode
  /** Languages for the language menu; empty hides it. */
  languages: SuiteLanguageOption[]
  /** Route for the sign-in button when unauthenticated. */
  loginPath: string
}

/**
 * Fixed AppBar: brand, suite switcher slot, theme toggle + language picker
 * (combined into one Settings menu or shown separately), account/sign-in
 * control. Internal to SuiteLayout.
 */
export function SuiteAppBar({
  isDesktop,
  onToggleMobileNav,
  suiteSwitcher,
  appBarActions,
  settingsMenu,
  supportMenu,
  languages,
  loginPath,
}: SuiteAppBarProps) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const { mode, toggleTheme, productName, logoUrl } = useThemeMode()
  const { isAuthenticated, user, logout } = useAuth()

  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null)
  const [langAnchor, setLangAnchor] = useState<null | HTMLElement>(null)
  const [settingsAnchor, setSettingsAnchor] = useState<null | HTMLElement>(null)

  const changeLanguage = (code: string) => {
    void i18n.changeLanguage(code)
    setLangAnchor(null)
    setSettingsAnchor(null)
  }

  // Shared by the combined Settings menu and the separate language Menu below so the
  // selected-language check and click handler can't drift between the two branches — only the
  // CheckIcon prefix (Settings-menu-only) differs.
  const languageMenuItems = (withCheckIcon: boolean) =>
    languages.map((l) => {
      const selected = i18n.language?.startsWith(l.code)
      return (
        <MenuItem key={l.code} selected={selected} onClick={() => changeLanguage(l.code)}>
          {withCheckIcon && <ListItemIcon>{selected ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>}
          {l.label}
        </MenuItem>
      )
    })

  return (
    <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
      <Toolbar>
        {!isDesktop && (
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => onToggleMobileNav()}
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
              {languageMenuItems(true)}
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
                  {languageMenuItems(false)}
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
                  // effect in SuiteNavDrawer, not here — logout() flips isAuthenticated, which is
                  // the one mechanism covering this click and every other session-ending path.
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
  )
}
