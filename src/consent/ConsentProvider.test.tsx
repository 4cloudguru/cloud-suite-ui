import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { ConsentProvider, useConsent } from './ConsentProvider'

function Probe() {
  const { preferences, hasConsented, updatePreferences, acceptAll, rejectAll } = useConsent()
  return (
    <div>
      <span data-testid="consented">{String(hasConsented)}</span>
      <span data-testid="analytics">{String(preferences.analytics)}</span>
      <span data-testid="errorReporting">{String(preferences.errorReporting)}</span>
      <button onClick={acceptAll}>accept-all</button>
      <button onClick={rejectAll}>reject-all</button>
      <button onClick={() => updatePreferences({ analytics: true })}>enable-analytics</button>
    </div>
  )
}

describe('ConsentProvider', () => {
  beforeEach(() => localStorage.clear())

  it('starts with no consent and default preferences', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    expect(screen.getByTestId('consented')).toHaveTextContent('false')
    expect(screen.getByTestId('analytics')).toHaveTextContent('false')
  })

  it('acceptAll records consent and enables every category', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    act(() => screen.getByText('accept-all').click())
    expect(screen.getByTestId('consented')).toHaveTextContent('true')
    expect(screen.getByTestId('analytics')).toHaveTextContent('true')
    expect(screen.getByTestId('errorReporting')).toHaveTextContent('true')
    expect(JSON.parse(localStorage.getItem('test-consent')!).analytics).toBe(true)
  })

  it('rejectAll records consent but keeps only essential enabled', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    act(() => screen.getByText('reject-all').click())
    expect(screen.getByTestId('consented')).toHaveTextContent('true')
    expect(screen.getByTestId('analytics')).toHaveTextContent('false')
  })

  it('updatePreferences merges a partial change and always keeps essential=true', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    act(() => screen.getByText('enable-analytics').click())
    expect(screen.getByTestId('analytics')).toHaveTextContent('true')
  })

  it('falls back to defaults when stored preferences are corrupted JSON', () => {
    localStorage.setItem('test-consent', '{not valid json')
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    expect(screen.getByTestId('consented')).toHaveTextContent('false')
    expect(screen.getByTestId('analytics')).toHaveTextContent('false')
  })

  it('loads previously-stored consented preferences on mount', () => {
    localStorage.setItem(
      'test-consent',
      JSON.stringify({ essential: true, errorReporting: true, performanceReporting: false, analytics: true }),
    )
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    expect(screen.getByTestId('consented')).toHaveTextContent('true')
    expect(screen.getByTestId('analytics')).toHaveTextContent('true')
  })

  it('coerces tampered non-boolean opt-in fields to false (strict boolean, not truthy)', () => {
    // A string "false" is truthy in JS; a string "true" is also not a real boolean consent.
    localStorage.setItem(
      'test-consent',
      JSON.stringify({ essential: true, errorReporting: 'true', analytics: 'false' }),
    )
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    expect(screen.getByTestId('consented')).toHaveTextContent('true')
    expect(screen.getByTestId('analytics')).toHaveTextContent('false')
    expect(screen.getByTestId('errorReporting')).toHaveTextContent('false')
  })

  it('treats a non-object stored value (primitive/array) as no consent', () => {
    localStorage.setItem('test-consent', JSON.stringify(['analytics']))
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    expect(screen.getByTestId('consented')).toHaveTextContent('false')
    expect(screen.getByTestId('analytics')).toHaveTextContent('false')
  })

  it('does not throw when localStorage.setItem fails (e.g. quota exceeded)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    render(
      <ConsentProvider storageKey="test-consent">
        <Probe />
      </ConsentProvider>,
    )
    expect(() => act(() => screen.getByText('accept-all').click())).not.toThrow()
    expect(screen.getByTestId('consented')).toHaveTextContent('true')
    setItem.mockRestore()
  })

  it('warns once when no storageKey is supplied (default-key collision risk)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    function NoKey() {
      useEffect(() => { }, [])
      return (
        <ConsentProvider>
          <Probe />
        </ConsentProvider>
      )
    }
    render(<NoKey />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no storageKey prop was given'))
    warn.mockRestore()
  })

  it('useConsent throws when used outside a ConsentProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Bare() {
      useConsent()
      return null
    }
    expect(() => render(<Bare />)).toThrow('useConsent must be used within a ConsentProvider')
    spy.mockRestore()
  })

  it('memoizes the context value so a parent re-render with unchanged consent state keeps the same object', () => {
    const values: unknown[] = []
    function CaptureProbe() {
      values.push(useConsent())
      return null
    }
    function Wrapper() {
      const [tick, setTick] = useState(0)
      return (
        <ConsentProvider storageKey="test-consent">
          <CaptureProbe />
          <button onClick={() => setTick((t) => t + 1)}>tick {tick}</button>
        </ConsentProvider>
      )
    }
    render(<Wrapper />)
    act(() => screen.getByText(/tick/).click())
    expect(values.length).toBeGreaterThanOrEqual(2)
    expect(values[1]).toBe(values[0])
  })
})
