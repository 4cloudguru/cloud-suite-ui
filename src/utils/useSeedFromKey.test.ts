import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSeedFromKey } from './useSeedFromKey'

describe('useSeedFromKey', () => {
  it('seeds once for a given key, then stops seeding on re-render with the same key', () => {
    const { result, rerender } = renderHook(({ key }) => useSeedFromKey(key), {
      initialProps: { key: 'a' as string | null },
    })
    expect(result.current[0]).toBe(true)

    rerender({ key: 'a' })
    expect(result.current[0]).toBe(false)
  })

  it('seeds again when the key changes', () => {
    const { result, rerender } = renderHook(({ key }) => useSeedFromKey(key), {
      initialProps: { key: 'a' as string | null },
    })
    rerender({ key: 'a' })
    expect(result.current[0]).toBe(false)

    rerender({ key: 'b' })
    expect(result.current[0]).toBe(true)
  })

  it('never seeds while the key is null', () => {
    const { result } = renderHook(() => useSeedFromKey(null))
    expect(result.current[0]).toBe(false)
  })

  it('suppresses seeding while dirty, even when the key changes', () => {
    const { result, rerender } = renderHook(
      ({ key, dirty }) => useSeedFromKey(key, dirty),
      { initialProps: { key: 'a' as string | null, dirty: false } },
    )
    rerender({ key: 'a', dirty: false })
    expect(result.current[0]).toBe(false)

    rerender({ key: 'b', dirty: true })
    expect(result.current[0]).toBe(false)
  })

  it('reseeds the same key after resetSeedTracking is called (dialog reopen pattern)', () => {
    const { result, rerender } = renderHook(({ key }) => useSeedFromKey(key), {
      initialProps: { key: 'a' as string | null },
    })
    rerender({ key: 'a' })
    expect(result.current[0]).toBe(false)

    act(() => result.current[1]())
    rerender({ key: 'a' })
    expect(result.current[0]).toBe(true)
  })
})
