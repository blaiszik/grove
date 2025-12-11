import chalk from 'chalk';
import ora from 'ora';
import { readConfig, assertValidTreeName } from '../lib/config.js';
import {
  startPreview as startPreviewServer,
  stopPreview as stopPreviewServer,
  stopAllPreviews,
  isPreviewRunning,
} from '../lib/preview.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

interface PreviewOptions {
  dev?: boolean;
  build?: boolean;
  port?: number;
  all?: boolean;
}

export async function preview(
  action: string,
  names: string[] | undefined,
  options: PreviewOptions
): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();

  let config: Awaited<ReturnType<typeof readConfig>>;
  try {
    config = await readConfig(cwd);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }

  // Handle 'stop' action
  if (action === 'stop') {
    const targets = names ?? [];
    if (targets.length === 0) {
      await stopAll(cwd, out, config);
      return;
    }
    for (const t of targets) {
      assertValidTreeName(t);
    }
    await stopMany(targets, cwd, out);
    return;
  }

  // Determine targets for start
  const isAll = options.all || action === 'all';
  const targets = isAll ? Object.keys(config.trees) : [action, ...(names ?? [])];
  for (const t of targets) {
    assertValidTreeName(t);
  }

  if (targets.length > 1 && options.port) {
    if (!out.quiet) {
      console.log(chalk.yellow('Note: --port is only supported for a single tree; ignoring it.'));
    }
    options = { ...options, port: undefined };
  }

  await startMany(targets, options, cwd, out, config);
}

async function startMany(
  targets: string[],
  options: PreviewOptions,
  cwd: string,
  out: ReturnType<typeof getOutputOptions>,
  config: Awaited<ReturnType<typeof readConfig>>
): Promise<void> {
  const mode = options.build ? 'build' : 'dev';

  const results: Array<{ name: string; url?: string; error?: string; alreadyRunning?: boolean }> = [];

  // Track allocated ports to avoid conflicts when starting multiple previews
  let nextPortHint = 3000;

  for (const name of targets) {
    if (!config.trees[name]) {
      results.push({ name, error: `Tree '${name}' not found` });
      continue;
    }

    try {
      if (await isPreviewRunning(name, cwd)) {
        const preview = config.previews[name];
        results.push({
          name,
          alreadyRunning: true,
          url: `http://localhost:${preview.port}`,
        });
        continue;
      }

      const spinner = shouldUseSpinner(out)
        ? ora(`Starting preview for '${name}'...`).start()
        : null;
      if (spinner) spinner.text = mode === 'build'
        ? 'Building and starting server...'
        : 'Starting dev server...';

      const previewInfo = await startPreviewServer(name, mode, cwd, {
        port: options.port,
        portHint: nextPortHint
      });
      const url = `http://localhost:${previewInfo.port}`;
      results.push({ name, url });

      // Update port hint for next preview to avoid conflicts
      nextPortHint = previewInfo.port + 1;

      if (spinner) spinner.succeed(`Preview started for '${name}'`);
    } catch (err) {
      results.push({
        name,
        error: err instanceof Error ? err.message : String(err),
      });
      if (!out.quiet && !out.json) {
        console.error(chalk.red(`Failed to start preview for '${name}': ${results[results.length - 1].error}`));
      }
    }
  }

  if (out.json) {
    printJson({ ok: results.every((r) => !r.error), mode, results });
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }

  if (out.quiet) {
    for (const r of results) {
      if (r.url) console.log(r.url);
    }
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }

  if (results.length > 1) {
    console.log('');
    console.log(chalk.green('Previews:'));
    for (const r of results) {
      if (r.error) {
        console.log(chalk.red(`  ${r.name}: ${r.error}`));
      } else if (r.url) {
        const label = r.alreadyRunning ? 'running' : 'started';
        console.log(chalk.cyan(`  ${r.name} (${label}) → ${r.url}`));
      }
    }
  }

  if (results.some((r) => r.error)) {
    process.exit(1);
  }
}

async function stopTree(
  name: string,
  cwd: string,
  out: ReturnType<typeof getOutputOptions>
): Promise<void> {
  const spinner = shouldUseSpinner(out) ? ora(`Stopping preview for '${name}'...`).start() : null;

  try {
    if (!(await isPreviewRunning(name, cwd))) {
      if (spinner) spinner.info(`No preview running for '${name}'`);
      if (out.json) {
        printJson({ ok: true, running: false });
      }
      return;
    }

    await stopPreviewServer(name, cwd);
    if (spinner) spinner.succeed(`Stopped preview for '${name}'`);
    if (out.json) {
      printJson({ ok: true, stopped: true, name });
      return;
    }
  } catch (error) {
    if (spinner) spinner.fail('Failed to stop preview');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}

async function stopMany(
  targets: string[],
  cwd: string,
  out: ReturnType<typeof getOutputOptions>
): Promise<void> {
  const results: Array<{ name: string; stopped?: boolean; error?: string }> = [];
  for (const name of targets) {
    try {
      if (!(await isPreviewRunning(name, cwd))) {
        results.push({ name, stopped: false });
        continue;
      }
      await stopPreviewServer(name, cwd);
      results.push({ name, stopped: true });
    } catch (err) {
      results.push({ name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (out.json) {
    printJson({ ok: results.every((r) => !r.error), results });
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }

  if (out.quiet) {
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }

  console.log('');
  console.log(chalk.green('Stopped previews:'));
  for (const r of results) {
    if (r.error) {
      console.log(chalk.red(`  ${r.name}: ${r.error}`));
    } else {
      const label = r.stopped ? 'stopped' : 'not running';
      console.log(chalk.gray(`  ${r.name}: ${label}`));
    }
  }

  if (results.some((r) => r.error)) {
    process.exit(1);
  }
}

async function stopAll(
  cwd: string,
  out: ReturnType<typeof getOutputOptions>,
  config?: Awaited<ReturnType<typeof readConfig>>
): Promise<void> {
  const spinner = shouldUseSpinner(out) ? ora('Stopping all previews...').start() : null;

  try {
    const cfg = config ?? await readConfig(cwd);
    const runningCount = Object.keys(cfg.previews).length;

    if (runningCount === 0) {
      if (spinner) spinner.info('No previews running');
      if (out.json) {
        printJson({ ok: true, stopped: 0 });
      }
      return;
    }

    await stopAllPreviews(cwd);
    if (spinner) spinner.succeed(`Stopped ${runningCount} preview(s)`);
    if (out.json) {
      printJson({ ok: true, stopped: runningCount });
    }
  } catch (error) {
    if (spinner) spinner.fail('Failed to stop previews');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}
