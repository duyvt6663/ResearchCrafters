/**
 * @researchcrafters/ui — public API barrel.
 *
 * Subpath entry points are also exposed for tree-shaken consumers:
 *  - "@researchcrafters/ui/tokens"
 *  - "@researchcrafters/ui/copy"
 *  - "@researchcrafters/ui/components"
 *  - "@researchcrafters/ui/cli-commands"
 *  - "@researchcrafters/ui/styles.css" (Tailwind v4 theme)
 *
 * Stage authors and the web app should import from these subpaths to keep
 * bundles tight; this root export is convenient for app code that reaches
 * for several surfaces at once.
 */

export * from "./tokens.js";
export * from "./components/index.js";
export { cope, copy } from "./copy/index.js";
export type { CopeNamespace, CopyNamespace } from "./copy/index.js";
export {
  LEARNER_COMMANDS,
  AUTHOR_COMMANDS,
  COMMON_COMMANDS,
  ALL_COMMANDS,
  findCommand,
  cliCommands,
} from "./cli-commands.js";
export type {
  CliCommand,
  CliCommandAccessors,
  LearnerCommandName,
  AuthorCommandName,
  CommonCommandName,
  AnyCliCommandName,
} from "./cli-commands.js";
export { cn } from "./lib/cn.js";
