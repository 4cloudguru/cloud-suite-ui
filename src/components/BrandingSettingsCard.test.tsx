import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrandingSettingsCard, type BrandingValidators } from './BrandingSettingsCard'
import type { UIThemeConfig } from '../theme'

const baseValue: UIThemeConfig = {
  product_name: 'Acme Registry',
  primary_color: '#0a6e31',
}

// Mirrors the stricter of the two suite backends (hex only).
const validators: BrandingValidators = {
  isValidColor: (v) => /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v),
  isValidUrl: (v) => v.startsWith('/') || v.startsWith('https://'),
}

const renderCard = (props: Partial<React.ComponentProps<typeof BrandingSettingsCard>> = {}) =>
  render(
    <BrandingSettingsCard
      value={baseValue}
      validators={validators}
      onSave={() => Promise.resolve()}
      {...props}
    />,
  )

describe('BrandingSettingsCard', () => {
  it('shows a loading indicator', () => {
    renderCard({ isLoading: true })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders all seven branding fields once loaded', () => {
    renderCard()
    expect(screen.getByLabelText('Product name')).toHaveValue('Acme Registry')
    expect(screen.getByLabelText('Primary color')).toHaveValue('#0a6e31')
    expect(screen.getByLabelText('Secondary color (light mode)')).toBeInTheDocument()
    expect(screen.getByLabelText('Secondary color (dark mode)')).toBeInTheDocument()
    expect(screen.getByLabelText('Logo URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Favicon URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Login hero image URL')).toBeInTheDocument()
  })

  it('disables every field and both buttons when canManage is false', () => {
    renderCard({ canManage: false })
    expect(screen.getByLabelText('Product name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled()
  })

  it('strips empty fields from the saved payload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderCard({ onSave })

    await user.type(screen.getByLabelText('Logo URL'), 'https://example.com/logo.svg')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        product_name: 'Acme Registry',
        primary_color: '#0a6e31',
        logo_url: 'https://example.com/logo.svg',
      }),
    )
  })

  it('blocks saving while a color fails the injected validator', async () => {
    const user = userEvent.setup()
    renderCard()

    const color = screen.getByLabelText('Primary color')
    await user.clear(color)
    await user.type(color, 'rgb(1,2,3)')

    expect(screen.getByText('Enter a valid color value.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('blocks saving while a URL fails the injected validator', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.type(screen.getByLabelText('Logo URL'), 'javascript:alert(1)')

    expect(screen.getByText('Enter a valid http(s) URL or a relative path.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('prefers host-supplied copy over the built-in English defaults', async () => {
    const user = userEvent.setup()
    renderCard({
      strings: {
        fields: {
          primary_color: {
            label: 'Grundfarbe',
            helperText: 'Hex-Farbcode',
            errorText: 'Ungültige Farbe',
          },
        },
        resetDefaults: 'Zurücksetzen',
        securityNote: 'Sicherheitshinweis',
      },
    })

    expect(screen.getByLabelText('Grundfarbe')).toBeInTheDocument()
    expect(screen.getByText('Hex-Farbcode')).toBeInTheDocument()
    // The built-in English helper for that field must not leak through.
    expect(screen.queryByText('Used for buttons, links, and accents.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zurücksetzen' })).toBeInTheDocument()
    expect(screen.getByText('Sicherheitshinweis')).toBeInTheDocument()

    const color = screen.getByLabelText('Grundfarbe')
    await user.clear(color)
    await user.type(color, 'nope')
    expect(screen.getByText('Ungültige Farbe')).toBeInTheDocument()
  })

  it('omits the security note when the host does not supply one', () => {
    renderCard()
    expect(screen.queryByText(/Sicherheitshinweis/)).not.toBeInTheDocument()
  })

  it('renders no helper when a host-supplied field entry omits one', () => {
    // State-manager relies on this: it shows its translated copy only on error,
    // and three colour fields share one string — an always-on helper would put
    // the same text on screen three times.
    renderCard({
      strings: { fields: { primary_color: { label: 'Primary color', errorText: 'Bad colour' } } },
    })
    expect(screen.queryByText('Used for buttons, links, and accents.')).not.toBeInTheDocument()
  })

  it('reset saves an empty config', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderCard({ onSave })

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}))
  })

  it('hides the reset button when allowReset is false', () => {
    renderCard({ allowReset: false })
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).not.toBeInTheDocument()
  })

  it('shows the reload hint after a successful save', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved. Reload to see your changes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument()
  })

  it('surfaces an Error message from onSave', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('primary_color: must be a hex color'))
    const user = userEvent.setup()
    renderCard({ onSave })

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('primary_color: must be a hex color')).toBeInTheDocument()
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    const onSave = vi.fn().mockRejectedValue('nope')
    const user = userEvent.setup()
    renderCard({ onSave })

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Failed to save branding settings.')).toBeInTheDocument()
  })

  it('re-seeds the form when a later value prop change arrives', async () => {
    const { rerender } = renderCard()
    expect(screen.getByLabelText('Product name')).toHaveValue('Acme Registry')

    rerender(
      <BrandingSettingsCard
        value={{ ...baseValue, product_name: 'Globex Registry' }}
        validators={validators}
        onSave={() => Promise.resolve()}
      />,
    )
    await waitFor(() => expect(screen.getByLabelText('Product name')).toHaveValue('Globex Registry'))
  })

  it('preserves in-progress edits when the value prop is unchanged', async () => {
    const user = userEvent.setup()
    const { rerender } = renderCard()

    const name = screen.getByLabelText('Product name')
    await user.clear(name)
    await user.type(name, 'Half-typed')

    rerender(
      <BrandingSettingsCard
        value={{ ...baseValue }}
        validators={validators}
        onSave={() => Promise.resolve()}
      />,
    )
    expect(screen.getByLabelText('Product name')).toHaveValue('Half-typed')
  })

  // Regression guard (data loss bug): a concurrent server-side change (another admin's edit, or
  // a background refetch) must not silently clobber an in-progress, unsaved local edit.
  it('does not clobber an in-progress edit when the value prop changes concurrently (data loss guard)', async () => {
    const user = userEvent.setup()
    const { rerender } = renderCard()

    const name = screen.getByLabelText('Product name')
    await user.clear(name)
    await user.type(name, 'Half-typed')

    // Simulate a concurrent server-side change to a DIFFERENT field arriving mid-edit.
    rerender(
      <BrandingSettingsCard
        value={{ ...baseValue, primary_color: '#123456' }}
        validators={validators}
        onSave={() => Promise.resolve()}
      />,
    )

    // The admin's unsaved edit must survive...
    expect(screen.getByLabelText('Product name')).toHaveValue('Half-typed')
    // ...and the view must not silently jump out from under them either.
    expect(screen.getByLabelText('Primary color')).toHaveValue('#0a6e31')
  })
})
