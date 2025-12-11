import chalk from 'chalk';
import { readConfig } from '../lib/config.js';
import { getCurrentTreeName } from '../lib/symlink.js';
import { getRunningPreviews, isPreviewRunning } from '../lib/preview.js';
import { getOutputOptions, printJson } from '../lib/output.js';
import type { PreviewInfo } from '../types.js';

export async function status(): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();

  try {
    const config = await readConfig(cwd);
    const currentTree = await getCurrentTreeName(cwd);
    const previews = await getRunningPreviews(cwd);

    const previewEntries = Object.entries(previews);
    const runningFlags = await Promise.all(
      previewEntries.map(([name]) => isPreviewRunning(name, cwd))
    );
    const runningPreviews = previewEntries
      .filter((_, i) => runningFlags[i])
      .reduce<Record<string, PreviewInfo>>((acc, [name, preview]) => {
        acc[name] = preview;
        return acc;
      }, {});

    const treeCount = Object.keys(config.trees).length;
    const runningCount = runningFlags.filter(Boolean).length;

    if (out.json) {
      const current = currentTree && config.trees[currentTree]
        ? { name: currentTree, ...config.trees[currentTree] }
        : null;

      printJson({
        current,
        previews: runningPreviews,
        summary: {
          trees: treeCount,
          previewsRunning: runningCount,
          packageManager: config.packageManager,
          framework: config.framework,
        },
      });
      return;
    }

    if (out.quiet) {
      if (currentTree) {
        console.log(currentTree);
      }
      return;
    }

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
    if (previewEntries.length === 0) {
      console.log(chalk.gray('  No previews running'));
    } else {
      for (const [name, preview] of Object.entries(runningPreviews)) {
        console.log(
          chalk.cyan(`  ${name}`) +
          chalk.gray(` → http://localhost:${preview.port}`) +
          chalk.gray(` (${preview.mode})`)
        );
      }
    }
    console.log('');

    // Summary
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
