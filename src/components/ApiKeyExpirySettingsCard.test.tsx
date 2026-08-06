import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiKeyExpirySettingsCard, type ApiKeyExpirySettingsValue } from './ApiKeyExpirySettingsCard'

const baseValue: ApiKeyExpirySettingsValue = {
  enabled: true,
  apiKeyExpiring: true,
  warningDays: 7,
  checkIntervalHours: 24,
}

describe('ApiKeyExpirySettingsCard', () => {
  it('shows a loading indicator', () => {
    render(<ApiKeyExpirySettingsCard value={baseValue} isLoading onSave={() => Promise.resolve()} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders the current settings once loaded', () => {
    render(<ApiKeyExpirySettingsCard value={baseValue} onSave={() => Promise.resolve()} />)
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByLabelText(/Warn this many days before expiry/)).toHaveValue(7)
    expect(screen.getByLabelText(/Check for expiring keys every/)).toHaveValue(24)
  })

  it('shows a "notifications disabled" badge when the master switch is off', () => {
    render(<ApiKeyExpirySettingsCard value={{ ...baseValue, enabled: false }} onSave={() => Promise.resolve()} />)
    expect(screen.getByText('Notifications disabled')).toBeInTheDocument()
  })

  it('does not show the badge when notifications are enabled', () => {
    render(<ApiKeyExpirySettingsCard value={baseValue} onSave={() => Promise.resolve()} />)
    expect(screen.queryByText('Notifications disabled')).not.toBeInTheDocument()
  })

  it('disables every field when canManage is false', () => {
    render(<ApiKeyExpirySettingsCard value={baseValue} canManage={false} onSave={() => Promise.resolve()} />)
    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.getByLabelText(/Warn this many days before expiry/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('calls onSave with the edited values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ApiKeyExpirySettingsCard value={baseValue} onSave={onSave} />)

    const warningDaysInput = screen.getByLabelText(/Warn this many days before expiry/)
    await user.clear(warningDaysInput)
    await user.type(warningDaysInput, '14')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ apiKeyExpiring: true, warningDays: 14, checkIntervalHours: 24 }),
    )
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument()
  })

  it('toggling the enable switch is reflected in the saved payload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ApiKeyExpirySettingsCard value={baseValue} onSave={onSave} />)

    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ apiKeyExpiring: false, warningDays: 7, checkIntervalHours: 24 }),
    )
  })

  it('shows an error message when onSave rejects with an Error', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'))
    const user = userEvent.setup()
    render(<ApiKeyExpirySettingsCard value={baseValue} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('nope')).toBeInTheDocument()
  })

  it('falls back to a generic error message for a non-Error rejection', async () => {
    const onSave = vi.fn().mockRejectedValue('nope')
    const user = userEvent.setup()
    render(<ApiKeyExpirySettingsCard value={baseValue} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Failed to save settings.')).toBeInTheDocument()
  })

  it('re-seeds the form when a later value prop change arrives (issue #80)', async () => {
    // First load seeds warningDays=7. A background refetch (isLoading stays
    // false) then surfaces another admin's change to 14 — the form must follow,
    // not keep showing the stale 7 it seeded on first load.
    const { rerender } = render(<ApiKeyExpirySettingsCard value={baseValue} onSave={() => Promise.resolve()} />)
    expect(screen.getByLabelText(/Warn this many days before expiry/)).toHaveValue(7)

    rerender(
      <ApiKeyExpirySettingsCard value={{ ...baseValue, warningDays: 14 }} onSave={() => Promise.resolve()} />,
    )
    await waitFor(() => expect(screen.getByLabelText(/Warn this many days before expiry/)).toHaveValue(14))
  })

  it('preserves in-progress edits when the value prop is unchanged', async () => {
    // A re-render with the SAME loaded value (e.g. a refetch returning identical
    // data) must not clobber what the admin is currently typing.
    const user = userEvent.setup()
    const { rerender } = render(<ApiKeyExpirySettingsCard value={baseValue} onSave={() => Promise.resolve()} />)

    const days = screen.getByLabelText(/Warn this many days before expiry/)
    await user.clear(days)
    await user.type(days, '30')
    expect(days).toHaveValue(30)

    rerender(<ApiKeyExpirySettingsCard value={{ ...baseValue }} onSave={() => Promise.resolve()} />)
    expect(screen.getByLabelText(/Warn this many days before expiry/)).toHaveValue(30)
  })

  // Regression guard (data loss bug): a concurrent server-side change (another admin's edit, or
  // a background refetch surfacing newer data) must not silently clobber an in-progress, unsaved
  // local edit. Before this fix, the seed key was recomputed from props alone with no way to know
  // an edit was in flight, so ANY value-prop change — including a genuine concurrent update —
  // immediately overwrote whatever the admin was mid-typing.
  it('does not clobber an in-progress edit when the value prop changes concurrently (data loss guard)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ApiKeyExpirySettingsCard value={baseValue} onSave={() => Promise.resolve()} />)

    const interval = screen.getByLabelText(/Check for expiring keys every/)
    await user.clear(interval)
    await user.type(interval, '48')
    expect(interval).toHaveValue(48)

    // Simulate a concurrent server-side change to a DIFFERENT field arriving mid-edit.
    rerender(<ApiKeyExpirySettingsCard value={{ ...baseValue, warningDays: 14 }} onSave={() => Promise.resolve()} />)

    // The admin's unsaved edit must survive...
    expect(screen.getByLabelText(/Check for expiring keys every/)).toHaveValue(48)
    // ...and the view must not silently jump out from under them either.
    expect(screen.getByLabelText(/Warn this many days before expiry/)).toHaveValue(7)
  })
})
