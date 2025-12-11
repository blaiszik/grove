import chalk from 'chalk';
import ora from 'ora';
import { readConfig, updateConfig } from '../lib/config.js';
import { createCurrentLink, getCurrentTreeName } from '../lib/symlink.js';

export async function tend(name: string): Promise<void> {
  const cwd = process.cwd();
  const spinner = ora(`Switching to '${name}'...`).start();

  try {
    const config = await readConfig(cwd);

    // Check if tree exists
    if (!config.trees[name]) {
      spinner.fail(`Tree '${name}' not found`);
      console.log('');
      console.log(chalk.gray('Available trees:'));
      for (const treeName of Object.keys(config.trees)) {
        console.log(chalk.gray(`  - ${treeName}`));
      }
      process.exit(1);
    }

    const currentTree = await getCurrentTreeName(cwd);
    if (currentTree === name) {
      spinner.info(`Already on '${name}'`);
      return;
    }

    // Update symlink
    await createCurrentLink(name, cwd);

    // Update config
    await updateConfig((c) => ({
      ...c,
      current: name,
    }), cwd);

    const tree = config.trees[name];
    spinner.succeed(`Now tending '${name}'`);

    console.log('');
    console.log(chalk.gray(`  Branch: ${tree.branch}`));
    console.log(chalk.gray(`  Path:   ${tree.path}`));
    console.log('');
    console.log(chalk.cyan('The `current` symlink now points to this tree.'));
  } catch (error) {
    spinner.fail('Failed to switch tree');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
