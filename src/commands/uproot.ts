import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { readConfig, updateConfig, getTreesDir } from '../lib/config.js';
import { removeWorktree } from '../lib/git.js';
import { getCurrentTreeName, removeCurrentLink } from '../lib/symlink.js';
import { isPreviewRunning, stopPreview } from '../lib/preview.js';

interface UprootOptions {
  force?: boolean;
}

export async function uproot(name: string, options: UprootOptions): Promise<void> {
  const cwd = process.cwd();
  const spinner = ora(`Uprooting '${name}'...`).start();

  try {
    const config = await readConfig(cwd);

    // Check if tree exists
    if (!config.trees[name]) {
      spinner.fail(`Tree '${name}' not found`);
      process.exit(1);
    }

    const tree = config.trees[name];

    // Check if this is the main repo (not a real worktree)
    // The main tree points to the repo root, not .grove/trees/*
    const treesDir = getTreesDir(cwd);
    const isRealWorktree = tree.path.startsWith(treesDir);

    if (!isRealWorktree) {
      spinner.fail(`Cannot uproot '${name}' - it's the main repository`);
      console.log(chalk.gray('The main tree represents your original repository.'));
      console.log(chalk.gray('You can only uproot worktrees created with `grove plant`.'));
      process.exit(1);
    }

    // Check if it's the current tree
    const currentTree = await getCurrentTreeName(cwd);
    const isCurrent = currentTree === name;

    if (isCurrent && Object.keys(config.trees).length === 1) {
      spinner.fail('Cannot uproot the last tree in the grove');
      console.log(chalk.gray('At least one tree must remain.'));
      process.exit(1);
    }

    // Stop preview if running
    if (await isPreviewRunning(name, cwd)) {
      spinner.text = 'Stopping preview server...';
      await stopPreview(name, cwd);
    }

    // Remove git worktree
    spinner.text = 'Removing worktree...';
    await removeWorktree(tree.path, { force: options.force }, config.repo);

    // Update config
    await updateConfig((c) => {
      const { [name]: _, ...remainingTrees } = c.trees;
      return {
        ...c,
        trees: remainingTrees,
        current: c.current === name ? null : c.current,
      };
    }, cwd);

    // If this was the current tree, update symlink to another tree
    if (isCurrent) {
      const remainingTrees = Object.keys(config.trees).filter((t) => t !== name);
      if (remainingTrees.length > 0) {
        const newCurrent = remainingTrees[0];
        const newTreePath = config.trees[newCurrent].path;

        // Update the symlink to point to the new tree's actual path
        const currentLinkPath = path.join(cwd, 'current');
        // Use lstat to check for symlink (pathExists follows symlinks)
        try {
          await fs.lstat(currentLinkPath);
          await fs.unlink(currentLinkPath);
        } catch {
          // Symlink doesn't exist, that's fine
        }
        // If the new tree is the main repo (same as cwd), use '.' as the symlink target
        const relativePath = path.relative(cwd, newTreePath) || '.';
        await fs.symlink(relativePath, currentLinkPath);

        await updateConfig((c) => ({
          ...c,
          current: newCurrent,
        }), cwd);
        spinner.succeed(`Uprooted '${name}', switched to '${newCurrent}'`);
      } else {
        await removeCurrentLink(cwd);
        spinner.succeed(`Uprooted '${name}'`);
      }
    } else {
      spinner.succeed(`Uprooted '${name}'`);
    }

    console.log('');
    console.log(chalk.gray(`  Branch: ${tree.branch}`));
    console.log(chalk.gray(`  Path:   ${tree.path} (removed)`));
  } catch (error) {
    spinner.fail('Failed to uproot tree');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));

    if (!options.force) {
      console.log('');
      console.log(chalk.yellow('Tip: Use --force to force removal'));
    }
    process.exit(1);
  }
}
