import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { execa } from 'execa';
import {
  assertValidTreeName,
  getTreesDir,
  readConfig,
  resolveGroveRoot,
} from '../lib/config.js';
import {
  branchExists,
  createWorktree,
  fetchBranch,
  removeWorktree,
} from '../lib/git.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';
import type { TreeInfo } from '../types.js';

interface MergeAssistOptions {
  strategy?: string;
  apply?: boolean;
  keepTemp?: boolean;
  fetch?: boolean;
}

interface ConflictSummary {
  conflicts: string[];
  stagingPath: string;
  stagingBranch: string | null;
}

export async function mergeAssist(
  sourceName: string,
  targetName: string,
  options: MergeAssistOptions
): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora('Preparing merge assist...').start() : null;

  const strategy = options.strategy?.toLowerCase() === 'rebase' ? 'rebase' : 'merge';
  const shouldFetch = options.fetch !== false;
  let groveRoot: string | null = null;
  let config: Awaited<ReturnType<typeof readConfig>> | null = null;
  let sourceTree: TreeInfo | null = null;
  let targetTree: TreeInfo | null = null;
  let targetBranch: string | null = null;
  let stagingDir: string | null = null;
  let stagingBranch: string | null = null;
  let stagingCreated = false;
  let keepTemp = options.keepTemp ?? false;
  let conflictSummary: ConflictSummary | null = null;

  try {
    assertValidTreeName(sourceName);
    groveRoot = await resolveGroveRoot(cwd);
    config = await readConfig(groveRoot);

    sourceTree = config.trees[sourceName];
    if (!sourceTree) {
      throw new Error(`Tree '${sourceName}' not found. Run 'grove list' to see available trees.`);
    }

    await ensureTreePathExists(sourceTree.path, sourceName);

    if (sourceName === targetName) {
      throw new Error('Source and target must be different.');
    }

    targetTree = config.trees[targetName] ?? null;
    if (targetTree) {
      targetBranch = targetTree.branch;
    } else {
      targetBranch = targetName;
    }

    if (!targetBranch) {
      throw new Error(`Unable to resolve target '${targetName}'.`);
    }

    if (options.apply) {
      if (spinner) spinner.text = 'Checking source tree status...';
      const clean = await isWorkingTreeClean(sourceTree.path);
      if (!clean) {
        throw new Error(
          `Tree '${sourceName}' has uncommitted changes. Commit or stash before using --apply.`
        );
      }
    }

    const repoDir = config.repo;

    if (shouldFetch) {
      if (spinner) spinner.text = `Fetching latest '${targetBranch}'...`;
      await fetchBranchSafe(targetBranch, repoDir, spinner, out);
    }

    const targetExists = await branchExists(targetBranch, repoDir);
    if (!targetExists) {
      throw new Error(`Branch '${targetBranch}' not found. Create it or specify a tree name.`);
    }

    const stagingBase = path.join(getTreesDir(groveRoot), '.merge-assist');
    await fs.ensureDir(stagingBase);
    const timestamp = Date.now().toString(36);
    const stagingName = `${sanitizeForPath(sourceName)}-onto-${sanitizeForPath(targetBranch)}-${timestamp}`;
    stagingDir = path.join(stagingBase, stagingName);
    stagingBranch = `grove/merge/${sanitizeForBranch(
      `${sourceTree.branch}-onto-${targetBranch}-${timestamp}`
    )}`;

    if (spinner) spinner.text = 'Creating staging worktree...';
    await createWorktree(
      stagingDir,
      stagingBranch,
      {
        createBranch: true,
        baseBranch: sourceTree.branch,
      },
      repoDir
    );
    stagingCreated = true;

    if (spinner) spinner.text = `${capitalize(strategy)}ing '${sourceTree.branch}' with '${targetBranch}'...`;
    await runIntegration(strategy, targetBranch, stagingDir);

    if (spinner) spinner.text = 'Recording result...';
    const resultCommit = await getHeadCommit(stagingDir);

    if (options.apply) {
      if (spinner) spinner.text = 'Applying result back to source tree...';
      await applyResultToSource(sourceTree.path, sourceTree.branch, resultCommit, repoDir);
    }

    if (!keepTemp) {
      if (spinner) spinner.text = 'Cleaning up staging worktree...';
      await cleanupTempWorktree(repoDir, stagingDir, stagingBranch);
      stagingDir = null;
      stagingBranch = null;
    }

    if (spinner) spinner.succeed('Merge assist completed');

    if (out.json) {
      printJson({
        ok: true,
        strategy,
        applied: !!options.apply,
        source: {
          name: sourceName,
          branch: sourceTree.branch,
          path: sourceTree.path,
        },
        target: {
          input: targetName,
          branch: targetBranch,
          tree: targetTree ? targetName : null,
        },
        staging: stagingDir
          ? { kept: true, path: stagingDir, branch: stagingBranch }
          : { kept: false },
      });
      return;
    }

    if (!out.quiet) {
      console.log('');
      console.log(chalk.green('Merge assist complete!'));
      if (options.apply) {
        console.log(chalk.gray(`  Tree '${sourceName}' now includes '${targetBranch}'.`));
      } else if (stagingDir) {
        console.log(chalk.gray(`  Review result in staging worktree: ${stagingDir}`));
      } else {
        console.log(chalk.gray('  Staging worktree removed.'));
      }
      console.log('');
    }
  } catch (error) {
    if (spinner) spinner.fail('Merge assist failed');

    if (conflictSummary === null && stagingDir) {
      conflictSummary = await summarizeConflicts(stagingDir, stagingBranch);
      if (conflictSummary) {
        keepTemp = true;
      }
    }

    if (stagingCreated && !keepTemp && groveRoot && config && stagingDir) {
      await cleanupTempWorktree(config.repo, stagingDir, stagingBranch);
    }

    const message = formatErrorMessage(error);
    if (out.json) {
      printJson({
        ok: false,
        error: message,
        strategy,
        source: sourceTree
          ? { name: sourceName, branch: sourceTree.branch, path: sourceTree.path }
          : null,
        target: targetBranch ? { input: targetName, branch: targetBranch } : null,
        staging: stagingDir
          ? { kept: true, path: stagingDir, branch: stagingBranch }
          : null,
        conflicts: conflictSummary?.conflicts ?? [],
      });
    } else if (!out.quiet) {
      console.error(chalk.red(message));
      if (conflictSummary?.conflicts?.length) {
        console.log('');
        console.log(chalk.yellow('Conflicts detected:'));
        conflictSummary.conflicts.slice(0, 10).forEach((line) => {
          console.log(chalk.gray(`  ${line}`));
        });
        if (conflictSummary.conflicts.length > 10) {
          console.log(chalk.gray('  ...'));
        }
        console.log('');
      }
      if (stagingDir) {
        console.log(chalk.cyan('Resolve conflicts in the staging worktree:'));
        console.log(chalk.gray(`  cd ${stagingDir}`));
        console.log(
          chalk.gray(
            strategy === 'rebase'
              ? '  git status && git rebase --continue'
              : '  git status && git merge --continue'
          )
        );
        console.log(chalk.gray('  (run again when clean or push result back manually)'));
      }
    }

    process.exit(1);
  }
}

async function ensureTreePathExists(treePath: string, treeName: string): Promise<void> {
  if (!(await fs.pathExists(treePath))) {
    throw new Error(
      `Tree '${treeName}' points to '${treePath}', but it does not exist on disk. Run 'grove doctor --fix'.`
    );
  }
}

async function isWorkingTreeClean(dir: string): Promise<boolean> {
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: dir });
  return stdout.trim().length === 0;
}

async function fetchBranchSafe(
  branch: string,
  repoDir: string,
  spinner: Ora | null,
  out: ReturnType<typeof getOutputOptions>
): Promise<void> {
  try {
    await fetchBranch(branch, repoDir);
  } catch (error) {
    const message = formatErrorMessage(error);
    if (spinner) {
      spinner.text = `Fetch skipped for '${branch}' (${message})`;
    } else if (!out.quiet && !out.json) {
      console.log(chalk.yellow(`Warning: could not fetch origin/${branch}: ${message}`));
    }
  }
}

async function runIntegration(strategy: 'merge' | 'rebase', targetBranch: string, cwd: string): Promise<void> {
  const args = strategy === 'rebase' ? ['rebase', targetBranch] : ['merge', targetBranch];
  try {
    await execa('git', args, { cwd });
  } catch (error) {
    throw error;
  }
}

async function getHeadCommit(cwd: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', 'HEAD'], { cwd });
  return stdout.trim();
}

async function applyResultToSource(
  treePath: string,
  branch: string,
  commit: string,
  repoDir: string
): Promise<void> {
  await execa('git', ['update-ref', `refs/heads/${branch}`, commit], { cwd: repoDir });
  await execa('git', ['checkout', branch], { cwd: treePath });
  await execa('git', ['reset', '--hard', commit], { cwd: treePath });
}

async function cleanupTempWorktree(
  repoDir: string,
  worktreePath: string,
  tempBranch: string | null
): Promise<void> {
  try {
    await removeWorktree(worktreePath, { force: true }, repoDir);
  } catch {
    if (await fs.pathExists(worktreePath)) {
      await fs.remove(worktreePath);
    }
  }

  if (tempBranch) {
    try {
      await execa('git', ['branch', '-D', tempBranch], { cwd: repoDir });
    } catch {
      // ignore
    }
  }
}

function sanitizeForPath(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-');
}

function sanitizeForBranch(value: string): string {
  return value
    .replace(/[^A-Za-z0-9/_-]/g, '-')
    .replace(/\/+/g, '/');
}

async function summarizeConflicts(
  stagingPath: string,
  stagingBranch: string | null
): Promise<ConflictSummary | null> {
  try {
    const { stdout } = await execa('git', ['status', '--short'], { cwd: stagingPath });
    const conflictLines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(AA|DD|UU|UD|DU|UA|AU)/.test(line));
    if (conflictLines.length === 0) {
      return null;
    }
    return {
      conflicts: conflictLines,
      stagingPath,
      stagingBranch,
    };
  } catch {
    return null;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
