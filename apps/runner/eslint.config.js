// Flat ESLint config for @researchcrafters/runner.
// Re-exports the workspace shared baseline (typescript-eslint recommended +
// eslint-config-prettier) from @researchcrafters/config so lint behaviour is
// consistent across the monorepo.

import shared from "@researchcrafters/config/eslint";

export default shared;
