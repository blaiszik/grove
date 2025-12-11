import chalk from 'chalk';
import { readConfig, assertValidTreeName } from '../lib/config.js';
import { spawnClaudeCode } from '../lib/editor.js';
import { getOutputOptions, printJson } from '../lib/output.js';

export async function spawn(name: string): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();

  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);

    // Validate tree exists
    if (!config.trees[name]) {
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      } else if (!out.quiet) {
        console.log(chalk.red(`Tree '${name}' not found`));
        console.log('');
        console.log(chalk.gray('Available trees:'));
        for (const treeName of Object.keys(config.trees)) {
          console.log(chalk.gray(`  - ${treeName}`));
        }
      }
      process.exit(1);
    }

    const tree = config.trees[name];
    const treePath = tree.path;

    if (out.json) {
      printJson({ ok: false, error: '--json is not supported for interactive spawn sessions' });
      process.exit(1);
    }

    if (!out.quiet) {
      console.log(chalk.cyan(`Spawning Claude Code in '${name}'...`));
      console.log(chalk.gray(`  Path: ${treePath}`));
      console.log(chalk.gray(`  Branch: ${tree.branch}`));
      console.log('');
    }

    // This will block until Claude Code exits
    await spawnClaudeCode(name, cwd);

    if (!out.quiet) {
      console.log('');
      console.log(chalk.gray('Claude Code session ended.'));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}
