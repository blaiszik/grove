import chalk from 'chalk';
import { execa } from 'execa';
import { assertValidTreeName, readConfig, resolveGroveRoot } from '../lib/config.js';
import { getOutputOptions, printJson } from '../lib/output.js';

const SUPPORTED_TOOLS = ['claude', 'codex', 'run'] as const;
type SupportedTool = (typeof SUPPORTED_TOOLS)[number];

function isSupportedTool(tool: string): tool is SupportedTool {
  return (SUPPORTED_TOOLS as readonly string[]).includes(tool);
}

export async function ai(
  tool: string,
  name: string,
  args: string[] = []
): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();

  if (out.json) {
    printJson({ ok: false, error: '--json is not supported for interactive AI sessions' });
    process.exit(1);
  }

  try {
    assertValidTreeName(name);

    if (!isSupportedTool(tool)) {
      if (!out.quiet) {
        console.error(chalk.red(`Unknown AI tool: ${tool}`));
        console.error(chalk.gray(`Supported: ${SUPPORTED_TOOLS.join(', ')}`));
      }
      process.exit(1);
    }

    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);

    if (!config.trees[name]) {
      if (!out.quiet) {
        console.error(chalk.red(`Tree '${name}' not found`));
      }
      process.exit(1);
    }

    const tree = config.trees[name];
    const treePath = tree.path;

    let command: string;
    let commandArgs: string[];

    if (tool === 'run') {
      if (args.length === 0) {
        if (!out.quiet) {
          console.error(chalk.red('No command provided for `grove ai run`'));
          console.error(chalk.gray('Usage: grove ai run <name> -- <command> [args...]'));
        }
        process.exit(1);
      }
      command = args[0];
      commandArgs = args.slice(1);
    } else {
      command = tool;
      commandArgs = args;
    }

    if (!out.quiet) {
      const label = tool === 'run' ? command : tool;
      console.log(chalk.cyan(`Starting ${label} in '${name}'...`));
      console.log(chalk.gray(`  Path: ${treePath}`));
      console.log(chalk.gray(`  Branch: ${tree.branch}`));
      console.log('');
    }

    const env = {
      ...process.env,
      GROVE_TREE: name,
      GROVE_TREE_PATH: treePath,
      GROVE_BRANCH: tree.branch,
      GROVE_ROOT: groveRoot,
      GROVE_REPO: config.repo,
    };

    await execa(command, commandArgs, {
      cwd: treePath,
      stdio: 'inherit',
      env,
    });
  } catch (error) {
    if (!out.quiet) {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
    process.exit(1);
  }
}

