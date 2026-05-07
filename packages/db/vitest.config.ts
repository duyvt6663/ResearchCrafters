// Vitest config for `@researchcrafters/db`.
//
// We only run the crypto unit suite here today. Anything that needs a live
// Prisma client or a live Postgres lives outside this package (it's
// integration-shaped and currently absent).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: false,
    // The tests don't touch the network or the FS; the default 5s timeout
    // is plenty.
  },
});
