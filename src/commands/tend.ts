import chalk from 'chalk';
import ora from 'ora';
import { readConfig, updateConfig, assertValidTreeName } from '../lib/config.js';
import { createCurrentLink, getCurrentTreeName } from '../lib/symlink.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

export async function tend(name: string): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora(`Switching to '${name}'...`).start() : null;

  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);

    // Check if tree exists
    if (!config.trees[name]) {
      if (spinner) spinner.fail(`Tree '${name}' not found`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      } else if (!out.quiet) {
        console.log('');
        console.log(chalk.gray('Available trees:'));
        for (const treeName of Object.keys(config.trees)) {
          console.log(chalk.gray(`  - ${treeName}`));
        }
      }
      process.exit(1);
    }

    const currentTree = await getCurrentTreeName(cwd);
    if (currentTree === name) {
      if (spinner) spinner.info(`Already on '${name}'`);
      if (out.json) {
        printJson({ ok: true, alreadyCurrent: true, current: name });
      }
      return;
    }

    // Update symlink
    await createCurrentLink(name, cwd);

    // Update config
    await updateConfig((c) => ({
      ...c,
      current: name,
    }), cwd);

    const tree = config.trees[name];
    if (spinner) spinner.succeed(`Now tending '${name}'`);

    if (out.json) {
      printJson({ ok: true, current: name, tree });
      return;
    }

    if (out.quiet) {
      return;
    }

    console.log('');
    console.log(chalk.gray(`  Branch: ${tree.branch}`));
    console.log(chalk.gray(`  Path:   ${tree.path}`));
    console.log('');
    console.log(chalk.cyan('The `current` symlink now points to this tree.'));
  } catch (error) {
    if (spinner) spinner.fail('Failed to switch tree');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}
