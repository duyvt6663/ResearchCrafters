import kleur from 'kleur';

export type CliErrorKind =
  | 'not_logged_in'
  | 'missing_entitlement'
  | 'fixture_hash_mismatch'
  | 'runner_offline'
  | 'stage_not_unlocked'
  | 'no_project_config'
  | 'unknown';

export class CliError extends Error {
  constructor(
    public kind: CliErrorKind,
    message: string,
    public hint?: string,
    public exitCode = 1,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function formatCliError(err: CliError | Error): string {
  if (err instanceof CliError) {
    const banner = kleur.red().bold(`error[${err.kind}]`);
    const hint = err.hint ? `\n  ${kleur.dim('hint:')} ${err.hint}` : '';
    return `${banner} ${err.message}${hint}`;
  }
  return kleur.red().bold('error') + ' ' + err.message;
}

export const errors = {
  notLoggedIn(): CliError {
    return new CliError(
      'not_logged_in',
      'You are not logged in.',
      'Run `researchcrafters login` to authenticate.',
    );
  },
  missingEntitlement(slug: string): CliError {
    return new CliError(
      'missing_entitlement',
      `You do not have access to the package "${slug}".`,
      'Upgrade your plan or check that you are logged in with the right account.',
    );
  },
  fixtureHashMismatch(p: string): CliError {
    return new CliError(
      'fixture_hash_mismatch',
      `Fixture sha256 mismatch for ${p}.`,
      'This is a package-author bug. Please report it; do not edit fixtures locally.',
    );
  },
  runnerOffline(): CliError {
    return new CliError(
      'runner_offline',
      'The remote runner is offline.',
      'Try again in a minute. Use `researchcrafters status` to check service health.',
    );
  },
  stageNotUnlocked(stageRef: string): CliError {
    return new CliError(
      'stage_not_unlocked',
      `Stage ${stageRef} is not unlocked yet.`,
      'Complete the prerequisite stages first.',
    );
  },
  noProjectConfig(): CliError {
    return new CliError(
      'no_project_config',
      'No .researchcrafters/config.json found in the current directory.',
      'Run `researchcrafters start <package>` first.',
    );
  },
};
