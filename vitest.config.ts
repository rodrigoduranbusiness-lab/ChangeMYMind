import { defineConfig } from 'vitest/config'

// Pure logic tests: no emulator, no network. The rules tests live under
// tests/emulator and run via `npm run test:rules`.
export default defineConfig({
  test: {
    include: ['tests/*.test.ts'],
  },
})
