import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import type { NotificationChannelListItem } from './NotificationChannelsSection'

export interface DeleteChannelDialogProps {
  /** Channel pending deletion; the dialog is open whenever this is non-null. */
  channel: NotificationChannelListItem | null
  /** Dismiss without deleting (backdrop click or Cancel). */
  onClose: () => void
  /** Perform the delete. Rejecting leaves the dialog open for retry. */
  onConfirm: (channel: NotificationChannelListItem) => Promise<void>
}

/** Delete confirmation dialog for a single notification channel. */
export function DeleteChannelDialog({ channel, onClose, onConfirm }: DeleteChannelDialogProps) {
  const { t } = useTranslation()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!channel) return
    setDeleting(true)
    try {
      await onConfirm(channel)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={Boolean(channel)} onClose={onClose}>
      <DialogTitle>{t('notificationChannels.deleteTitle', { defaultValue: 'Delete channel' })}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('notificationChannels.deleteConfirm', {
            defaultValue: 'Delete "{{name}}"? This cannot be undone.',
            name: channel?.name ?? '',
          })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('notificationChannels.cancel', { defaultValue: 'Cancel' })}</Button>
        <Button color="error" variant="contained" disabled={deleting} onClick={handleDelete}>
          {deleting ? <CircularProgress size={20} /> : t('notificationChannels.delete', { defaultValue: 'Delete' })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
