/**
 * CLI warning copy, aligned with `backlog/03-cli-runner.md`.
 *
 * Stale-CLI warning is rendered both in the terminal (by the CLI itself) and
 * in the web app's CLI command block, so we keep one source.
 */

export interface StaleCliArgs {
  /** Installed CLI version, e.g. "0.4.2". */
  installed: string;
  /** Minimum version the server expects for the active stage. */
  expected: string;
}

export interface StaleCliCopy {
  title: string;
  body: string;
  upgradeCta: string;
}

export function staleCli(args: StaleCliArgs): StaleCliCopy {
  return {
    title: "Your CLI is older than this stage expects.",
    body: `Installed ${args.installed}, this stage expects ${args.expected} or newer. Older versions can produce stale runner behavior or fail upload.`,
    upgradeCta: "Update the CLI",
  };
}
