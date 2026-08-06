import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Button,
  Paper,
  Slide,
  Stack,
  Switch,
  Typography,
  FormControlLabel,
} from '@mui/material'
import { useConsent } from './ConsentProvider'
import { isSafeUrl } from '../utils/url'

export interface ConsentBannerProps {
  /** Link target for the privacy policy referenced in the banner copy. */
  privacyPolicyHref?: string
}

/**
 * GDPR / ePrivacy consent banner, shown as a bottom sheet until the user records
 * their cookie/telemetry preferences. Users can accept all, reject all (essential
 * only), or customize. Uses the `consentBanner.*` i18n keys, each with an English
 * defaultValue fallback so an incomplete host bundle still renders readable text.
 */
export function ConsentBanner({ privacyPolicyHref = '/privacy' }: ConsentBannerProps) {
  const { t } = useTranslation()
  const { hasConsented, preferences, updatePreferences, acceptAll, rejectAll } = useConsent()
  const [showDetails, setShowDetails] = useState(false)
  const safePrivacyPolicyHref = isSafeUrl(privacyPolicyHref) ? privacyPolicyHref : '/privacy'

  if (hasConsented) return null

  return (
    <Slide direction="up" in={!hasConsented} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        role="dialog"
        aria-label={t('consentBanner.ariaLabel', { defaultValue: 'Cookie consent' })}
        aria-describedby="consent-description"
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1500,
          p: 3,
          borderRadius: '12px 12px 0 0',
        }}
      >
        <Typography variant="h6" gutterBottom>
          {t('consentBanner.title', { defaultValue: 'Privacy preferences' })}
        </Typography>
        <Typography
          id="consent-description"
          variant="body2"
          gutterBottom
          sx={{ color: 'text.secondary' }}
        >
          {t('consentBanner.description', {
            defaultValue:
              'We use cookies and similar technologies. Essential cookies are always active. You may choose to enable additional categories below. See our',
          })}{' '}
          <a href={safePrivacyPolicyHref} style={{ color: 'inherit' }}>
            {t('consentBanner.privacyPolicyLinkText', { defaultValue: 'Privacy Policy' })}
          </a>{' '}
          {t('consentBanner.descriptionSuffix', { defaultValue: 'for details.' })}
        </Typography>

        {showDetails && (
          <Box sx={{ my: 2 }}>
            <FormControlLabel
              control={<Switch checked disabled />}
              label={t('consentBanner.essential', { defaultValue: 'Essential cookies' })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.errorReporting}
                  onChange={(_, checked) => updatePreferences({ errorReporting: checked })}
                />
              }
              label={t('consentBanner.errorReporting', { defaultValue: 'Error reporting' })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.performanceReporting}
                  onChange={(_, checked) => updatePreferences({ performanceReporting: checked })}
                />
              }
              label={t('consentBanner.performanceMonitoring', {
                defaultValue: 'Performance monitoring',
              })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={preferences.analytics}
                  onChange={(_, checked) => updatePreferences({ analytics: checked })}
                />
              }
              label={t('consentBanner.analytics', { defaultValue: 'Analytics' })}
            />
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="text" onClick={() => setShowDetails((v) => !v)}>
            {showDetails
              ? t('consentBanner.hideDetails', { defaultValue: 'Hide details' })
              : t('consentBanner.customize', { defaultValue: 'Customize' })}
          </Button>
          <Button variant="outlined" onClick={rejectAll}>
            {t('consentBanner.rejectAll', { defaultValue: 'Reject all' })}
          </Button>
          <Button variant="contained" onClick={acceptAll}>
            {t('consentBanner.acceptAll', { defaultValue: 'Accept all' })}
          </Button>
        </Stack>
      </Paper>
    </Slide>
  )
}
