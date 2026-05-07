// Flat ESLint config for @researchcrafters/db.
// Re-exports the workspace shared baseline (typescript-eslint recommended +
// eslint-config-prettier) from @researchcrafters/config so lint behaviour is
// consistent across the monorepo.
//
// Note: Prisma's generated client lives under node_modules — the shared base
// already ignores `node_modules`, so we don't need to add anything here.

import shared from "@researchcrafters/config/eslint";

export default shared;
