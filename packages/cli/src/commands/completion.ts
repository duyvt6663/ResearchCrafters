import type { Command } from 'commander';

export type SupportedShell = 'bash' | 'zsh' | 'fish';

const SUPPORTED: ReadonlyArray<SupportedShell> = ['bash', 'zsh', 'fish'];

export function isSupportedShell(value: string): value is SupportedShell {
  return (SUPPORTED as ReadonlyArray<string>).includes(value);
}

interface CommandSpec {
  name: string;
  description: string;
  options: ReadonlyArray<{ flag: string; description: string }>;
}

function collectSpec(program: Command): {
  commands: ReadonlyArray<CommandSpec>;
  globalOptions: ReadonlyArray<{ flag: string; description: string }>;
} {
  const commands: CommandSpec[] = [];
  for (const cmd of program.commands) {
    if (cmd.name() === 'help') continue;
    commands.push({
      name: cmd.name(),
      description: cmd.description(),
      options: cmd.options.map((opt) => ({
        flag: opt.long ?? opt.short ?? '',
        description: opt.description,
      })),
    });
  }
  const globalOptions = [
    { flag: '--help', description: 'Show help' },
    { flag: '--version', description: 'Show CLI version' },
  ];
  return { commands, globalOptions };
}

function bashScript(spec: ReturnType<typeof collectSpec>): string {
  const names = spec.commands.map((c) => c.name).join(' ');
  const cases = spec.commands
    .map((c) => {
      const opts = c.options.map((o) => o.flag).filter(Boolean).join(' ');
      return `        ${c.name})\n            opts="${opts} --help"\n            ;;`;
    })
    .join('\n');
  return `# researchcrafters bash completion
# Install: source <(researchcrafters completion bash)
# Or add to ~/.bashrc: source <(researchcrafters completion bash)
_researchcrafters_completion() {
    local cur prev words cword
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    local commands="${names}"
    local global_opts="--help --version"

    if [ "\${COMP_CWORD}" -eq 1 ]; then
        COMPREPLY=( $(compgen -W "\${commands} \${global_opts}" -- "\${cur}") )
        return 0
    fi

    local subcommand="\${COMP_WORDS[1]}"
    local opts=""
    case "\${subcommand}" in
${cases}
        *)
            opts="--help"
            ;;
    esac

    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    else
        COMPREPLY=( $(compgen -f -- "\${cur}") )
    fi
    return 0
}
complete -F _researchcrafters_completion researchcrafters
`;
}

function zshScript(spec: ReturnType<typeof collectSpec>): string {
  const commandLines = spec.commands
    .map((c) => `        '${c.name}:${c.description.replace(/'/g, "'\\''")}'`)
    .join(' \\\n');
  const cases = spec.commands
    .map((c) => {
      const optLines = c.options
        .map(
          (o) =>
            `                '${o.flag}[${o.description.replace(/'/g, "'\\''")}]'`,
        )
        .concat([`                '--help[Show help]'`])
        .join(' \\\n');
      return `        ${c.name})\n            _arguments \\\n${optLines} \\\n                '*:file:_files'\n            ;;`;
    })
    .join('\n');
  return `#compdef researchcrafters
# researchcrafters zsh completion
# Install: researchcrafters completion zsh > "\${fpath[1]}/_researchcrafters"
# Or for current shell: source <(researchcrafters completion zsh)

_researchcrafters() {
    local -a commands
    local context state line

    _arguments -C \\
        '--help[Show help]' \\
        '--version[Show CLI version]' \\
        '1: :->command' \\
        '*::arg:->args'

    case $state in
        command)
            commands=( \\
${commandLines} \\
            )
            _describe 'command' commands
            ;;
        args)
            case $words[1] in
${cases}
            esac
            ;;
    esac
}

_researchcrafters "$@"
`;
}

function fishScript(spec: ReturnType<typeof collectSpec>): string {
  const lines: string[] = [
    '# researchcrafters fish completion',
    '# Install: researchcrafters completion fish > ~/.config/fish/completions/researchcrafters.fish',
    '',
    'complete -c researchcrafters -n "__fish_use_subcommand" -l help -d "Show help"',
    'complete -c researchcrafters -n "__fish_use_subcommand" -l version -d "Show CLI version"',
  ];
  for (const c of spec.commands) {
    lines.push(
      `complete -c researchcrafters -n "__fish_use_subcommand" -a "${c.name}" -d "${c.description.replace(/"/g, '\\"')}"`,
    );
  }
  for (const c of spec.commands) {
    for (const o of c.options) {
      if (!o.flag.startsWith('--')) continue;
      const long = o.flag.replace(/^--/, '').split(/[ =]/)[0];
      lines.push(
        `complete -c researchcrafters -n "__fish_seen_subcommand_from ${c.name}" -l ${long} -d "${o.description.replace(/"/g, '\\"')}"`,
      );
    }
    lines.push(
      `complete -c researchcrafters -n "__fish_seen_subcommand_from ${c.name}" -l help -d "Show help"`,
    );
  }
  return lines.join('\n') + '\n';
}

export function renderCompletion(program: Command, shell: SupportedShell): string {
  const spec = collectSpec(program);
  switch (shell) {
    case 'bash':
      return bashScript(spec);
    case 'zsh':
      return zshScript(spec);
    case 'fish':
      return fishScript(spec);
  }
}

export async function completionCommand(
  program: Command,
  shell: string,
): Promise<void> {
  if (!isSupportedShell(shell)) {
    process.stderr.write(
      `Unsupported shell: ${shell}. Supported: ${SUPPORTED.join(', ')}.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(renderCompletion(program, shell));
}
