import chalk from 'chalk';
import ora from 'ora';
import { readConfig } from '../lib/config.js';
import {
  startPreview as startPreviewServer,
  stopPreview as stopPreviewServer,
  stopAllPreviews,
  isPreviewRunning,
} from '../lib/preview.js';

interface PreviewOptions {
  dev?: boolean;
  build?: boolean;
  port?: number;
}

export async function preview(
  action: string,
  name: string | undefined,
  options: PreviewOptions
): Promise<void> {
  const cwd = process.cwd();

  // Handle 'stop' action
  if (action === 'stop') {
    if (name) {
      await stopTree(name, cwd);
    } else {
      await stopAll(cwd);
    }
    return;
  }

  // Otherwise, action is the tree name to preview
  const treeName = action;
  await startTree(treeName, options, cwd);
}

async function startTree(
  name: string,
  options: PreviewOptions,
  cwd: string
): Promise<void> {
  const spinner = ora(`Starting preview for '${name}'...`).start();

  try {
    const config = await readConfig(cwd);

    if (!config.trees[name]) {
      spinner.fail(`Tree '${name}' not found`);
      process.exit(1);
    }

    // Check if already running
    if (await isPreviewRunning(name, cwd)) {
      const preview = config.previews[name];
      spinner.info(`Preview for '${name}' is already running on port ${preview.port}`);
      console.log('');
      console.log(chalk.cyan(`  http://localhost:${preview.port}`));
      return;
    }

    const mode = options.build ? 'build' : 'dev';
    spinner.text = mode === 'build' ? 'Building and starting server...' : 'Starting dev server...';

    const previewInfo = await startPreviewServer(name, mode, cwd);

    spinner.succeed(`Preview started for '${name}'`);

    console.log('');
    console.log(chalk.green('Server running:'));
    console.log(chalk.cyan(`  http://localhost:${previewInfo.port}`));
    console.log('');
    console.log(chalk.gray(`Mode: ${mode}`));
    console.log(chalk.gray(`PID: ${previewInfo.pid}`));
    console.log('');
    console.log(chalk.yellow('Press Ctrl+C to stop the server'));
  } catch (error) {
    spinner.fail('Failed to start preview');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

async function stopTree(name: string, cwd: string): Promise<void> {
  const spinner = ora(`Stopping preview for '${name}'...`).start();

  try {
    if (!(await isPreviewRunning(name, cwd))) {
      spinner.info(`No preview running for '${name}'`);
      return;
    }

    await stopPreviewServer(name, cwd);
    spinner.succeed(`Stopped preview for '${name}'`);
  } catch (error) {
    spinner.fail('Failed to stop preview');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

async function stopAll(cwd: string): Promise<void> {
  const spinner = ora('Stopping all previews...').start();

  try {
    const config = await readConfig(cwd);
    const runningCount = Object.keys(config.previews).length;

    if (runningCount === 0) {
      spinner.info('No previews running');
      return;
    }

    await stopAllPreviews(cwd);
    spinner.succeed(`Stopped ${runningCount} preview(s)`);
  } catch (error) {
    spinner.fail('Failed to stop previews');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
