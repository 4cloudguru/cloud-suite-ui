import { useState } from 'react'
import { Alert, Button, CircularProgress, Snackbar, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAuth } from './AuthProvider'

/**
 * Persistent warning Snackbar shown when the session is within the warning window
 * (SESSION_WARNING_LEAD_MS before expiry), offering refresh or sign-out. Mount it
 * once in the shell so it appears on every authenticated page. Uses the i18n keys
 * `session.refresh`, `auth.signOut`, `session.expiresSoon`, and `session.refreshSkipped`,
 * each with an English defaultValue fallback so an incomplete host bundle still renders
 * readable text.
 */
export function SessionExpiryWarning() {
  const { t } = useTranslation()
  const { isAuthenticated, sessionExpiresSoon, sessionExpiresAt, refreshSession, logout } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshSkipped, setRefreshSkipped] = useState(false)

  if (!isAuthenticated || !sessionExpiresSoon) return null

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshSkipped(false)
    try {
      const result = await refreshSession()
      // A 'skipped' result (already-in-flight refresh, or discarded by a logout/unmount race)
      // must not look like a successful refresh — the button did nothing this click (#103).
      setRefreshSkipped(result === 'skipped')
    } finally {
      setRefreshing(false)
    }
  }

  // Render the actual remaining time instead of the fixed warning-lead constant, which would
  // otherwise claim a fixed "2 minutes" even once the session has nearly or already lapsed (#99).
  const remainingMinutes = sessionExpiresAt
    ? Math.max(0, Math.round((sessionExpiresAt.getTime() - Date.now()) / 60000))
    : 0

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      data-testid="session-expiry-warning"
    >
      <Alert
        severity="warning"
        variant="filled"
        sx={{ width: '100%', alignItems: 'center' }}
        action={
          <Stack direction="row" spacing={1}>
            <Button
              color="inherit"
              size="small"
              onClick={handleRefresh}
              disabled={refreshing}
              startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {t('session.refresh', { defaultValue: 'Refresh session' })}
            </Button>
            <Button color="inherit" size="small" onClick={logout}>
              {t('auth.signOut', { defaultValue: 'Sign out' })}
            </Button>
          </Stack>
        }
      >
        {t('session.expiresSoon', {
          minutes: remainingMinutes,
          defaultValue: 'Your session will expire in {{minutes}} minutes.',
        })}
        {refreshSkipped && (
          <Typography variant="body2" data-testid="refresh-skipped">
            {t('session.refreshSkipped', {
              defaultValue: 'Refresh already in progress — please try again shortly.',
            })}
          </Typography>
        )}
      </Alert>
    </Snackbar>
  )
}
