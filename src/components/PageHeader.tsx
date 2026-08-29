import React from 'react'
import { Box, Typography } from '@mui/material'

export interface PageHeaderProps {
  /** Page title rendered as an h4 (also the <h1> for route-focus/a11y). */
  title: React.ReactNode
  /** Optional one-line subtitle rendered below the title. */
  description?: React.ReactNode
  /** Optional page-level primary actions, right-aligned and top-aligned with the title. */
  actions?: React.ReactNode
  /** Optional leading icon beside the title — matches the page's left-nav icon. */
  icon?: React.ReactNode
}

/**
 * Standardised page header: a title (the page's <h1>) with an optional leading
 * icon and one-line description on the left, plus optional right-aligned actions.
 * Wraps on small screens so actions drop below the title rather than overflowing.
 */
export function PageHeader({ title, description, actions, icon }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 2,
        mb: 3,
      }}
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon && (
            <Box
              aria-hidden
              sx={{ display: 'flex', color: 'primary.main', '& > svg': { fontSize: 32 } }}
            >
              {icon}
            </Box>
          )}
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
        </Box>
        {description && (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions}
    </Box>
  )
}
