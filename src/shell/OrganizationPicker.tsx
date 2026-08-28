import { useState } from 'react'
import { Button, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import BusinessIcon from '@mui/icons-material/Business'

import { useAuth } from '../identity/AuthProvider'
import { shouldOfferOrganizationChoice } from '../identity/organization'

export interface OrganizationPickerProps {
  /** Tooltip and accessible label. */
  tooltip?: string
  /** Shown while a multi-organization user has not chosen yet. */
  unselectedLabel?: string
}

/**
 * Chooses the organization the user is acting in.
 *
 * # It renders nothing unless there is an actual choice
 *
 * A caller with one organization to choose from is already acting in it, so
 * there is nothing to pick and no control to explain. That is what keeps a
 * single-organization deployment visually unchanged — the common case sees no
 * new UI at all. The rule comes from {@link shouldOfferOrganizationChoice}
 * rather than being re-derived here, so this cannot disagree with the provider
 * about when a choice exists.
 *
 * The set it renders is `organizationChoices`, which for an ordinary caller IS
 * their memberships and for a platform administrator is the organizations the
 * host established they may act in. Reading memberships directly is what left an
 * administrator with no control and no way to answer the server's demand that
 * they name one.
 *
 * # Switching re-resolves the session, and that is deliberate
 *
 * `setCurrentOrganization` re-runs the session lookup, because `allowedScopes`
 * is the effective set for the SELECTED organization. Reusing the previous one
 * would show affordances for an organization the user is no longer acting in.
 * A brief loading state after switching is the visible cost of that being
 * correct.
 *
 * # This is not an authorization control
 *
 * The selection is sent to the server as a claim and verified there against a
 * scope the server resolved itself. Choosing an organization here grants
 * nothing; it only says which of the user's own organizations a write belongs
 * to. Hiding this control would not restrict anybody, and showing it does not
 * widen anybody.
 */
export function OrganizationPicker({
  tooltip = 'Switch organization',
  unselectedLabel = 'Select organization',
}: OrganizationPickerProps) {
  const { memberships, organizationChoices, currentOrganizationId, setCurrentOrganization } =
    useAuth()
  const [anchor, setAnchor] = useState<null | HTMLElement>(null)

  // organizationChoices, NOT memberships. For an ordinary caller the two are the
  // same list and nothing changes. For a platform administrator they are not:
  // they belong to no organization, so a membership-driven picker renders
  // nothing for exactly the caller the server insists must choose — the control
  // disappears at the moment it is mandatory.
  const list = organizationChoices ?? memberships ?? []
  if (!shouldOfferOrganizationChoice(list)) return null

  const current = list.find((m) => m.organization_id === currentOrganizationId)

  return (
    <>
      <Tooltip title={tooltip}>
        <Button
          color="inherit"
          startIcon={<BusinessIcon />}
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label={tooltip}
          sx={{ textTransform: 'none', maxWidth: 260 }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {current?.organization_name ?? unselectedLabel}
          </span>
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {list.map((m) => (
          <MenuItem
            key={m.organization_id}
            selected={m.organization_id === currentOrganizationId}
            onClick={() => {
              setAnchor(null)
              setCurrentOrganization(m.organization_id)
            }}
          >
            <ListItemText primary={m.organization_name || m.organization_id} />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
