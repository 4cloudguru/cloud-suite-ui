import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useSeedFromKey } from '../utils/useSeedFromKey'

/** The current API-key-expiry notification settings. */
export interface ApiKeyExpirySettingsValue {
  /** The master notifications switch (SMTP/relay-wide). Read-only context here — this card never edits it. */
  enabled: boolean
  /** Whether the per-user "your API key is expiring soon" warning email is turned on. */
  apiKeyExpiring: boolean
  /** Days before expiry to send the warning (server default applies when <= 0). */
  warningDays: number
  /** How often the background job checks for expiring keys (server default applies when <= 0). */
  checkIntervalHours: number
}

export type ApiKeyExpirySettingsInput = Pick<ApiKeyExpirySettingsValue, 'apiKeyExpiring' | 'warningDays' | 'checkIntervalHours'>

export interface ApiKeyExpirySettingsCardProps {
  value: ApiKeyExpirySettingsValue
  isLoading?: boolean
  /** Disables editing when false. Defaults to true. */
  canManage?: boolean
  onSave: (input: ApiKeyExpirySettingsInput) => Promise<void>
}

/**
 * Admin card for configuring the per-user API-key-expiry warning email
 * (whether it's on, how many days before expiry to warn, and how often the
 * background job checks). Fully controlled via props — data fetching and
 * persistence stay in the host app.
 *
 * Uses the `apiKeyExpiry.*` i18n namespace with an English `defaultValue` for
 * every string, so it renders correctly even in a host app that has not yet
 * added translations for these keys.
 */
export function ApiKeyExpirySettingsCard({ value, isLoading = false, canManage = true, onSave }: ApiKeyExpirySettingsCardProps) {
  const { t } = useTranslation()
  const [apiKeyExpiring, setApiKeyExpiring] = useState(value.apiKeyExpiring)
  const [warningDays, setWarningDays] = useState(value.warningDays)
  const [checkIntervalHours, setCheckIntervalHours] = useState(value.checkIntervalHours)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; text: string } | null>(null)

  // Re-seed the local edit state from props whenever the loaded value's contents change — the
  // initial load AND any later change (e.g. a background refetch, or another admin's concurrent
  // edit, surfacing a newer server value). Suppressed while `dirty` (an in-progress, unsaved
  // local edit) so a concurrent server-side change never silently clobbers it.
  const seedKey = isLoading ? null : `${value.apiKeyExpiring}|${value.warningDays}|${value.checkIntervalHours}`
  const [shouldSeed] = useSeedFromKey(seedKey, dirty)
  if (shouldSeed) {
    setApiKeyExpiring(value.apiKeyExpiring)
    setWarningDays(value.warningDays)
    setCheckIntervalHours(value.checkIntervalHours)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ apiKeyExpiring, warningDays, checkIntervalHours })
      setDirty(false)
      setNotice({ severity: 'success', text: t('apiKeyExpiry.saveSuccess', { defaultValue: 'Settings saved.' }) })
    } catch (e) {
      setNotice({
        severity: 'error',
        text: e instanceof Error ? e.message : t('apiKeyExpiry.saveError', { defaultValue: 'Failed to save settings.' }),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography variant="h6" gutterBottom>
          {t('apiKeyExpiry.title', { defaultValue: 'API key expiry notifications' })}
        </Typography>
        {!value.enabled && (
          <Chip
            size="small"
            label={t('apiKeyExpiry.notificationsDisabled', { defaultValue: 'Notifications disabled' })}
            color="default"
          />
        )}
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {t('apiKeyExpiry.description', {
          defaultValue: 'Warn the owning user by email when one of their API keys is about to expire.',
        })}
      </Typography>
      <Divider sx={{ mb: 2 }} />

      {notice && (
        <Alert severity={notice.severity} sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Grid container spacing={2} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                checked={apiKeyExpiring}
                disabled={!canManage}
                onChange={(e) => {
                  setApiKeyExpiring(e.target.checked)
                  setDirty(true)
                }}
                slotProps={{ input: { 'aria-label': t('apiKeyExpiry.enable', { defaultValue: 'Send expiry warning emails' }) } }}
              />
              <Typography variant="body2">{t('apiKeyExpiry.enable', { defaultValue: 'Send expiry warning emails' })}</Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label={t('apiKeyExpiry.warningDays', { defaultValue: 'Warn this many days before expiry' })}
              value={warningDays}
              disabled={!canManage}
              slotProps={{ htmlInput: { min: 1 } }}
              onChange={(e) => {
                setWarningDays(Number(e.target.value))
                setDirty(true)
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label={t('apiKeyExpiry.checkIntervalHours', { defaultValue: 'Check for expiring keys every (hours)' })}
              value={checkIntervalHours}
              disabled={!canManage}
              slotProps={{ htmlInput: { min: 1 } }}
              onChange={(e) => {
                setCheckIntervalHours(Number(e.target.value))
                setDirty(true)
              }}
              helperText={t('apiKeyExpiry.checkIntervalHelp', {
                defaultValue: 'Changes to this value take effect after the next restart.',
              })}
            />
          </Grid>
        </Grid>
      )}

      <Box sx={{ mt: 2 }}>
        <Button variant="contained" disabled={!canManage || isLoading || saving} onClick={handleSave}>
          {saving ? <CircularProgress size={20} /> : t('apiKeyExpiry.save', { defaultValue: 'Save' })}
        </Button>
      </Box>
    </Paper>
  )
}
