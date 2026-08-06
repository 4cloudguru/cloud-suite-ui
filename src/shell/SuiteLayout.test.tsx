import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lazy, type ReactNode } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StorageIcon from '@mui/icons-material/Storage'
import { SuiteLayout, type SuiteLayoutProps } from './SuiteLayout'
import { SuiteThemeProvider } from '../theme'
import { AuthProvider, useAuth, type AuthApi } from '../identity'
import type { NavGroup } from './types'

const api: AuthApi = {
  getCurrentUser: vi.fn().mockResolvedValue({
    user: { id: '1', email: 'a@b.com', name: 'Ada' },
    memberships: [],
    allowed_scopes: ['admin'],
  }),
  login: vi.fn(),
  devLogin: vi.fn().mockResolvedValue(undefined),
  ldapLogin: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn(),
  refreshToken: vi.fn().mockResolvedValue({ expires_in: 3600 }),
}

const homeItem = { path: '/', labelKey: 'Home', icon: <StorageIcon />, scope: null }

function makeApi(scopes: string[] = ['admin']): AuthApi {
  return {
    ...api,
    getCurrentUser: vi.fn().mockResolvedValue({
      user: { id: '1', email: 'a@b.com', name: 'Ada' },
      memberships: [],
      allowed_scopes: scopes,
    }),
  }
}

// Drives a session-termination path other than the interactive sign-out click (see the
// 'clears persisted nav-group state when the session ends without the sign-out click' test).
function RefreshTrigger() {
  const { refreshSession } = useAuth()
  return <button onClick={() => void refreshSession()}>trigger-refresh</button>
}

function renderLayout(
  props: Partial<SuiteLayoutProps> = {},
  opts: { authApi?: AuthApi; child?: ReactNode } = {},
) {
  const { authApi = api, child = <div>routed content</div> } = opts
  return render(
    <SuiteThemeProvider defaultProductName="Test Suite">
      <AuthProvider api={authApi}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<SuiteLayout homeItem={homeItem} {...props} />}>
              <Route path="/" element={child} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </SuiteThemeProvider>,
  )
}

const adminGroup: NavGroup = {
  key: 'admin',
  labelKey: 'Administration',
  standaloneItem: { path: '/admin', labelKey: 'Dashboard', icon: <StorageIcon />, scope: null },
  items: [{ path: '/admin/users', labelKey: 'Users', icon: <StorageIcon />, scope: 'admin' }],
}

beforeEach(() => {
  localStorage.clear()
})

// Several tests below spy on console.warn with a plain (non-restoring) vi.spyOn; without this,
// an earlier test's recorded calls leak into a later test's `.not.toHaveBeenCalledWith(...)`
// assertion, since console.warn is a shared global that stays mocked until restored.
afterEach(() => {
  vi.restoreAllMocks()
})

describe('SuiteLayout', () => {
  it('renders the brand product name and the routed content', async () => {
    renderLayout()
    expect(await screen.findByText('Test Suite')).toBeInTheDocument()
    expect(screen.getByText('routed content')).toBeInTheDocument()
  })

  it('shows the user name and email in the account menu', async () => {
    renderLayout()
    fireEvent.click(await screen.findByRole('button', { name: 'Account' }))
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('a@b.com')).toBeInTheDocument()
  })

  it('renders the whitelabel logo as the brand when the theme provides one', async () => {
    render(
      <SuiteThemeProvider
        defaultProductName="Test Suite"
        getUITheme={() => ({ logo_url: 'https://example.test/logo.png', product_name: 'Test Suite' })}
      >
        <AuthProvider api={api}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<SuiteLayout homeItem={homeItem} />}>
                <Route path="/" element={<div>routed content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </SuiteThemeProvider>,
    )
    const logo = await screen.findByRole('img', { name: 'Test Suite' })
    expect(logo).toHaveAttribute('src', 'https://example.test/logo.png')
  })

  it('shows separate theme and language controls by default', async () => {
    renderLayout({ languages: [{ code: 'en', label: 'English' }] })
    expect(await screen.findByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('combines theme and language into a single Settings menu when settingsMenu is set', async () => {
    renderLayout({
      settingsMenu: true,
      languages: [
        { code: 'en', label: 'English' },
        { code: 'es', label: 'Español' },
      ],
    })
    const settingsButton = await screen.findByRole('button', { name: 'Settings' })
    expect(screen.queryByRole('button', { name: 'Toggle theme' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Language' })).not.toBeInTheDocument()

    fireEvent.click(settingsButton)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText(/mode$/i)).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'English' })).toBeInTheDocument()

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Español' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('toggles the theme from the Settings menu and closes it', async () => {
    renderLayout({ settingsMenu: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /mode$/i }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('renders the supportMenu slot', async () => {
    renderLayout({ supportMenu: <button>support-slot</button> })
    expect(await screen.findByRole('button', { name: 'support-slot' })).toBeInTheDocument()
  })

  it('renders the contentHeader above the routed content', async () => {
    renderLayout({ contentHeader: <div>breadcrumbs-slot</div> })
    expect(await screen.findByText('breadcrumbs-slot')).toBeInTheDocument()
    expect(screen.getByText('routed content')).toBeInTheDocument()
  })

  it('renders a group standaloneItem when the group is visible', async () => {
    renderLayout({ navGroups: [adminGroup] }, { authApi: makeApi(['admin']) })
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Administration')).toBeInTheDocument()
  })

  it('shows an item with scope omitted to any authenticated user (optional scope)', async () => {
    const group: NavGroup = {
      key: 'main',
      labelKey: 'Main',
      // No scope key at all — the new optional default; visible without any scopes.
      items: [{ path: '/things', labelKey: 'Things', icon: <StorageIcon /> }],
    }
    renderLayout(
      { navGroups: [group], groupStateStorageKey: 'test-optional-scope' },
      { authApi: makeApi([]) },
    )
    expect(await screen.findByRole('link', { name: 'Things' })).toBeInTheDocument()
  })

  it('hides the standaloneItem when the group is scope-filtered out', async () => {
    renderLayout({ navGroups: [adminGroup] }, { authApi: makeApi([]) })
    await screen.findByText('Test Suite')
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('persists group open-state to localStorage when groupStateStorageKey is set', async () => {
    renderLayout(
      { navGroups: [adminGroup], groupStateStorageKey: 'test-groups' },
      { authApi: makeApi(['admin']) },
    )
    expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Administration'))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('test-groups') ?? '{}').admin).toBe(false),
    )
  })

  it('restores collapsed group state from localStorage', async () => {
    localStorage.setItem('test-groups', JSON.stringify({ admin: false }))
    renderLayout(
      { navGroups: [adminGroup], groupStateStorageKey: 'test-groups' },
      { authApi: makeApi(['admin']) },
    )
    expect(await screen.findByText('Administration')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('shows a loading fallback while a lazy page resolves', async () => {
    const Lazy = lazy(() => Promise.resolve({ default: () => <div>lazy-loaded</div> }))
    renderLayout({}, { child: <Lazy /> })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(await screen.findByText('lazy-loaded')).toBeInTheDocument()
  })

  it('falls back the Home nav link to "/" and warns when homeItem.path is unsafe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderLayout({ homeItem: { ...homeItem, path: '//evil.example.com' } })
    const link = await screen.findByRole('link', { name: 'Home' })
    expect(link).toHaveAttribute('href', '/')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe route path "//evil.example.com"'))
  })

  it('falls back the login link to "/" and warns when loginPath is unsafe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const unauthApi: AuthApi = { ...api, getCurrentUser: vi.fn().mockRejectedValue(new Error('401')) }
    renderLayout({ loginPath: '//evil.example.com' }, { authApi: unauthApi })
    const link = await screen.findByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', '/')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe route path "//evil.example.com"'))
  })

  it.each([
    ['an array', JSON.stringify(['not', 'an', 'object'])],
    ['a primitive string', JSON.stringify('nope')],
    ['a primitive number', JSON.stringify(42)],
    ['an object with non-boolean values', JSON.stringify({ admin: 'yes', other: 1 })],
  ])('ignores malformed persisted group state (%s) and falls back to default-open', async (_label, stored) => {
    localStorage.setItem('test-malformed', stored)
    renderLayout(
      { navGroups: [adminGroup], groupStateStorageKey: 'test-malformed' },
      { authApi: makeApi(['admin']) },
    )
    // Persistence is enabled with no VALID stored entry for 'admin', so it falls back to
    // defaultGroupOpen('admin') = true (every group defaults open when persistence is on).
    expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument()
  })

  it('warns when groupStateStorageKey matches the library\'s shared default key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderLayout({ groupStateStorageKey: 'suite-nav-groups' })
    await screen.findByText('Test Suite')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('generic key "suite-nav-groups"'))
  })

  it('does not warn about the default key when groupStateStorageKey is app-specific', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    renderLayout({ groupStateStorageKey: 'my-app-nav-groups' })
    await screen.findByText('Test Suite')
    // Narrowed to the SuiteLayout-specific default key: renderLayout's SuiteThemeProvider wrapper
    // has no storageKey of its own either, so it always emits its own (unrelated, expected)
    // "generic key" warning about "suite-theme" — a bare 'generic key' match would also catch that.
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('generic key "suite-nav-groups"'))
  })

  it('clears persisted group state on sign-out', async () => {
    localStorage.setItem('test-groups-signout', JSON.stringify({ admin: false }))
    renderLayout(
      { navGroups: [adminGroup], groupStateStorageKey: 'test-groups-signout' },
      { authApi: makeApi(['admin']) },
    )
    await screen.findByText('Test Suite')
    expect(localStorage.getItem('test-groups-signout')).not.toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: 'Account' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(localStorage.getItem('test-groups-signout')).toBeNull()
  })

  it('clears persisted nav-group state when the session ends without the sign-out click (e.g. a failed refresh)', async () => {
    const failingRefreshApi: AuthApi = {
      ...makeApi(['admin']),
      refreshToken: vi.fn().mockRejectedValue(new Error('refresh failed')),
    }
    renderLayout(
      { navGroups: [adminGroup], groupStateStorageKey: 'test-groups-refresh-fail' },
      { authApi: failingRefreshApi, child: <RefreshTrigger /> },
    )
    await screen.findByRole('link', { name: 'Users' })
    localStorage.setItem('test-groups-refresh-fail', JSON.stringify({ admin: false }))

    await act(async () => {
      screen.getByRole('button', { name: 'trigger-refresh' }).click()
    })
    await waitFor(() => expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument())
    expect(localStorage.getItem('test-groups-refresh-fail')).toBeNull()
  })

  it('does not clear persisted nav-group state on an initial unauthenticated mount', async () => {
    localStorage.setItem('test-groups-initial-unauth', JSON.stringify({ admin: false }))
    const unauthApi: AuthApi = { ...api, getCurrentUser: vi.fn().mockRejectedValue(new Error('401')) }
    renderLayout(
      { navGroups: [adminGroup], groupStateStorageKey: 'test-groups-initial-unauth' },
      { authApi: unauthApi },
    )
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem('test-groups-initial-unauth')).not.toBeNull()
  })
})
