import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { readConfig, updateConfig, getTreesDir, resolveGroveRoot, assertValidTreeName } from '../lib/config.js';
import { removeWorktree } from '../lib/git.js';
import { getCurrentTreeName, removeCurrentLink } from '../lib/symlink.js';
import { isPreviewRunning, stopPreview } from '../lib/preview.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

interface UprootOptions {
  force?: boolean;
}

export async function uproot(name: string, options: UprootOptions): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora(`Uprooting '${name}'...`).start() : null;

  try {
    assertValidTreeName(name);
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);
    let switchedTo: string | null = null;

    // Check if tree exists
    if (!config.trees[name]) {
      if (spinner) spinner.fail(`Tree '${name}' not found`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      }
      process.exit(1);
    }

    const tree = config.trees[name];

    // Check if this is the main repo (not a real worktree)
    // The main tree points to the repo root, not .grove/trees/*
    const treesDir = getTreesDir(groveRoot);
    const rel = path.relative(treesDir, tree.path);
    const isRealWorktree = !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);

    if (!isRealWorktree) {
      if (spinner) spinner.fail(`Cannot uproot '${name}' - it's the main repository`);
      if (out.json) {
        printJson({ ok: false, error: `Cannot uproot '${name}' - it's the main repository` });
      } else if (!out.quiet) {
        console.log(chalk.gray('The main tree represents your original repository.'));
        console.log(chalk.gray('You can only uproot worktrees created with `grove plant`.'));
      }
      process.exit(1);
    }

    // Check if it's the current tree
    const currentTree = await getCurrentTreeName(groveRoot);
    const isCurrent = currentTree === name;

    if (isCurrent && Object.keys(config.trees).length === 1) {
      if (spinner) spinner.fail('Cannot uproot the last tree in the grove');
      if (out.json) {
        printJson({ ok: false, error: 'Cannot uproot the last tree in the grove' });
      } else if (!out.quiet) {
        console.log(chalk.gray('At least one tree must remain.'));
      }
      process.exit(1);
    }

    // Stop preview if running
    if (await isPreviewRunning(name, groveRoot)) {
      if (spinner) spinner.text = 'Stopping preview server...';
      await stopPreview(name, groveRoot);
    }

    // Remove git worktree
    if (spinner) spinner.text = 'Removing worktree...';
    await removeWorktree(tree.path, { force: options.force }, config.repo);

    // Update config
    await updateConfig((c) => {
      const { [name]: _, ...remainingTrees } = c.trees;
      return {
        ...c,
        trees: remainingTrees,
        current: c.current === name ? null : c.current,
      };
    }, groveRoot);

    // If this was the current tree, update symlink to another tree
    if (isCurrent) {
      const remainingTrees = Object.keys(config.trees).filter((t) => t !== name);
      if (remainingTrees.length > 0) {
        const newCurrent = remainingTrees[0];
        const newTreePath = config.trees[newCurrent].path;
        switchedTo = newCurrent;

        // Update the symlink to point to the new tree's actual path
        const currentLinkPath = path.join(groveRoot, 'current');
        // Use lstat to check for symlink (pathExists follows symlinks)
        try {
          await fs.lstat(currentLinkPath);
          await fs.unlink(currentLinkPath);
        } catch {
          // Symlink doesn't exist, that's fine
        }
        // If the new tree is the main repo (same as cwd), use '.' as the symlink target
        const relativePath = path.relative(groveRoot, newTreePath) || '.';
        await fs.symlink(relativePath, currentLinkPath);

        await updateConfig((c) => ({
          ...c,
          current: newCurrent,
        }), groveRoot);
        if (spinner) spinner.succeed(`Uprooted '${name}', switched to '${newCurrent}'`);
      } else {
        switchedTo = null;
        await removeCurrentLink(groveRoot);
        if (spinner) spinner.succeed(`Uprooted '${name}'`);
      }
    } else {
      if (spinner) spinner.succeed(`Uprooted '${name}'`);
    }

    if (out.json) {
      printJson({
        ok: true,
        removed: { name, ...tree },
        switchedTo,
      });
      return;
    }

    if (out.quiet) {
      return;
    }

    console.log('');
    console.log(chalk.gray(`  Branch: ${tree.branch}`));
    console.log(chalk.gray(`  Path:   ${tree.path} (removed)`));
  } catch (error) {
    if (spinner) spinner.fail('Failed to uproot tree');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk.red(message));
      if (!options.force && !out.quiet) {
        console.log('');
        console.log(chalk.yellow('Tip: Use --force to force removal'));
      }
    }
    process.exit(1);
  }
}
