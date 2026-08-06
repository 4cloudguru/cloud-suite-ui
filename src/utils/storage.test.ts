import { describe, expect, it, vi, afterEach } from 'vitest'
import { safeGetItem, safeRemoveItem, safeSetItem, warnIfDefaultKey } from './storage'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('safeGetItem', () => {
  it('returns the stored value', () => {
    localStorage.setItem('k', 'v')
    expect(safeGetItem('k')).toBe('v')
  })

  it('returns null when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(safeGetItem('k')).toBeNull()
  })
})

describe('safeSetItem', () => {
  it('writes the value', () => {
    safeSetItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
  })

  it('does not throw when localStorage.setItem throws (quota/disabled)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => safeSetItem('k', 'v')).not.toThrow()
  })
})

describe('safeRemoveItem', () => {
  it('removes the stored value', () => {
    localStorage.setItem('k', 'v')
    safeRemoveItem('k')
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('does not throw when localStorage.removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => safeRemoveItem('k')).not.toThrow()
  })
})

describe('warnIfDefaultKey', () => {
  it('warns when the key equals the default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    warnIfDefaultKey('SuiteThemeProvider', 'suite-theme', 'suite-theme')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no storageKey prop was given'))
  })

  it('is a no-op when a custom key is supplied', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    warnIfDefaultKey('SuiteThemeProvider', 'registry-theme', 'suite-theme')
    expect(warn).not.toHaveBeenCalled()
  })
})
