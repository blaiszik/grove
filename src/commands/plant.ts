import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { readConfig, updateConfig, getTreePath, getGroveDir, resolveGroveRoot, assertValidTreeName } from '../lib/config.js';
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
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

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
  const out = getOutputOptions();
  const treeName = name || branch.replace(/\//g, '-');

  const spinner = shouldUseSpinner(out) ? ora(`Planting tree '${treeName}'...`).start() : null;

  try {
    assertValidTreeName(treeName);
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);

    // Check if tree already exists
    if (config.trees[treeName]) {
      if (spinner) spinner.fail(`Tree '${treeName}' already exists`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${treeName}' already exists`, name: treeName });
      } else if (!out.quiet) {
        console.log(chalk.gray(`Use 'grove tend ${treeName}' to switch to it.`));
      }
      process.exit(1);
    }

    // Determine if we need to create a new branch
    const localExists = await branchExists(branch, config.repo);
    const remoteExists = await remoteBranchExists(branch, config.repo);
    const shouldCreate = options.new || (!localExists && !remoteExists);

    if (!localExists && remoteExists && !options.new) {
      if (spinner) spinner.text = `Fetching branch '${branch}' from origin...`;
      await fetchBranch(branch, config.repo);
    }

    // Create the worktree
    if (spinner) spinner.text = `Creating worktree for '${branch}'...`;
    const treePath = getTreePath(treeName, groveRoot);

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
    if (spinner) spinner.text = 'Copying editor configurations...';
    const copiedConfigs = await copyEditorConfigs(config.repo, treePath);
    if (copiedConfigs.length > 0) {
      if (spinner) spinner.text = `Copied: ${copiedConfigs.join(', ')}`;
    }

    // Handle dependencies
    const shouldInstall = options.install !== false; // Default to true
    if (shouldInstall) {
      if (spinner) spinner.text = 'Setting up dependencies...';

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
        if (spinner) spinner.text = 'Installing dependencies with shared pnpm store...';
        await installDependencies(manager, treePath, {
          useSharedStore: true,
          groveDir: groveRoot,
        });
      } else if (sourceTree) {
        // npm/yarn: try to symlink if lockfiles match
        const sourceTreePath = config.trees[sourceTree].path;
        const canSymlink = await canSymlinkNodeModules(sourceTreePath, treePath);

        if (canSymlink) {
          if (spinner) spinner.text = `Symlinking node_modules from '${sourceTree}'...`;
          await symlinkNodeModules(sourceTreePath, treePath);
        } else {
          if (spinner) spinner.text = 'Installing dependencies...';
          await installDependencies(manager, treePath);
        }
      } else {
        // No existing tree with node_modules, fresh install
        if (spinner) spinner.text = 'Installing dependencies...';
        await installDependencies(manager, treePath);
      }
    }

    // Register the tree
    const createdAt = new Date().toISOString();
    await updateConfig((c) => ({
      ...c,
      trees: {
        ...c.trees,
        [treeName]: {
          branch,
          path: treePath,
          created: createdAt,
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

    if (spinner) spinner.succeed(`Planted tree '${treeName}'`);

    if (out.json) {
      printJson({
        ok: true,
        tree: {
          name: treeName,
          branch,
          path: treePath,
          created: createdAt,
        },
        copiedConfigs,
        switched: !!options.switch,
      });
      return;
    }

    if (out.quiet) {
      return;
    }

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
    if (spinner) spinner.fail('Failed to plant tree');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}
