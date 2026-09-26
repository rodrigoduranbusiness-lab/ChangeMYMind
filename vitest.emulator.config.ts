import { defineConfig } from 'vitest/config'

// Security rules tests. These need the Firestore emulator, so they are run
// through `firebase emulators:exec` by the `test:rules` script.
export default defineConfig({
  test: {
    include: ['tests/emulator/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
