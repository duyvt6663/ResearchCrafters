/**
 * Canonical CLI surface, mirrored from `TODOS/03-cli-runner.md`.
 *
 * Importing this in stage copy and the web app is the ONLY supported way to
 * render `researchcrafters` commands. Hardcoded command strings outside this
 * module are forbidden (CI lint should fail the build).
 *
 * If `TODOS/03-cli-runner.md` adds a command, add it here in the same PR.
 */

export interface CliCommand {
  /** The full invocation, e.g. `researchcrafters start <package>`. */
  readonly name: string;
  /** Short positional/flag spec for inline help (already inside `name`). */
  readonly args: string;
  /** One-line summary suitable for tooltip / catalog descriptions. */
  readonly summary: string;
}

export const LEARNER_COMMANDS = [
  {
    name: "researchcrafters login",
    args: "",
    summary: "Authenticate via OAuth device-code flow.",
  },
  {
    name: "researchcrafters logout",
    args: "",
    summary: "Revoke and clear the local auth token.",
  },
  {
    name: "researchcrafters start <package>",
    args: "<package>",
    summary:
      "Resolve entitlement, download the starter workspace, and write `.researchcrafters/config.json`.",
  },
  {
    name: "researchcrafters test",
    args: "",
    summary: "Run local smoke tests for the active stage.",
  },
  {
    name: "researchcrafters submit",
    args: "",
    summary: "Bundle the workspace and upload it to the runner.",
  },
  {
    name: "researchcrafters status",
    args: "",
    summary: "Show the current stage and the last run's status.",
  },
  {
    name: "researchcrafters logs <run-id>",
    args: "<run-id>",
    summary: "Stream or poll runner logs for a submitted run.",
  },
] as const satisfies readonly CliCommand[];

export const AUTHOR_COMMANDS = [
  {
    name: "researchcrafters validate <package-path>",
    args: "<package-path>",
    summary: "Run validation layers 1-4 against an authored package.",
  },
  {
    name: "researchcrafters preview <package-path>",
    args: "<package-path>",
    summary: "Open the local package in the preview environment.",
  },
  {
    name: "researchcrafters build <package-path>",
    args: "<package-path>",
    summary: "Compile indexes and prepare the package for upload.",
  },
] as const satisfies readonly CliCommand[];

export const COMMON_COMMANDS = [
  {
    name: "researchcrafters --version",
    args: "--version",
    summary:
      "Print the installed CLI version. Warns when older than the server's expected minimum.",
  },
  {
    name: "researchcrafters completion <shell>",
    args: "<shell>",
    summary: "Emit shell completion script for bash, zsh, or fish.",
  },
] as const satisfies readonly CliCommand[];

export const ALL_COMMANDS = [
  ...LEARNER_COMMANDS,
  ...AUTHOR_COMMANDS,
  ...COMMON_COMMANDS,
] as const satisfies readonly CliCommand[];

export type LearnerCommandName = (typeof LEARNER_COMMANDS)[number]["name"];
export type AuthorCommandName = (typeof AUTHOR_COMMANDS)[number]["name"];
export type CommonCommandName = (typeof COMMON_COMMANDS)[number]["name"];
export type AnyCliCommandName =
  | LearnerCommandName
  | AuthorCommandName
  | CommonCommandName;

/**
 * Lookup a command by exact `name`. Returns `undefined` if unknown — the web
 * app renderer should surface that as an authoring error, not silently ignore.
 */
export function findCommand(name: string): CliCommand | undefined {
  return ALL_COMMANDS.find((c) => c.name === name);
}

/**
 * `cliCommands` — friendly, app-facing accessors for the canonical CLI surface.
 *
 * The `LEARNER_COMMANDS` / `AUTHOR_COMMANDS` arrays remain the source of truth
 * (see `TODOS/03-cli-runner.md`). This object exposes ready-to-render strings
 * for the web app's stage player, where commands are interpolated with the
 * active stage ref. Add new accessors here whenever a new web flow needs a
 * specific command — never inline the string at the call site.
 */
export const cliCommands = {
  /** `researchcrafters start <stageRef>` — fetch the workspace for a stage. */
  start: (stageRef: string): string => `researchcrafters start ${stageRef}`,
  /** `researchcrafters test` — run local smoke tests for the active stage. */
  test: "researchcrafters test",
  /** `researchcrafters submit` — bundle and upload the workspace. */
  submit: "researchcrafters submit",
  /** `researchcrafters status` — show the active stage and last run status. */
  status: "researchcrafters status",
  /** `researchcrafters logs <runId>` — stream/poll runner logs. */
  logs: (runId: string): string => `researchcrafters logs ${runId}`,
} as const;

export type CliCommandAccessors = typeof cliCommands;
