import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SendIcon from '@mui/icons-material/Send'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { isSafeUrl } from '../utils/url'
import { useSeedFromKey } from '../utils/useSeedFromKey'

/** A notification channel as rendered by the table (a trimmed server model). */
export interface NotificationChannelListItem {
  id: string
  name: string
  type: string
  events: string[]
  enabled: boolean
  last_status?: string | null
}

/** The editable fields of a channel, submitted on create/update. */
export interface NotificationChannelFormValues {
  name: string
  type: string
  /** Destination URL or (for email) comma-separated recipient address(es). Blank on edit keeps the existing target. */
  target?: string
  events: string[]
  enabled: boolean
}

export interface NotificationChannelTypeOption {
  value: string
  label: string
  /** True when this type's target is email recipient address(es) rather than a URL. */
  isEmail?: boolean
}

export interface NotificationEventOption {
  value: string
  label: string
}

/**
 * Optional host-supplied validators for channel fields, mirroring BrandingSettingsCardProps's
 * `validators` shape (there, required; here, optional — target isn't the whole point of this
 * component the way colour/URL validation is BrandingSettingsCard's).
 */
export interface NotificationChannelValidators {
  /**
   * Return false to reject `value` (a webhook URL or, for an email-type channel, a
   * comma-separated recipient list) for the given channel `type`. Applied in ADDITION to — not
   * instead of — the component's own `isSafeUrl` check on non-email targets.
   */
  isValidTarget?: (value: string, type: string) => boolean
}

export interface NotificationChannelsSectionProps {
  channels: NotificationChannelListItem[]
  isLoading?: boolean
  isError?: boolean
  /** Disables every mutating affordance (add/edit/delete/test/toggle) when false. Defaults to true. */
  canManage?: boolean
  channelTypes: NotificationChannelTypeOption[]
  eventOptions: NotificationEventOption[]
  /** Optional additional validation for the create/edit form's target field. */
  validators?: NotificationChannelValidators
  onCreate: (input: NotificationChannelFormValues) => Promise<void>
  onUpdate: (id: string, input: NotificationChannelFormValues) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTest: (id: string) => Promise<void>
  onToggleEnabled: (channel: NotificationChannelListItem, enabled: boolean) => Promise<void>
}

/**
 * Admin card listing notification delivery channels (webhook/Slack/Teams/email),
 * with add/edit/delete/test/enable actions and a create-or-edit dialog. Data
 * fetching and persistence stay in the host app (react-query, etc.) — this
 * component is fully controlled via props and reports intent through the
 * on* callbacks.
 *
 * Uses the `notificationChannels.*` i18n namespace with an English
 * `defaultValue` for every string, so it renders correctly even in a host app
 * that has not yet added translations for these keys.
 */
export function NotificationChannelsSection({
  channels,
  isLoading = false,
  isError = false,
  canManage = true,
  channelTypes,
  eventOptions,
  validators,
  onCreate,
  onUpdate,
  onDelete,
  onTest,
  onToggleEnabled,
}: NotificationChannelsSectionProps) {
  const { t } = useTranslation()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<NotificationChannelListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NotificationChannelListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; text: string } | null>(null)

  const typeLabel = (value: string) => channelTypes.find((o) => o.value === value)?.label ?? value
  const eventLabel = (value: string) => eventOptions.find((o) => o.value === value)?.label ?? value

  const handleTest = async (channel: NotificationChannelListItem) => {
    setTestingId(channel.id)
    try {
      await onTest(channel.id)
      setNotice({ severity: 'success', text: t('notificationChannels.testSent', { defaultValue: 'Test notification sent.' }) })
    } catch {
      setNotice({
        severity: 'error',
        text: t('notificationChannels.testError', { defaultValue: 'Failed to send test notification.' }),
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleToggle = async (channel: NotificationChannelListItem, enabled: boolean) => {
    setTogglingId(channel.id)
    try {
      await onToggleEnabled(channel, enabled)
    } catch {
      setNotice({ severity: 'error', text: t('notificationChannels.saveError', { defaultValue: 'Failed to save channel.' }) })
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await onDelete(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      setNotice({ severity: 'error', text: t('notificationChannels.deleteError', { defaultValue: 'Failed to delete channel.' }) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="h6" gutterBottom>
            {t('notificationChannels.title', { defaultValue: 'Notification channels' })}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('notificationChannels.description', {
              defaultValue: 'Delivery destinations (webhook, Slack, Teams, or email) for admin-facing alerts.',
            })}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          disabled={!canManage}
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          {t('notificationChannels.add', { defaultValue: 'Add channel' })}
        </Button>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {notice && (
        <Alert severity={notice.severity} sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {isError && <Alert severity="error">{t('notificationChannels.loadError', { defaultValue: 'Failed to load notification channels.' })}</Alert>}
      {!isLoading && !isError && channels.length === 0 && (
        <Alert severity="info">{t('notificationChannels.noChannels', { defaultValue: 'No notification channels configured yet.' })}</Alert>
      )}

      {!isLoading && !isError && channels.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('notificationChannels.name', { defaultValue: 'Name' })}</TableCell>
              <TableCell>{t('notificationChannels.typeLabel', { defaultValue: 'Type' })}</TableCell>
              <TableCell>{t('notificationChannels.events', { defaultValue: 'Events' })}</TableCell>
              <TableCell>{t('notificationChannels.enabled', { defaultValue: 'Enabled' })}</TableCell>
              <TableCell>{t('notificationChannels.lastDelivery', { defaultValue: 'Last delivery' })}</TableCell>
              <TableCell align="right">{t('notificationChannels.actions', { defaultValue: 'Actions' })}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {channels.map((ch) => (
              <TableRow key={ch.id} hover>
                <TableCell>{ch.name}</TableCell>
                <TableCell>{typeLabel(ch.type)}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {ch.events.length === 0 ? (
                      <Chip size="small" variant="outlined" label={t('notificationChannels.allEvents', { defaultValue: 'All events' })} />
                    ) : (
                      ch.events.map((e) => <Chip key={e} size="small" variant="outlined" label={eventLabel(e)} />)
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Switch
                    size="small"
                    checked={ch.enabled}
                    disabled={!canManage || togglingId === ch.id}
                    onChange={(e) => handleToggle(ch, e.target.checked)}
                    slotProps={{ input: { 'aria-label': t('notificationChannels.enabled', { defaultValue: 'Enabled' }) } }}
                  />
                </TableCell>
                <TableCell>
                  {ch.last_status ? (
                    <Chip size="small" color={ch.last_status === 'sent' ? 'success' : 'error'} label={ch.last_status} />
                  ) : (
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {t('notificationChannels.neverSent', { defaultValue: 'Never sent' })}
                    </Box>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={t('notificationChannels.test', { defaultValue: 'Send test' }) as string}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canManage || testingId === ch.id}
                        onClick={() => handleTest(ch)}
                        aria-label={t('notificationChannels.test', { defaultValue: 'Send test' }) as string}
                      >
                        <SendIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={t('notificationChannels.edit', { defaultValue: 'Edit' }) as string}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canManage}
                        onClick={() => {
                          setEditing(ch)
                          setFormOpen(true)
                        }}
                        aria-label={t('notificationChannels.edit', { defaultValue: 'Edit' }) as string}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={t('notificationChannels.delete', { defaultValue: 'Delete' }) as string}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={!canManage}
                        onClick={() => setDeleteTarget(ch)}
                        aria-label={t('notificationChannels.delete', { defaultValue: 'Delete' }) as string}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ChannelFormDialog
        open={formOpen}
        channel={editing}
        channelTypes={channelTypes}
        eventOptions={eventOptions}
        validators={validators}
        onClose={() => setFormOpen(false)}
        onSubmit={async (input) => {
          if (editing) {
            await onUpdate(editing.id, input)
          } else {
            await onCreate(input)
          }
          setFormOpen(false)
        }}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('notificationChannels.deleteTitle', { defaultValue: 'Delete channel' })}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('notificationChannels.deleteConfirm', {
              defaultValue: 'Delete "{{name}}"? This cannot be undone.',
              name: deleteTarget?.name ?? '',
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('notificationChannels.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button color="error" variant="contained" disabled={deleting} onClick={handleDelete}>
            {deleting ? <CircularProgress size={20} /> : t('notificationChannels.delete', { defaultValue: 'Delete' })}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

function ChannelFormDialog({
  open,
  channel,
  channelTypes,
  eventOptions,
  validators,
  onClose,
  onSubmit,
}: {
  open: boolean
  channel: NotificationChannelListItem | null
  channelTypes: NotificationChannelTypeOption[]
  eventOptions: NotificationEventOption[]
  validators?: NotificationChannelValidators
  onClose: () => void
  onSubmit: (input: NotificationChannelFormValues) => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [type, setType] = useState(channelTypes[0]?.value ?? '')
  const [target, setTarget] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [targetError, setTargetError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Identity-keyed (channel?.id ?? 'new') and must always reseed on reopen \u2014 even for the same
  // record \u2014 because `target` is intentionally never seeded from the channel's existing value
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
