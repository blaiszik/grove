import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { readConfig, updateConfig, getTreePath, getGroveDir } from '../lib/config.js';
import {
  branchExists,
  remoteBranchExists,
  createWorktree,
  fetchBranch,
} from '../lib/git.js';
import {
  detectPackageManager,
  installDependencies,
  canSymlinkNodeModules,
  symlinkNodeModules,
  hasNodeModules,
} from '../lib/deps.js';
import { createCurrentLink } from '../lib/symlink.js';
import { copyEditorConfigs } from '../lib/editor.js';

interface PlantOptions {
  new?: boolean;
  base?: string;
  install?: boolean;
  switch?: boolean;
}

export async function plant(
  branch: string,
  name: string | undefined,
  options: PlantOptions
): Promise<void> {
  const cwd = process.cwd();
  const treeName = name || branch.replace(/\//g, '-');

  const spinner = ora(`Planting tree '${treeName}'...`).start();

  try {
    const config = await readConfig(cwd);

    // Check if tree already exists
    if (config.trees[treeName]) {
      spinner.fail(`Tree '${treeName}' already exists`);
      console.log(chalk.gray(`Use 'grove tend ${treeName}' to switch to it.`));
      process.exit(1);
    }

    // Determine if we need to create a new branch
    const localExists = await branchExists(branch, config.repo);
    const remoteExists = await remoteBranchExists(branch, config.repo);
    const shouldCreate = options.new || (!localExists && !remoteExists);

    if (!localExists && remoteExists && !options.new) {
      spinner.text = `Fetching branch '${branch}' from origin...`;
      await fetchBranch(branch, config.repo);
    }

    // Create the worktree
    spinner.text = `Creating worktree for '${branch}'...`;
    const treePath = getTreePath(treeName, cwd);

    await createWorktree(
      treePath,
      branch,
      {
        createBranch: shouldCreate,
        baseBranch: options.base,
      },
      config.repo
    );

    // Copy editor/AI tool configurations from repo root
    spinner.text = 'Copying editor configurations...';
    const copiedConfigs = await copyEditorConfigs(config.repo, treePath);
    if (copiedConfigs.length > 0) {
      spinner.text = `Copied: ${copiedConfigs.join(', ')}`;
    }

    // Handle dependencies
    const shouldInstall = options.install !== false; // Default to true
    if (shouldInstall) {
      spinner.text = 'Setting up dependencies...';

      // Find an existing tree with node_modules
      let sourceTree: string | null = null;
      for (const [existingName, tree] of Object.entries(config.trees)) {
        if (await hasNodeModules(tree.path)) {
          sourceTree = existingName;
          break;
        }
      }

      const manager = await detectPackageManager(treePath);

      if (manager === 'pnpm') {
        // pnpm: always install with shared store
        spinner.text = 'Installing dependencies with shared pnpm store...';
        await installDependencies(manager, treePath, {
          useSharedStore: true,
          groveDir: cwd,
        });
      } else if (sourceTree) {
        // npm/yarn: try to symlink if lockfiles match
        const sourceTreePath = config.trees[sourceTree].path;
        const canSymlink = await canSymlinkNodeModules(sourceTreePath, treePath);

        if (canSymlink) {
          spinner.text = `Symlinking node_modules from '${sourceTree}'...`;
          await symlinkNodeModules(sourceTreePath, treePath);
        } else {
          spinner.text = 'Installing dependencies...';
          await installDependencies(manager, treePath);
        }
      } else {
        // No existing tree with node_modules, fresh install
        spinner.text = 'Installing dependencies...';
        await installDependencies(manager, treePath);
      }
    }

    // Register the tree
    await updateConfig((c) => ({
      ...c,
      trees: {
        ...c.trees,
        [treeName]: {
          branch,
          path: treePath,
          created: new Date().toISOString(),
        },
      },
    }), cwd);

    // Optionally switch to the new tree
    if (options.switch) {
      await createCurrentLink(treeName, cwd);
      await updateConfig((c) => ({
        ...c,
        current: treeName,
      }), cwd);
    }

    spinner.succeed(`Planted tree '${treeName}'`);

    console.log('');
    console.log(chalk.green('Tree details:'));
    console.log(chalk.gray(`  Name:   ${treeName}`));
    console.log(chalk.gray(`  Branch: ${branch}`));
    console.log(chalk.gray(`  Path:   ${treePath}`));
    console.log('');

    if (copiedConfigs.length > 0) {
      console.log(chalk.blue('Copied configs:'));
      console.log(chalk.gray(`  ${copiedConfigs.join(', ')}`));
      console.log('');
    }

    if (options.switch) {
      console.log(chalk.cyan(`Switched to '${treeName}'`));
    } else {
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.gray(`  grove open ${treeName}        Open in Cursor/VS Code`));
      console.log(chalk.gray(`  grove spawn ${treeName}       Start Claude Code session`));
      console.log(chalk.gray(`  grove tend ${treeName}        Switch current symlink`));
    }
  } catch (error) {
    spinner.fail('Failed to plant tree');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
