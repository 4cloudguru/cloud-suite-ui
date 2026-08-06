import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { SuiteThemeProvider, useThemeMode, readInitialMode, readReducedMotion } from './SuiteThemeProvider'
import type { UIThemeConfig } from './types'

function Probe() {
  const { mode, productName, logoUrl, loginHeroUrl, toggleTheme } = useThemeMode()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="product">{productName}</span>
      <span data-testid="logo">{logoUrl ?? 'none'}</span>
      <span data-testid="hero">{loginHeroUrl ?? 'none'}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  )
}

const renderProvider = (props: Partial<ComponentProps<typeof SuiteThemeProvider>> = {}) =>
  render(
    <SuiteThemeProvider storageKey="tk" {...props}>
      <Probe />
    </SuiteThemeProvider>,
  )

describe('SuiteThemeProvider', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove())
  })

  it('provides defaults and renders children when no whitelabel config is given', () => {
    renderProvider()
    expect(screen.getByTestId('product')).toHaveTextContent('Terraform Suite')
    expect(screen.getByTestId('logo')).toHaveTextContent('none')
    // matchMedia mock reports matches:false, so the default is light.
    expect(screen.getByTestId('mode')).toHaveTextContent('light')
  })

  it('toggles the mode and persists the choice to localStorage', () => {
    renderProvider()
    expect(screen.getByTestId('mode')).toHaveTextContent('light')
    act(() => screen.getByText('toggle').click())
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(localStorage.getItem('tk')).toBe('dark')
  })

  it('reads the initial mode from localStorage', () => {
    localStorage.setItem('tk', 'dark')
    renderProvider()
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
  })

  it('applies an async whitelabel config and keeps safe logo/hero URLs', async () => {
    const config: UIThemeConfig = {
      product_name: 'Registry',
      logo_url: 'https://cdn.example/logo.png',
      login_hero_url: 'https://cdn.example/hero.png',
      primary_color: '#123456',
    }
    renderProvider({ getUITheme: vi.fn().mockResolvedValue(config) })
    await waitFor(() => expect(screen.getByTestId('product')).toHaveTextContent('Registry'))
    expect(screen.getByTestId('logo')).toHaveTextContent('https://cdn.example/logo.png')
    expect(screen.getByTestId('hero')).toHaveTextContent('https://cdn.example/hero.png')
  })

  it('drops an unsafe logo URL from the whitelabel config', async () => {
    const config: UIThemeConfig = { product_name: 'Registry', logo_url: 'javascript:alert(1)' }
    renderProvider({ getUITheme: vi.fn().mockResolvedValue(config) })
    await waitFor(() => expect(screen.getByTestId('product')).toHaveTextContent('Registry'))
    expect(screen.getByTestId('logo')).toHaveTextContent('none')
  })

  // Regression guard: unlike logo/hero URLs (rendered through React's own auto-escaping <img src>
  // JSX), the favicon is applied via a direct `link.href = ...` DOM mutation, which bypasses React
  // entirely \u2014 this is a distinct sink and needs its own proof that the isSafeUrl guard runs
  // before the mutation, not just that the guard function itself rejects unsafe input elsewhere.
  it('sets the favicon href when the whitelabel config supplies a safe favicon URL', async () => {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = '/favicon.ico'
    document.head.appendChild(link)
    const config: UIThemeConfig = { product_name: 'Registry', favicon_url: 'https://cdn.example/favicon.png' }
    renderProvider({ getUITheme: vi.fn().mockResolvedValue(config) })
    await waitFor(() => expect(link.href).toBe('https://cdn.example/favicon.png'))
  })

  it('leaves the existing favicon untouched when the whitelabel config supplies an unsafe favicon URL', async () => {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = '/favicon.ico'
    document.head.appendChild(link)
    const config: UIThemeConfig = { product_name: 'Registry', favicon_url: 'javascript:alert(1)' }
    renderProvider({ getUITheme: vi.fn().mockResolvedValue(config) })
    await waitFor(() => expect(screen.getByTestId('product')).toHaveTextContent('Registry'))
    expect(link.href).toContain('/favicon.ico')
  })

  it('does not crash when getUITheme throws synchronously (falls back to defaults)', async () => {
    const getUITheme = vi.fn(() => {
      throw new Error('boom')
    })
    renderProvider({ getUITheme })
    expect(screen.getByTestId('product')).toHaveTextContent('Terraform Suite')
    // Let the microtask queue drain to prove the sync throw was contained (no state flip/crash).
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('product')).toHaveTextContent('Terraform Suite')
  })

  it('does not crash when the whitelabel config supplies an invalid theme color', async () => {
    const config: UIThemeConfig = { product_name: 'Registry', primary_color: 'not-a-color' }
    renderProvider({ getUITheme: vi.fn().mockResolvedValue(config) })
    // createAppTheme must fall back to the built-in palette rather than throw; children still render.
    await waitFor(() => expect(screen.getByTestId('product')).toHaveTextContent('Registry'))
  })

  // Regression guard: getUITheme is a host-provided callback, so its return value's shape is
  // not actually guaranteed at runtime — a misconfigured host (or a compromised/buggy backend
  // behind it) could send non-string fields despite the UIThemeConfig type. Non-string fields
  // must be dropped, not crash the provider or leak through to the URL/colour sinks.
  it('drops non-string whitelabel fields instead of crashing (malformed host config)', async () => {
    const config = {
      product_name: 'Registry',
      logo_url: { evil: true },
      primary_color: 123,
    } as unknown as UIThemeConfig
    renderProvider({ getUITheme: vi.fn().mockResolvedValue(config) })
    await waitFor(() => expect(screen.getByTestId('product')).toHaveTextContent('Registry'))
    expect(screen.getByTestId('logo')).toHaveTextContent('none')
  })

  // Regression guard: the live OS-preference-change listeners called window.matchMedia(...)
  // unguarded — an environment without matchMedia support (older browser, locked-down webview)
  // would throw at mount, taking down the whole provider tree.
  it('does not crash on mount when window.matchMedia is unavailable', () => {
    const original = window.matchMedia
    // @ts-expect-error -- simulating an environment without matchMedia support
    delete window.matchMedia
    try {
      expect(() => renderProvider()).not.toThrow()
      expect(screen.getByTestId('mode')).toHaveTextContent('light')
    } finally {
      window.matchMedia = original
    }
  })

  it('readInitialMode falls back to light when window is unavailable (SSR)', () => {
    vi.stubGlobal('window', undefined)
    try {
      expect(readInitialMode('tk')).toBe('light')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('readReducedMotion falls back to false when window is unavailable (SSR)', () => {
    vi.stubGlobal('window', undefined)
    try {
      expect(readReducedMotion()).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('throws if useThemeMode is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Bare() {
      useThemeMode()
      return null
    }
    expect(() => render(<Bare />)).toThrow('useThemeMode must be used within SuiteThemeProvider')
    spy.mockRestore()
  })
})
