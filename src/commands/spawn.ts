import chalk from 'chalk';
import { readConfig, getTreePath } from '../lib/config.js';
import { spawnClaudeCode } from '../lib/editor.js';

export async function spawn(name: string): Promise<void> {
  const cwd = process.cwd();

  try {
    const config = await readConfig(cwd);

    // Validate tree exists
    if (!config.trees[name]) {
      console.log(chalk.red(`Tree '${name}' not found`));
      console.log('');
      console.log(chalk.gray('Available trees:'));
      for (const treeName of Object.keys(config.trees)) {
        console.log(chalk.gray(`  - ${treeName}`));
      }
      process.exit(1);
    }

    const treePath = getTreePath(name, cwd);
    const tree = config.trees[name];

    console.log(chalk.cyan(`Spawning Claude Code in '${name}'...`));
    console.log(chalk.gray(`  Path: ${treePath}`));
    console.log(chalk.gray(`  Branch: ${tree.branch}`));
    console.log('');

    // This will block until Claude Code exits
    await spawnClaudeCode(name, cwd);

    console.log('');
    console.log(chalk.gray('Claude Code session ended.'));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
