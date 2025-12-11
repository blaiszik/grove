import chalk from 'chalk';
import ora from 'ora';
import { readConfig, getTreePath } from '../lib/config.js';
import {
  Editor,
  openInEditor,
  detectAvailableEditors,
  getEditorName,
  getSupportedEditors,
} from '../lib/editor.js';

interface OpenOptions {
  editor?: string;
}

export async function open(name: string, options: OpenOptions): Promise<void> {
  const cwd = process.cwd();

  try {
    const config = await readConfig(cwd);

    // Validate tree exists
    if (!config.trees[name]) {
      console.log(chalk.red(`Tree '${name}' not found`));
      console.log('');
      console.log(chalk.gray('Available trees:'));
      for (const treeName of Object.keys(config.trees)) {
        console.log(chalk.gray(`  - ${treeName}`));
      }
      process.exit(1);
    }

    // Determine which editor to use
    let editor: Editor;

    if (options.editor) {
      const supported = getSupportedEditors();
      if (!supported.includes(options.editor as Editor)) {
        console.log(chalk.red(`Unknown editor: ${options.editor}`));
        console.log(chalk.gray(`Supported: ${supported.join(', ')}`));
        process.exit(1);
      }
      editor = options.editor as Editor;
    } else {
      // Auto-detect available editor (prefer cursor for AI workflows)
      const available = await detectAvailableEditors();

      if (available.length === 0) {
        console.log(chalk.red('No supported editors found'));
        console.log(chalk.gray('Install one of: cursor, code (VS Code), claude, zed'));
        process.exit(1);
      }

      // Preference order for AI coding
      const preferenceOrder: Editor[] = ['cursor', 'claude', 'code', 'zed'];
      editor = preferenceOrder.find((e) => available.includes(e)) || available[0];
    }

    const spinner = ora(`Opening '${name}' in ${getEditorName(editor)}...`).start();

    await openInEditor(name, editor, cwd);

    const treePath = getTreePath(name, cwd);
    spinner.succeed(`Opened '${name}' in ${getEditorName(editor)}`);

    console.log('');
    console.log(chalk.gray(`  Path: ${treePath}`));
    console.log(chalk.gray(`  Branch: ${config.trees[name].branch}`));
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
