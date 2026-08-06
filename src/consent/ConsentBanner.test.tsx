import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentProvider } from './ConsentProvider'
import { ConsentBanner } from './ConsentBanner'

describe('ConsentBanner', () => {
  beforeEach(() => localStorage.clear())

  it('is shown until consent is recorded', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('hides once a preference is stored', () => {
    localStorage.setItem(
      'test-consent',
      JSON.stringify({ essential: true, errorReporting: false, performanceReporting: false, analytics: false }),
    )
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a custom privacyPolicyHref when it is a safe URL', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner privacyPolicyHref="https://example.com/legal/privacy" />
      </ConsentProvider>,
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      'https://example.com/legal/privacy',
    )
  })

  it('falls back to the default href when privacyPolicyHref is an unsafe scheme', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner privacyPolicyHref="javascript:alert(1)" />
      </ConsentProvider>,
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  it('records full consent and hides the banner when Accept all is clicked', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('test-consent') ?? '{}')).toEqual({
      essential: true,
      errorReporting: true,
      performanceReporting: true,
      analytics: true,
    })
  })

  it('records essential-only consent and hides the banner when Reject all is clicked', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('test-consent') ?? '{}')).toEqual({
      essential: true,
      errorReporting: false,
      performanceReporting: false,
      analytics: false,
    })
  })

  it('reveals the per-category toggles when Customize is clicked', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    expect(screen.queryByLabelText('Analytics')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    expect(screen.getByLabelText('Analytics')).toBeInTheDocument()
  })

  it('toggling a per-category switch records consent for that preference', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    fireEvent.click(screen.getByLabelText('Analytics'))
    expect(JSON.parse(localStorage.getItem('test-consent') ?? '{}').analytics).toBe(true)
  })

  it('resolves the disclosure paragraph and privacy policy link text through the i18n contract, not a hardcoded string', () => {
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    expect(screen.getByText(/We use cookies and similar technologies/)).toBeInTheDocument()
    expect(screen.getByText(/for details\.$/)).toBeInTheDocument()
    // The guarded href is unaffected by wrapping the link text in t().
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  // #71 backlog: exercise the real button interactions via userEvent (a closer simulation of an
  // actual click than fireEvent), alongside the existing fireEvent coverage above.
  it('accepts all preferences via a real user click', async () => {
    const user = userEvent.setup()
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Accept all' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('test-consent') ?? '{}')).toEqual({
      essential: true,
      errorReporting: true,
      performanceReporting: true,
      analytics: true,
    })
  })

  it('rejects all (essential-only) preferences via a real user click', async () => {
    const user = userEvent.setup()
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Reject all' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('test-consent') ?? '{}')).toEqual({
      essential: true,
      errorReporting: false,
      performanceReporting: false,
      analytics: false,
    })
  })

  it('saves a customized per-category preference via a real user click (a toggle persists immediately — there is no separate Save button)', async () => {
    const user = userEvent.setup()
    render(
      <ConsentProvider storageKey="test-consent">
        <ConsentBanner />
      </ConsentProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    await user.click(screen.getByLabelText('Analytics'))
    expect(JSON.parse(localStorage.getItem('test-consent') ?? '{}').analytics).toBe(true)
  })
})
