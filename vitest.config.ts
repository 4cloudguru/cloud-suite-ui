import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/types.ts', 'src/index.ts'],
      // Gate the core areas (identity/shell/theme/utils/components/consent) so their coverage
      // can't silently regress. Floors sit a few points below the current aggregate for each
      // area; raise them as coverage improves, but never lower without cause.
      //
      // perFile checks every glob entry below against each matching file individually, instead
      // of only the directory aggregate - and, empirically, a file matching two glob entries is
      // checked against BOTH independently (there's no "most specific wins" precedence). That
      // surfaced files below their directory floor that were previously hiding behind stronger
      // siblings in the same directory. For each such file, the directory glob below is narrowed
      // with an extglob negation (`!(a|b)`) so it no longer matches that file, and the file gets
      // its own entry instead, pinned at today's real numbers (rounded down) - coverage debt to
      // raise, not a floor to relax. Once a file's coverage clears its directory floor on its
      // own, remove its negation from the directory glob and delete its dedicated entry.
      thresholds: {
        perFile: true,
        'src/identity/**': { statements: 85, branches: 72, functions: 80, lines: 88 },
        'src/shell/**': { statements: 82, branches: 74, functions: 70, lines: 82 },
        'src/theme/!(createAppTheme.ts|SuiteThemeProvider.tsx)': { statements: 87, branches: 73, functions: 85, lines: 90 },
        'src/utils/!(storage.ts)': { statements: 88, branches: 90, functions: 95, lines: 85 },
        'src/components/!(ApiKeyExpirySettingsCard.tsx|NotificationChannelsSection.tsx)': { statements: 85, branches: 84, functions: 70, lines: 86 },
        'src/consent/!(ConsentBanner.tsx)': { statements: 90, branches: 94, functions: 82, lines: 89 },
        // Coverage debt (2026-08-06), pinned at real numbers from `npm run test:coverage`:
        'src/theme/createAppTheme.ts': { statements: 81, branches: 81, functions: 100, lines: 80 },
        'src/theme/SuiteThemeProvider.tsx': { statements: 90, branches: 70, functions: 92, lines: 93 },
        'src/utils/storage.ts': { statements: 87, branches: 100, functions: 100, lines: 85 },
        'src/components/ApiKeyExpirySettingsCard.tsx': { statements: 92, branches: 100, functions: 66, lines: 92 },
        'src/components/NotificationChannelsSection.tsx': { statements: 85, branches: 80, functions: 69, lines: 87 },
        'src/consent/ConsentBanner.tsx': { statements: 83, branches: 100, functions: 66, lines: 80 },
      },
    },
  },
})
