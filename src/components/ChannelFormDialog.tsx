import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material'
import { isSafeUrl } from '../utils/url'
import { useSeedFromKey } from '../utils/useSeedFromKey'
import type {
  NotificationChannelFormValues,
  NotificationChannelListItem,
  NotificationChannelTypeOption,
  NotificationChannelValidators,
  NotificationEventOption,
} from './NotificationChannelsSection'

export interface ChannelFormDialogProps {
  open: boolean
  channel: NotificationChannelListItem | null
  channelTypes: NotificationChannelTypeOption[]
  eventOptions: NotificationEventOption[]
  validators?: NotificationChannelValidators
  onClose: () => void
  onSubmit: (input: NotificationChannelFormValues) => Promise<void>
}

/** Create/edit dialog for a single notification channel. */
export function ChannelFormDialog({
  open,
  channel,
  channelTypes,
  eventOptions,
  validators,
  onClose,
  onSubmit,
}: ChannelFormDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [type, setType] = useState(channelTypes[0]?.value ?? '')
  const [target, setTarget] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Identity-keyed (channel?.id ?? 'new') and must always reseed on reopen — even for the same
  // record — because `target` is intentionally never seeded from the channel's existing value
  // (see the `setTarget('')` below and the "leave blank to keep" helper text), so seededFor is
  // reset to null on close via resetSeedTracking, per useSeedFromKey's documented identity-keyed
  // usage.
  const seedKey = open ? (channel?.id ?? 'new') : null
  const [shouldSeed, resetSeedTracking] = useSeedFromKey(seedKey)
  if (shouldSeed) {
    setError(null)
    setTargetError(null)
    setName(channel?.name ?? '')
    setType(channel?.type ?? channelTypes[0]?.value ?? '')
    setTarget('')
    setEvents(channel?.events ?? [])
    setEnabled(channel?.enabled ?? true)
  }
  if (!open) resetSeedTracking()

  const toggleEvent = (value: string) =>
    setEvents((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]))

  // On create the target is required; on edit a blank target keeps the existing one.
  const targetRequired = !channel
  const canSave = Boolean(name) && (!targetRequired || Boolean(target))
  const typeOption = channelTypes.find((o) => o.value === type)
  const isEmail = Boolean(typeOption?.isEmail)

  const handleSave = async () => {
    setTargetError(null)
    // Blank target on edit means "keep the existing one" (see targetRequired below) and is never
    // itself a value that could reach the SSRF-prone dispatch sink, so it's exempt from this check.
    if (target) {
      // Both, not either: an optional host allowlist AND (for a non-email target) the library's
      // own isSafeUrl scheme check must pass before the raw value reaches onCreate/onUpdate.
      const validTarget = (validators?.isValidTarget?.(target, type) ?? true) && (isEmail || isSafeUrl(target))
      if (!validTarget) {
        setTargetError(
          isEmail
            ? t('notificationChannels.targetInvalidEmail', { defaultValue: 'Enter a valid recipient address.' })
            : t('notificationChannels.targetInvalidUrl', { defaultValue: 'Enter a valid, safe destination URL.' }),
        )
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name, type, target: target || undefined, events, enabled })
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('notificationChannels.saveError', { defaultValue: 'Failed to save channel.' }),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {channel
          ? t('notificationChannels.edit', { defaultValue: 'Edit' })
          : t('notificationChannels.add', { defaultValue: 'Add channel' })}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('notificationChannels.name', { defaultValue: 'Name' })}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            size="small"
          />
          <TextField
            label={t('notificationChannels.typeLabel', { defaultValue: 'Type' })}
            value={type}
            onChange={(e) => setType(e.target.value)}
            select
            fullWidth
            size="small"
          >
            {channelTypes.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={
              isEmail
                ? t('notificationChannels.targetEmail', { defaultValue: 'Recipient address(es)' })
                : t('notificationChannels.target', { defaultValue: 'Target URL' })
            }
            value={target}
            onChange={(e) => {
              setTarget(e.target.value)
              setTargetError(null)
            }}
            required={targetRequired}
            fullWidth
            size="small"
            type={isEmail ? 'text' : 'url'}
            placeholder={isEmail ? 'ops@example.com, oncall@example.com' : 'https://'}
            error={Boolean(targetError)}
            helperText={
              targetError ??
              (channel
                ? t('notificationChannels.targetKeep', { defaultValue: 'Leave blank to keep the existing target.' })
                : isEmail
                  ? t('notificationChannels.targetEmailHelp', { defaultValue: 'One or more comma-separated email addresses.' })
                  : t('notificationChannels.targetHelp', { defaultValue: 'The destination webhook URL.' }))
            }
          />
          <Box>
            <FormGroup row>
              {eventOptions.map((o) => (
                <FormControlLabel
                  key={o.value}
                  control={<Checkbox size="small" checked={events.includes(o.value)} onChange={() => toggleEvent(o.value)} />}
                  label={o.label}
                />
              ))}
            </FormGroup>
            <Box sx={{ color: 'text.secondary', fontSize: 12 }}>
              {t('notificationChannels.eventsHelp', { defaultValue: 'Leave all unchecked to receive every event.' })}
            </Box>
          </Box>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
            label={t('notificationChannels.enabled', { defaultValue: 'Enabled' })}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('notificationChannels.cancel', { defaultValue: 'Cancel' })}</Button>
        <Button variant="contained" disabled={saving || !canSave} onClick={handleSave}>
          {saving ? <CircularProgress size={20} /> : t('notificationChannels.save', { defaultValue: 'Save' })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
