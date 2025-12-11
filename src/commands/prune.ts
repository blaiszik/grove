import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { readConfig, updateConfig, resolveGroveRoot } from '../lib/config.js';
import { listWorktrees } from '../lib/git.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

interface PruneOptions {
  dryRun?: boolean;
}

export async function prune(options: PruneOptions): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora('Pruning stale trees...').start() : null;

  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);

    const worktrees = await listWorktrees(config.repo);
    const actualPaths = new Set(worktrees.map((wt) => path.resolve(wt.path)));

    const staleTrees = Object.entries(config.trees)
      .filter(([name]) => name !== 'main')
      .filter(([, tree]) => !actualPaths.has(path.resolve(tree.path)))
      .map(([name]) => name);

    const stalePreviews = Object.keys(config.previews).filter((name) =>
      staleTrees.includes(name)
    );

    if (!options.dryRun && (staleTrees.length > 0 || stalePreviews.length > 0)) {
      await updateConfig((c) => {
        const remainingTrees = { ...c.trees };
        for (const name of staleTrees) {
          delete remainingTrees[name];
        }
        const remainingPreviews = { ...c.previews };
        for (const name of stalePreviews) {
          delete remainingPreviews[name];
        }

        const currentIsStale = c.current && staleTrees.includes(c.current);
        const current = currentIsStale ? (Object.keys(remainingTrees)[0] ?? null) : c.current;

        return {
          ...c,
          trees: remainingTrees,
          previews: remainingPreviews,
          current,
        };
      }, groveRoot);
    }

    if (spinner) spinner.succeed('Prune complete');

    if (out.json) {
      printJson({
        ok: true,
        dryRun: !!options.dryRun,
        prunedTrees: staleTrees,
        prunedPreviews: stalePreviews,
      });
      return;
    }

    if (out.quiet) {
      if (staleTrees.length > 0) {
        console.log(staleTrees.join('\n'));
      }
      return;
    }

    if (staleTrees.length === 0 && stalePreviews.length === 0) {
      console.log(chalk.gray('No stale trees or previews found.'));
      return;
    }

    console.log('');
    if (staleTrees.length > 0) {
      console.log(chalk.green(`Pruned trees: ${staleTrees.join(', ')}`));
    }
    if (stalePreviews.length > 0) {
      console.log(chalk.green(`Pruned previews: ${stalePreviews.join(', ')}`));
    }
    if (options.dryRun) {
      console.log(chalk.yellow('(dry run; no changes made)'));
    }
  } catch (error) {
    if (spinner) spinner.fail('Failed to prune trees');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}

