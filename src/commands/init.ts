import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  getGroveDir,
  getTreesDir,
  getSharedDir,
  groveExists,
  writeConfig,
  createDefaultConfig,
} from '../lib/config.js';
import { isGitRepo, getRepoRoot, getCurrentBranch, createWorktree } from '../lib/git.js';
import { detectPackageManager } from '../lib/deps.js';
import { detectFramework } from '../lib/framework.js';
import { createCurrentLink } from '../lib/symlink.js';
import { GROVE_DIR } from '../types.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

export async function init(): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();

  // Check if already initialized
  if (await groveExists(cwd)) {
    if (out.json) {
      printJson({ ok: true, alreadyInitialized: true });
      return;
    }
    if (!out.quiet) {
      console.log(chalk.yellow('Grove is already initialized in this directory.'));
    }
    return;
  }

  // Check if in a git repo
  if (!(await isGitRepo(cwd))) {
    if (out.json) {
      printJson({ ok: false, error: 'Not a git repository.' });
    } else {
      console.log(chalk.red('Error: Not a git repository.'));
      console.log(chalk.gray('Run this command from within a git repository.'));
    }
    process.exit(1);
  }

  const spinner = shouldUseSpinner(out) ? ora('Initializing grove...').start() : null;

  try {
    const repoRoot = await getRepoRoot(cwd);
    const currentBranch = await getCurrentBranch(cwd);
    const groveRoot = repoRoot;

    // Create directory structure
    const groveDir = getGroveDir(groveRoot);
    const treesDir = getTreesDir(groveRoot);
    const sharedDir = getSharedDir(groveRoot);

    await fs.ensureDir(groveDir);
    await fs.ensureDir(treesDir);
    await fs.ensureDir(sharedDir);

    // Detect project configuration
    if (spinner) spinner.text = 'Detecting project configuration...';
    const packageManager = await detectPackageManager(cwd);
    const framework = await detectFramework(cwd);

    // Create initial config
    const config = createDefaultConfig(repoRoot);
    config.packageManager = packageManager;
    config.framework = framework;

    // Register the main repo directory as the "main" tree
    // We don't create a worktree here because the current branch is already checked out
    // in the main repo. Users can create worktrees for other branches with `grove plant`.
    const mainTreeName = 'main';
    config.trees[mainTreeName] = {
      branch: currentBranch,
      path: repoRoot, // Point to the actual repo, not a worktree
      created: new Date().toISOString(),
    };
    config.current = mainTreeName;

    // Save config
    await writeConfig(config, groveRoot);

    // Create current symlink pointing to the repo root
    // Using relative path for the symlink
    const currentLinkPath = path.join(groveRoot, 'current');
    if (await fs.pathExists(currentLinkPath)) {
      await fs.remove(currentLinkPath);
    }
    await fs.symlink('.', currentLinkPath);

    // Add .grove to .gitignore if not already present
    const gitignorePath = path.join(groveRoot, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      const gitignore = await fs.readFile(gitignorePath, 'utf-8');
      if (!gitignore.includes(GROVE_DIR)) {
        await fs.appendFile(gitignorePath, `\n# Grove worktree manager\n${GROVE_DIR}/\ncurrent\n`);
      }
    } else {
      await fs.writeFile(gitignorePath, `# Grove worktree manager\n${GROVE_DIR}/\ncurrent\n`);
    }

    if (spinner) spinner.succeed('Grove initialized!');

    if (out.json) {
      printJson({
        ok: true,
        repo: repoRoot,
        groveDir,
        treesDir,
        sharedDir,
        packageManager,
        framework,
        current: mainTreeName,
      });
      return;
    }

    if (!out.quiet) {
      console.log('');
      console.log(chalk.green('Created:'));
      console.log(chalk.gray(`  ${GROVE_DIR}/              Configuration directory`));
      console.log(chalk.gray(`  ${GROVE_DIR}/trees/        Worktree storage`));
      console.log(chalk.gray(`  current              Symlink to active tree`));
      console.log('');
      console.log(chalk.blue('Detected:'));
      console.log(chalk.gray(`  Package manager: ${packageManager}`));
      console.log(chalk.gray(`  Framework: ${framework}`));
      console.log('');
      console.log(chalk.cyan('Next steps:'));
      console.log(chalk.gray(`  grove plant <branch>     Create a new worktree`));
      console.log(chalk.gray(`  grove list               List all trees`));
      console.log(chalk.gray(`  grove tend <name>        Switch to a tree`));
    }
  } catch (error) {
    if (spinner) spinner.fail('Failed to initialize grove');
    if (out.json) {
      printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } else {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
    process.exit(1);
  }
}
