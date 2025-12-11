import chalk from 'chalk';
import ora from 'ora';
import { readConfig, assertValidTreeName } from '../lib/config.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';
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
  const out = getOutputOptions();

  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);

    // Validate tree exists
    if (!config.trees[name]) {
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      } else if (!out.quiet) {
        console.log(chalk.red(`Tree '${name}' not found`));
        console.log('');
        console.log(chalk.gray('Available trees:'));
        for (const treeName of Object.keys(config.trees)) {
          console.log(chalk.gray(`  - ${treeName}`));
        }
      }
      process.exit(1);
    }

    // Determine which editor to use
    let editor: Editor;

    if (options.editor) {
      const supported = getSupportedEditors();
      if (!supported.includes(options.editor as Editor)) {
        if (out.json) {
          printJson({ ok: false, error: `Unknown editor: ${options.editor}` });
        } else if (!out.quiet) {
          console.log(chalk.red(`Unknown editor: ${options.editor}`));
          console.log(chalk.gray(`Supported: ${supported.join(', ')}`));
        }
        process.exit(1);
      }
      editor = options.editor as Editor;
    } else {
      // Auto-detect available editor (prefer cursor for AI workflows)
      const available = await detectAvailableEditors();

      if (available.length === 0) {
        if (out.json) {
          printJson({ ok: false, error: 'No supported editors found' });
        } else if (!out.quiet) {
          console.log(chalk.red('No supported editors found'));
          console.log(chalk.gray('Install one of: cursor, code (VS Code), claude, zed'));
        }
        process.exit(1);
      }

      // Preference order for AI coding
      const preferenceOrder: Editor[] = ['cursor', 'claude', 'code', 'zed'];
      editor = preferenceOrder.find((e) => available.includes(e)) || available[0];
    }

    const spinner = shouldUseSpinner(out)
      ? ora(`Opening '${name}' in ${getEditorName(editor)}...`).start()
      : null;

    await openInEditor(name, editor, cwd);

    const treePath = config.trees[name].path;
    if (spinner) spinner.succeed(`Opened '${name}' in ${getEditorName(editor)}`);

    if (out.json) {
      printJson({
        ok: true,
        opened: { name, path: treePath, branch: config.trees[name].branch },
        editor,
      });
      return;
    }

    if (out.quiet) {
      return;
    }

    console.log('');
    console.log(chalk.gray(`  Path: ${treePath}`));
    console.log(chalk.gray(`  Branch: ${config.trees[name].branch}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}
