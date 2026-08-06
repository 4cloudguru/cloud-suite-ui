import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { UIThemeConfig } from '../theme'

export type BrandingFieldKey = keyof UIThemeConfig

/**
 * Host-supplied copy for a single field. Supplying an entry means the host owns
 * that field's copy outright — an omitted `helperText` renders no helper rather
 * than falling back to this package's English, so a translated app never leaks
 * untranslated text. Fields with no entry at all resolve through
 * `t('branding.fields.<key>.label' | '.helperText', { defaultValue })`, so they
 * are translatable by default rather than hardcoded English.
 */
export interface BrandingFieldLabel {
  label: string
  /** Shown under the field while its value is valid. */
  helperText?: string
  /** Replaces helperText while the value is invalid. */
  errorText?: string
}

/**
 * Already-translated copy from the host app. Each host resolves its own i18n
 * keys and passes the results in, so an app that already ships translations for
 * this feature keeps them instead of being pinned to this package's English.
 */
export interface BrandingSettingsCardStrings {
  fields?: Partial<Record<BrandingFieldKey, BrandingFieldLabel>>
  resetDefaults?: string
  savedReloadHint?: string
  reloadNow?: string
  /** Supplementary note under the buttons. Omitted entirely when not provided. */
  securityNote?: string
}

export interface BrandingValidators {
  /** Accepts the color notations the host's backend will accept. */
  isValidColor: (value: string) => boolean
  /** Screens URLs before they reach an image/navigation sink. */
  isValidUrl: (value: string) => boolean
}

export interface BrandingSettingsCardProps {
  value: UIThemeConfig
  isLoading?: boolean
  /** Disables editing when false. Defaults to true. */
  canManage?: boolean
  /**
   * Required rather than defaulted: the suite's backends accept different color
   * notations and apply different URL trust rules, so a built-in default here
   * would silently be wrong for one of them.
   */
  validators: BrandingValidators
  strings?: BrandingSettingsCardStrings
  /** Shows a "reset to defaults" button that saves an empty config. Defaults to true. */
  allowReset?: boolean
  onSave: (input: UIThemeConfig) => Promise<void>
}

type FieldKind = 'text' | 'color' | 'url'

const FIELDS: { key: BrandingFieldKey; kind: FieldKind; label: string; helperText: string }[] = [
  { key: 'product_name', kind: 'text', label: 'Product name', helperText: 'Shown in the browser title, sidebar, and login page.' },
  { key: 'primary_color', kind: 'color', label: 'Primary color', helperText: 'Used for buttons, links, and accents.' },
  { key: 'secondary_color_light', kind: 'color', label: 'Secondary color (light mode)', helperText: 'Accent color applied in light mode.' },
  { key: 'secondary_color_dark', kind: 'color', label: 'Secondary color (dark mode)', helperText: 'Accent color applied in dark mode.' },
  { key: 'logo_url', kind: 'url', label: 'Logo URL', helperText: 'Shown in the sidebar header and on the login page.' },
  { key: 'favicon_url', kind: 'url', label: 'Favicon URL', helperText: 'Browser tab icon.' },
  { key: 'login_hero_url', kind: 'url', label: 'Login hero image URL', helperText: 'Background image on the login page.' },
]

const HEX_SWATCH_RE = /^#[0-9A-Fa-f]{6}$/

/**
 * Admin card for whitelabel branding: product name, palette colors, and
 * logo/favicon/login-hero URLs. Fully controlled via props — data fetching and
 * persistence stay in the host app, as does per-field validation.
 *
 * Empty fields are stripped before `onSave`, so the stored config only carries
 * real overrides and clearing a field removes it rather than persisting "".
 */
export function BrandingSettingsCard({
  value,
  isLoading = false,
  canManage = true,
  validators,
  strings,
  allowReset = true,
  onSave,
}: BrandingSettingsCardProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<UIThemeConfig>(value)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed local edit state from props whenever the loaded value's contents
  // change — the initial load AND any later change (e.g. a background refetch
  // surfacing another admin's edit). An unchanged value does not re-seed, so a
  // user's in-progress edits survive. Mirrors ApiKeyExpirySettingsCard.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const seedKey = isLoading ? null : FIELDS.map((f) => value[f.key] ?? '').join('|')
  if (seedKey !== null && seededFor !== seedKey) {
    setSeededFor(seedKey)
    setForm(value)
  }

  const fieldInvalid = (kind: FieldKind, fieldValue: string): boolean => {
    if (!fieldValue) return false
    if (kind === 'color') return !validators.isValidColor(fieldValue)
    if (kind === 'url') return !validators.isValidUrl(fieldValue)
    return fieldValue.length > 100
  }

  const hasInvalidField = FIELDS.some((f) => fieldInvalid(f.kind, form[f.key] ?? ''))

  const submit = async (config: UIThemeConfig) => {
    setSaving(true)
    try {
      await onSave(config)
      setForm(config)
      setSaved(true)
      setError(null)
    } catch (e) {
      setSaved(false)
      setError(
        e instanceof Error
          ? e.message
          : t('branding.saveError', { defaultValue: 'Failed to save branding settings.' }),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () =>
    submit(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== undefined)))

  if (isLoading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2} sx={{ maxWidth: 560 }}>
          {FIELDS.map((f) => {
            const fieldValue = form[f.key] ?? ''
            const invalid = fieldInvalid(f.kind, fieldValue)
            const copy = strings?.fields?.[f.key]
            const helper = invalid
              ? (copy?.errorText ??
                (f.kind === 'color'
                  ? t('branding.invalidColor', { defaultValue: 'Enter a valid color value.' })
                  : f.kind === 'url'
                    ? t('branding.invalidUrl', { defaultValue: 'Enter a valid http(s) URL or a relative path.' })
                    : t('branding.invalidText', { defaultValue: 'Must be 100 characters or fewer.' })))
              : copy
                ? copy.helperText
                : t(`branding.fields.${f.key}.helperText`, { defaultValue: f.helperText })
            return (
              <TextField
                key={f.key}
                size="small"
                fullWidth
                label={copy?.label ?? t(`branding.fields.${f.key}.label`, { defaultValue: f.label })}
                value={fieldValue}
                error={invalid}
                helperText={helper}
                disabled={!canManage}
                placeholder={f.kind === 'color' ? '#0a6e31' : undefined}
                onChange={(e) => {
                  setSaved(false)
                  setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                }}
                slotProps={{
                  input: {
                    startAdornment:
                      f.kind === 'color' && HEX_SWATCH_RE.test(fieldValue) ? (
                        <InputAdornment position="start">
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              bgcolor: fieldValue,
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          />
                        </InputAdornment>
                      ) : undefined,
                  },
                }}
              />
            )
          })}

          {error && <Alert severity="error">{error}</Alert>}
          {saved && (
            <Alert
              severity="success"
              action={
                <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                  {strings?.reloadNow ?? t('branding.reloadNow', { defaultValue: 'Reload now' })}
                </Button>
              }
            >
              {strings?.savedReloadHint ??
                t('branding.savedReloadHint', { defaultValue: 'Saved. Reload to see your changes.' })}
            </Alert>
          )}

          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={!canManage || hasInvalidField || saving}
              onClick={handleSave}
            >
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
            {allowReset && (
              <Button color="inherit" disabled={!canManage || saving} onClick={() => submit({})}>
                {strings?.resetDefaults ??
                  t('branding.resetDefaults', { defaultValue: 'Reset to defaults' })}
              </Button>
            )}
          </Stack>

          {strings?.securityNote && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {strings.securityNote}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
