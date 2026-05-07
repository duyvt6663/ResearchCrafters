import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { startCommand } from './commands/start.js';
import { testCommand } from './commands/test.js';
import { submitCommand } from './commands/submit.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { validateCommand } from './commands/validate.js';
import { previewCommand } from './commands/preview.js';
import { buildCommand } from './commands/build.js';
import { CLI_VERSION, maybeWarnVersionMismatch } from './lib/version-check.js';
import { CliError, formatCliError } from './lib/error-ux.js';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('researchcrafters')
    .description('ResearchCrafters CLI: learner and author commands')
    .version(CLI_VERSION);

  program
    .command('login')
    .description('Authenticate via OAuth device-code flow')
    .action(async () => {
      await loginCommand();
    });

  program
    .command('logout')
    .description('Revoke and clear local credentials')
    .action(async () => {
      await logoutCommand();
    });

  program
    .command('start <package>')
    .description('Resolve a package, download starter, write local config')
    .action(async (slug: string) => {
      await startCommand(slug);
    });

  program
    .command('test')
    .description('Run the package-defined local smoke command')
    .action(async () => {
      await testCommand();
    });

  program
    .command('submit')
    .description('Bundle the workspace and upload to the runner')
    .action(async () => {
      await submitCommand();
    });

  program
    .command('status')
    .description('Show current stage and last run')
    .action(async () => {
      await statusCommand();
    });

  program
    .command('logs <runId>')
    .description('Stream or poll run logs')
    .option('-f, --follow', 'Poll until the run finishes')
    .action(async (runId: string, opts: { follow?: boolean }) => {
      await logsCommand(runId, opts.follow ? { follow: true } : {});
    });

  program
    .command('validate <packagePath>')
    .description('Run validator layers 1-4 against an ERP package')
    .option('--json', 'Emit machine-readable JSON instead of colored text')
    .action(async (pkgPath: string, opts: { json?: boolean }) => {
      await validateCommand(pkgPath, opts.json ? { json: true } : {});
    });

  program
    .command('preview <packagePath>')
    .description('Show the URL where the local package would be previewed')
    .action(async (pkgPath: string) => {
      await previewCommand(pkgPath);
    });

  program
    .command('build <packagePath>')
    .description('Validate and build the manifest for upload')
    .option('--out <dir>', 'Output directory (defaults to <package>/.build)')
    .action(async (pkgPath: string, opts: { out?: string }) => {
      await buildCommand(pkgPath, opts.out ? { outDir: opts.out } : {});
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  await maybeWarnVersionMismatch().catch(() => {
    /* network failures should not block CLI invocation */
  });
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(formatCliError(err) + '\n');
      process.exitCode = err.exitCode;
      return;
    }
    process.stderr.write(formatCliError(err as Error) + '\n');
    process.exitCode = 1;
  }
}

export { CliError } from './lib/error-ux.js';
