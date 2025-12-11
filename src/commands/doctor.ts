import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import {
  readConfig,
  updateConfig,
  resolveGroveRoot,
} from '../lib/config.js';
import { listWorktrees } from '../lib/git.js';
import {
  isSymlinkValid,
  getCurrentTreeName,
  createCurrentLink,
  removeCurrentLink,
} from '../lib/symlink.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

interface DoctorOptions {
  fix?: boolean;
}

export async function doctor(options: DoctorOptions): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora('Checking grove health...').start() : null;

  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);

    const worktrees = await listWorktrees(config.repo);
    const actualPaths = new Set(worktrees.map((wt) => path.resolve(wt.path)));

    const missingTrees = Object.entries(config.trees)
      .filter(([name]) => name !== 'main')
      .filter(([, tree]) => !actualPaths.has(path.resolve(tree.path)))
      .map(([name, tree]) => ({ name, path: tree.path }));

    const previewEntries = Object.entries(config.previews);
    const stalePreviews = previewEntries.filter(([, preview]) => {
      try {
        process.kill(preview.pid, 0);
        return false;
      } catch {
        return true;
      }
    }).map(([name, preview]) => ({ name, pid: preview.pid, port: preview.port }));

    const symlinkOk = await isSymlinkValid(groveRoot);
    const symlinkCurrent = await getCurrentTreeName(groveRoot);
    const configCurrent = config.current;

    const issues: Array<Record<string, unknown>> = [];
    if (missingTrees.length > 0) {
      issues.push({ type: 'missing_trees', trees: missingTrees });
    }
    if (stalePreviews.length > 0) {
      issues.push({ type: 'stale_previews', previews: stalePreviews });
    }
    if (!symlinkOk) {
      issues.push({ type: 'invalid_current_symlink' });
    }
    if (configCurrent && symlinkCurrent && configCurrent !== symlinkCurrent) {
      issues.push({ type: 'current_mismatch', configCurrent, symlinkCurrent });
    }
    if (configCurrent && !config.trees[configCurrent]) {
      issues.push({ type: 'current_missing', current: configCurrent });
    }

    if (options.fix) {
      const missingNames = missingTrees.map((t) => t.name);
      const remainingTrees = { ...config.trees };
      for (const name of missingNames) {
        delete remainingTrees[name];
      }

      const remainingPreviews = { ...config.previews };
      for (const name of missingNames) {
        delete remainingPreviews[name];
      }
      for (const { name } of stalePreviews) {
        delete remainingPreviews[name];
      }

      const candidates = [
        configCurrent,
        symlinkCurrent,
        remainingTrees['main'] ? 'main' : null,
        Object.keys(remainingTrees)[0] ?? null,
      ].filter((c): c is string => !!c && !!remainingTrees[c]);

      const newCurrent = candidates[0] ?? null;

      await updateConfig((c) => ({
        ...c,
        trees: remainingTrees,
        previews: remainingPreviews,
        current: newCurrent,
      }), groveRoot);

      if (newCurrent) {
        await createCurrentLink(newCurrent, groveRoot);
      } else {
        await removeCurrentLink(groveRoot);
      }

      if (spinner) spinner.succeed('Grove repaired');

      if (out.json) {
        printJson({
          ok: true,
          fixed: true,
          prunedTrees: missingNames,
          prunedPreviews: stalePreviews.map((p) => p.name),
          current: newCurrent,
        });
        return;
      }

      if (out.quiet) return;

      console.log(chalk.green('Grove repaired.'));
      if (missingNames.length > 0) {
        console.log(chalk.gray(`Pruned trees: ${missingNames.join(', ')}`));
      }
      if (stalePreviews.length > 0) {
        console.log(chalk.gray(`Pruned previews: ${stalePreviews.map((p) => p.name).join(', ')}`));
      }
      if (newCurrent) {
        console.log(chalk.gray(`Current tree: ${newCurrent}`));
      }
      return;
    }

    if (spinner) spinner.succeed('Doctor complete');

    if (out.json) {
      printJson({ ok: issues.length === 0, issues });
      return;
    }

    if (out.quiet) {
      if (issues.length > 0) process.exit(1);
      return;
    }

    if (issues.length === 0) {
      console.log(chalk.green('All good. No issues found.'));
      return;
    }

    console.log(chalk.yellow('Issues found:'));
    for (const issue of issues) {
      console.log(chalk.gray(`- ${issue.type}`));
    }
    console.log('');
    console.log(chalk.gray('Run `grove doctor --fix` to repair.'));
    process.exit(1);
  } catch (error) {
    if (spinner) spinner.fail('Doctor failed');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}

