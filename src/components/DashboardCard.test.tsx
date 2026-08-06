import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardCard } from './DashboardCard'

describe('DashboardCard', () => {
  it('renders the label and value', () => {
    render(<DashboardCard label="Modules" value={42} />)
    expect(screen.getByText('Modules')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders a tooltip on the label when hint is provided', () => {
    render(<DashboardCard label="PRs" value={3} hint="Pull requests" />)
    expect(screen.getByText('PRs')).toBeInTheDocument()
  })

  it('renders as a plain card (no link) when `to` is omitted', () => {
    render(<DashboardCard label="Modules" value={42} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders as a clickable link to the given route when `to` is provided', () => {
    render(
      <MemoryRouter>
        <DashboardCard label="Modules" value={42} to="/modules" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/modules')
  })

  it('falls back to "/" and warns when `to` is an unsafe route path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <MemoryRouter>
        <DashboardCard label="Modules" value={42} to="//evil.example.com" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe route path'))
  })
})
