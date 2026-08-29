import { Container, type ContainerProps } from '@mui/material'

export interface PageProps extends Omit<ContainerProps, 'maxWidth'> {
  maxWidth?: ContainerProps['maxWidth']
}

/**
 * Standard page shell: width-constrained (default 'lg') with vertical padding.
 * Forwards `sx` (merged) and arbitrary props (aria-*, etc.) to MUI Container.
 */
export function Page({ maxWidth = 'lg', sx, children, ...rest }: PageProps) {
  return (
    <Container maxWidth={maxWidth} sx={{ py: 4, ...sx }} {...rest}>
      {children}
    </Container>
  )
}
