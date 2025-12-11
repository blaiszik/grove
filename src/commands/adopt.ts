import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { readConfig, updateConfig, resolveGroveRoot, assertValidTreeName } from '../lib/config.js';
import { listWorktrees } from '../lib/git.js';
import { createCurrentLink } from '../lib/symlink.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

interface AdoptOptions {
  switch?: boolean;
}

export async function adopt(
  worktreePath: string,
  name: string | undefined,
  options: AdoptOptions
): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora(`Adopting worktree...`).start() : null;

  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);

    const targetAbs = path.resolve(cwd, worktreePath);
    const worktrees = await listWorktrees(config.repo);
    const match = worktrees.find((wt) => path.resolve(wt.path) === targetAbs);

    if (!match) {
      if (spinner) spinner.fail('Worktree not found');
      if (out.json) {
        printJson({ ok: false, error: `No git worktree found at ${targetAbs}` });
      } else if (!out.quiet) {
        console.error(chalk.red(`No git worktree found at ${targetAbs}`));
      }
      process.exit(1);
    }

    const derivedName = match.branch ? match.branch.replace(/\//g, '-') : undefined;
    const treeName = name || derivedName;

    if (!treeName) {
      if (spinner) spinner.fail('Name required');
      if (out.json) {
        printJson({ ok: false, error: 'Detached worktree requires an explicit name' });
      } else if (!out.quiet) {
        console.error(chalk.red('Detached worktree requires an explicit name.'));
      }
      process.exit(1);
    }

    assertValidTreeName(treeName);

    if (config.trees[treeName]) {
      if (spinner) spinner.fail(`Tree '${treeName}' already exists`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${treeName}' already exists` });
      }
      process.exit(1);
    }

    const duplicatePath = Object.values(config.trees).some(
      (t) => path.resolve(t.path) === targetAbs
    );
    if (duplicatePath) {
      if (spinner) spinner.fail('Worktree already adopted');
      if (out.json) {
        printJson({ ok: false, error: `Worktree at ${targetAbs} is already adopted` });
      }
      process.exit(1);
    }

    const createdAt = new Date().toISOString();
    const storedBranch = match.branch ?? match.head;

    await updateConfig((c) => ({
      ...c,
      trees: {
        ...c.trees,
        [treeName]: {
          branch: storedBranch,
          path: targetAbs,
          created: createdAt,
        },
      },
    }), groveRoot);

    if (options.switch) {
      await createCurrentLink(treeName, groveRoot);
      await updateConfig((c) => ({ ...c, current: treeName }), groveRoot);
    }

    if (spinner) spinner.succeed(`Adopted '${treeName}'`);

    if (out.json) {
      printJson({
        ok: true,
        adopted: { name: treeName, branch: storedBranch, path: targetAbs, created: createdAt },
        switched: !!options.switch,
      });
      return;
    }

    if (out.quiet) return;

    console.log('');
    console.log(chalk.green('Adopted tree:'));
    console.log(chalk.gray(`  Name:   ${treeName}`));
    console.log(chalk.gray(`  Branch: ${storedBranch}`));
    console.log(chalk.gray(`  Path:   ${targetAbs}`));
    if (options.switch) {
      console.log('');
      console.log(chalk.cyan(`Switched to '${treeName}'`));
    }
  } catch (error) {
    if (spinner) spinner.fail('Failed to adopt worktree');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}

