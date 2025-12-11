import chalk from 'chalk';
import { readConfig } from '../lib/config.js';
import { getCurrentTreeName, isSymlinkValid } from '../lib/symlink.js';
import { isPreviewRunning, getRunningPreviews } from '../lib/preview.js';
import { getOutputOptions, printJson } from '../lib/output.js';

export async function list(): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();

  try {
    const config = await readConfig(cwd);
    const currentTree = await getCurrentTreeName(cwd);
    const previews = await getRunningPreviews(cwd);

    const trees = Object.entries(config.trees);

    if (trees.length === 0) {
      if (out.json) {
        printJson({
          repo: config.repo,
          packageManager: config.packageManager,
          framework: config.framework,
          current: currentTree,
          trees: [],
        });
        return;
      }
      if (!out.quiet) {
        console.log(chalk.yellow('No trees in the grove.'));
        console.log(chalk.gray('Run `grove plant <branch>` to create one.'));
      }
      return;
    }

    if (out.json) {
      const treesOut = await Promise.all(
        trees.map(async ([name, info]) => {
          const preview = previews[name];
          const running = preview ? await isPreviewRunning(name, cwd) : false;
          return {
            name,
            branch: info.branch,
            path: info.path,
            created: info.created,
            current: name === currentTree,
            preview: running && preview ? preview : null,
          };
        })
      );

      printJson({
        repo: config.repo,
        packageManager: config.packageManager,
        framework: config.framework,
        current: currentTree,
        trees: treesOut,
      });
      return;
    }

    if (out.quiet) {
      console.log(trees.map(([name]) => name).join('\n'));
      return;
    }

    console.log(chalk.bold('\nGrove Trees:\n'));

    const maxNameLen = Math.max(...trees.map(([name]) => name.length));
    const maxBranchLen = Math.max(...trees.map(([, info]) => info.branch.length));

    for (const [name, info] of trees) {
      const isCurrent = name === currentTree;
      const preview = previews[name];
      const isRunning = preview ? await isPreviewRunning(name, cwd) : false;

      const marker = isCurrent ? chalk.green('▸ ') : '  ';
      const nameStr = isCurrent
        ? chalk.green(name.padEnd(maxNameLen))
        : chalk.white(name.padEnd(maxNameLen));
      const branchStr = chalk.gray(info.branch.padEnd(maxBranchLen));

      let statusStr = '';
      if (isRunning && preview) {
        statusStr = chalk.cyan(` [preview :${preview.port}]`);
      }

      console.log(`${marker}${nameStr}  ${branchStr}${statusStr}`);
    }

    console.log('');
    console.log(chalk.gray(`Package manager: ${config.packageManager}`));
    console.log(chalk.gray(`Framework: ${config.framework}`));
    console.log('');
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
