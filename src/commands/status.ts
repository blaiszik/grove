import chalk from 'chalk';
import { readConfig } from '../lib/config.js';
import { getCurrentTreeName } from '../lib/symlink.js';
import { getRunningPreviews, isPreviewRunning } from '../lib/preview.js';

export async function status(): Promise<void> {
  const cwd = process.cwd();

  try {
    const config = await readConfig(cwd);
    const currentTree = await getCurrentTreeName(cwd);
    const previews = await getRunningPreviews(cwd);

    console.log(chalk.bold('\nGrove Status\n'));

    // Current tree
    console.log(chalk.white('Current Tree:'));
    if (currentTree && config.trees[currentTree]) {
      const tree = config.trees[currentTree];
      console.log(chalk.green(`  ${currentTree}`));
      console.log(chalk.gray(`  Branch: ${tree.branch}`));
      console.log(chalk.gray(`  Path: ./current`));
    } else {
      console.log(chalk.yellow('  None selected'));
    }
    console.log('');

    // Running previews
    console.log(chalk.white('Running Previews:'));
    const previewEntries = Object.entries(previews);

    if (previewEntries.length === 0) {
      console.log(chalk.gray('  No previews running'));
    } else {
      for (const [name, preview] of previewEntries) {
        const running = await isPreviewRunning(name, cwd);
        if (running) {
          console.log(
            chalk.cyan(`  ${name}`) +
            chalk.gray(` → http://localhost:${preview.port}`) +
            chalk.gray(` (${preview.mode})`)
          );
        }
      }
    }
    console.log('');

    // Summary
    const treeCount = Object.keys(config.trees).length;
    const runningCount = previewEntries.filter(
      async ([name]) => await isPreviewRunning(name, cwd)
    ).length;

    console.log(chalk.white('Summary:'));
    console.log(chalk.gray(`  Trees: ${treeCount}`));
    console.log(chalk.gray(`  Previews running: ${runningCount}`));
    console.log(chalk.gray(`  Package manager: ${config.packageManager}`));
    console.log(chalk.gray(`  Framework: ${config.framework}`));
    console.log('');
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
