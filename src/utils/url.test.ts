import { describe, expect, it, vi } from 'vitest'
import { isSafeRoutePath, isSafeUrl, resolveRoutePath } from './url'

describe('isSafeUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/path?x=1',
    'mailto:a@b.com',
    'tel:+15551234567',
    '/relative/path',
    './relative',
    '#anchor',
  ])('accepts %s', (value) => {
    expect(isSafeUrl(value)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'javascript:alert(1)//safe.com',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    // Embedded tab/newline/CR: the WHATWG URL parser strips these before parsing, so each of
    // these would be normalized to the protocol-relative "//evil.com" (off-origin redirect) at
    // the sink. They must be rejected here despite looking like a leading-'/' relative path.
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
    '/safe\t//evil.com',
    '',
    '   ',
    null,
    undefined,
  ])('rejects %s', (value) => {
    expect(isSafeUrl(value as string | null | undefined)).toBe(false)
  })

  it('does not throw and returns false for truthy non-string inputs', () => {
    expect(isSafeUrl(123 as unknown as string)).toBe(false)
    expect(isSafeUrl({} as unknown as string)).toBe(false)
    expect(isSafeUrl([] as unknown as string)).toBe(false)
    expect(isSafeUrl(true as unknown as string)).toBe(false)
  })
})

describe('isSafeRoutePath', () => {
  it.each(['/', '/dashboard', '/modules/123', '/a/b?x=1#y'])('accepts %s', (value) => {
    expect(isSafeRoutePath(value)).toBe(true)
  })

  it.each([
    // Never a valid in-app route target, even though isSafeUrl accepts these for href/src sinks.
    'https://example.com',
    'mailto:a@b.com',
    '#anchor',
    './relative',
    'relative',
    // Protocol-relative / backslash tricks, same class isSafeUrl rejects.
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/\t/evil.com',
    '',
    '   ',
    null,
    undefined,
  ])('rejects %s', (value) => {
    expect(isSafeRoutePath(value as string | null | undefined)).toBe(false)
  })

  it('does not throw and returns false for truthy non-string inputs', () => {
    expect(isSafeRoutePath(123 as unknown as string)).toBe(false)
    expect(isSafeRoutePath({} as unknown as string)).toBe(false)
  })
})

describe('resolveRoutePath', () => {
  it('returns the value unchanged when safe', () => {
    expect(resolveRoutePath('/dashboard', '/', 'Test')).toBe('/dashboard')
  })

  it('falls back and warns when the value is unsafe', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(resolveRoutePath('//evil.com', '/', 'Test')).toBe('/')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe route path'))
    warn.mockRestore()
  })
})

