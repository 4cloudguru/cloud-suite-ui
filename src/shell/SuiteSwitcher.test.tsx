import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SuiteSwitcher } from './SuiteSwitcher'

const sameOrigin = (path: string) => new URL(path, window.location.origin).href

describe('SuiteSwitcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.name = ''
  })

  it('renders nothing when there are no links', () => {
    const { container } = render(<SuiteSwitcher links={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('reuses one tab for a SAME-origin sibling: claims the tab, opens by name (no noopener), severs opener, focuses', () => {
    const focus = vi.fn()
    const opened = { focus, opener: {}, closed: false } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    const href = sameOrigin('/state-manager')
    render(
      <SuiteSwitcher
        links={[{ label: 'State Manager', href, appId: 'terraform-state-manager' }]}
        tooltip="Open State Manager"
        currentAppId="terraform-registry"
      />,
    )
    // A single sibling renders a direct-open button (no menu), labelled by the tooltip.
    fireEvent.click(screen.getByRole('button', { name: 'Open State Manager' }))
    expect(window.name).toBe('terraform-registry')
    // Named target, and crucially NO 'noopener' (which would null the returned reference).
    expect(open).toHaveBeenCalledWith(href, 'terraform-state-manager')
    expect(opened.opener).toBeNull()
    expect(focus).toHaveBeenCalledTimes(1)

    // Clicking again while the tab is still open just refocuses it — no re-navigation,
    // so whatever page/state the user left it on is preserved.
    fireEvent.click(screen.getByRole('button', { name: 'Open State Manager' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(2)
  })

  it('reuses one tab for a CROSS-origin sibling too: opens by name (no noopener), severs opener, focuses', () => {
    const focus = vi.fn()
    const opened = { focus, opener: {}, closed: false } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    render(
      <SuiteSwitcher
        links={[{ label: 'State Manager', href: 'https://sm.example', appId: 'terraform-state-manager' }]}
        tooltip="Open State Manager"
        currentAppId="terraform-registry"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open State Manager' }))
    // Cross-origin: the current tab's name is NOT claimed (that's only for the same-origin
    // reciprocal case), but the sibling itself still reuses one tab, same as same-origin.
    expect(window.name).toBe('')
    expect(open).toHaveBeenCalledWith('https://sm.example', 'terraform-state-manager')
    expect(opened.opener).toBeNull()
    expect(focus).toHaveBeenCalledTimes(1)

    // Repeat clicks reuse — this is the fix for tabs piling up on cross-origin siblings.
    fireEvent.click(screen.getByRole('button', { name: 'Open State Manager' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(2)
  })

  it('opens a fresh tab again once the previously-opened sibling tab has been closed', () => {
    const openedMock = { focus: vi.fn(), opener: {}, closed: false }
    const opened = openedMock as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    render(
      <SuiteSwitcher
        links={[{ label: 'State Manager', href: 'https://sm.example', appId: 'terraform-state-manager' }]}
        tooltip="Open State Manager"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open State Manager' }))
    expect(open).toHaveBeenCalledTimes(1)

    openedMock.closed = true
    fireEvent.click(screen.getByRole('button', { name: 'Open State Manager' }))
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('opens a menu when given several links and reuses each sibling by appId (no noopener)', async () => {
    const opened = { focus: vi.fn(), opener: {}, closed: false } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    render(
      <SuiteSwitcher
        links={[
          { label: 'Registry', href: 'https://reg.example', appId: 'terraform-registry' },
          { label: 'State Manager', href: 'https://sm.example', appId: 'terraform-state-manager' },
        ]}
        currentAppId="other"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch app' }))
    fireEvent.click(await screen.findByText('State Manager'))
    expect(open).toHaveBeenCalledWith('https://sm.example', 'terraform-state-manager')
  })

  it('falls back to a plain new tab when a link has no appId', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<SuiteSwitcher links={[{ label: 'Docs', href: 'https://docs.example' }]} tooltip="Open Docs" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Docs' }))
    expect(open).toHaveBeenCalledWith('https://docs.example', '_blank', 'noopener,noreferrer')
  })

  it('refuses to open a link with an unsafe URL scheme', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <SuiteSwitcher
        links={[{ label: 'Evil', href: 'javascript:alert(1)', appId: 'evil' }]}
        tooltip="Open Evil"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Evil' }))
    expect(open).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe link href'))
  })

  it('in the multi-link menu, refuses an unsafe link (warns, does not open)', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <SuiteSwitcher
        links={[
          { label: 'Evil', href: 'javascript:alert(1)', appId: 'evil' },
          { label: 'Docs', href: 'https://docs.example' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch app' }))
    fireEvent.click(screen.getByText('Evil'))
    expect(open).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe link href'))
  })

  it.each(['_self', '_top', '_parent', '_blank', '_SELF', '_Blank'])(
    'refuses to use the reserved window target name "%s" and falls back to a plain new tab',
    (reserved) => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      render(
        <SuiteSwitcher
          links={[{ label: 'Sibling', href: 'https://sibling.example', appId: reserved }]}
          tooltip="Open Sibling"
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Open Sibling' }))
      expect(open).toHaveBeenCalledWith('https://sibling.example', '_blank', 'noopener,noreferrer')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('reserved window target name'))
    },
  )

  it('warns (but still opens) when a link appId matches currentAppId', () => {
    const opened = { focus: vi.fn(), opener: {}, closed: false } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <SuiteSwitcher
        links={[{ label: 'Self-labelled', href: 'https://sibling.example', appId: 'terraform-registry' }]}
        tooltip="Open Sibling"
        currentAppId="terraform-registry"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Sibling' }))
    expect(open).toHaveBeenCalledWith('https://sibling.example', 'terraform-registry')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('matches currentAppId'))
  })
})
