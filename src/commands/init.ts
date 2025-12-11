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

export async function init(): Promise<void> {
  const cwd = process.cwd();

  // Check if already initialized
  if (await groveExists(cwd)) {
    console.log(chalk.yellow('Grove is already initialized in this directory.'));
    return;
  }

  // Check if in a git repo
  if (!(await isGitRepo(cwd))) {
    console.log(chalk.red('Error: Not a git repository.'));
    console.log(chalk.gray('Run this command from within a git repository.'));
    process.exit(1);
  }

  const spinner = ora('Initializing grove...').start();

  try {
    const repoRoot = await getRepoRoot(cwd);
    const currentBranch = await getCurrentBranch(cwd);

    // Create directory structure
    const groveDir = getGroveDir(cwd);
    const treesDir = getTreesDir(cwd);
    const sharedDir = getSharedDir(cwd);

    await fs.ensureDir(groveDir);
    await fs.ensureDir(treesDir);
    await fs.ensureDir(sharedDir);

    // Detect project configuration
    spinner.text = 'Detecting project configuration...';
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
    await writeConfig(config, cwd);

    // Create current symlink pointing to the repo root
    // Using relative path for the symlink
    const currentLinkPath = path.join(cwd, 'current');
    if (await fs.pathExists(currentLinkPath)) {
      await fs.remove(currentLinkPath);
    }
    await fs.symlink('.', currentLinkPath);

    // Add .grove to .gitignore if not already present
    const gitignorePath = path.join(cwd, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      const gitignore = await fs.readFile(gitignorePath, 'utf-8');
      if (!gitignore.includes(GROVE_DIR)) {
        await fs.appendFile(gitignorePath, `\n# Grove worktree manager\n${GROVE_DIR}/\ncurrent\n`);
      }
    } else {
      await fs.writeFile(gitignorePath, `# Grove worktree manager\n${GROVE_DIR}/\ncurrent\n`);
    }

    spinner.succeed('Grove initialized!');

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
  } catch (error) {
    spinner.fail('Failed to initialize grove');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
