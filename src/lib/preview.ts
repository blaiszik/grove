import { execa, execaCommand, type ExecaChildProcess } from 'execa';
import detectPort from 'detect-port';
import treeKill from 'tree-kill';
import { PreviewInfo, Framework } from '../types.js';
import { readConfig, updateConfig } from './config.js';
import { getDevCommand, getBuildCommand, getServeCommand, FRAMEWORK_CONFIGS } from './framework.js';

const runningProcesses: Map<string, ExecaChildProcess> = new Map();

export async function findAvailablePort(startPort: number = 3000): Promise<number> {
  return detectPort(startPort);
}

function injectPortIntoCommand(
  baseCmd: string,
  framework: Framework,
  port: number
): { cmd: string; env: Record<string, string> } {
  const env: Record<string, string> = {};
  const trimmed = baseCmd.trim();

  // If user already specified a port/listen flag, don't override (except CRA env below).
  const alreadyHasPort =
    /\b--port\b/.test(trimmed) ||
    /\s-p\s/.test(trimmed) ||
    /\s-l\s/.test(trimmed) ||
    /\b--listen\b/.test(trimmed);

  // serve CLI uses -l/--listen
  if (!alreadyHasPort && (trimmed === 'serve' || trimmed.startsWith('serve '))) {
    return { cmd: `${baseCmd} -l ${port}`, env };
  }

  // CRA dev server reads PORT env
  if (framework === 'cra') {
    env.PORT = String(port);
    return { cmd: baseCmd, env };
  }

  if (alreadyHasPort) {
    return { cmd: baseCmd, env };
  }

  const portArg = `--port ${port}`;
  const isScript =
    /^(npm\s+run\b|pnpm\b|yarn\b)/.test(trimmed);

  if (isScript) {
    // Forward args through package manager
    if (trimmed.includes(' -- ')) {
      return { cmd: `${baseCmd} ${portArg}`, env };
    }
    return { cmd: `${baseCmd} -- ${portArg}`, env };
  }

  return { cmd: `${baseCmd} ${portArg}`, env };
}

export async function startPreview(
  treeName: string,
  mode: 'dev' | 'build',
  cwd: string = process.cwd(),
  options: { port?: number; portHint?: number } = {}
): Promise<PreviewInfo> {
  const config = await readConfig(cwd);
  const tree = config.trees[treeName];

  if (!tree) {
    throw new Error(`Tree '${treeName}' not found`);
  }

  // Check if already running
  if (config.previews[treeName]) {
    throw new Error(
      `Preview for '${treeName}' is already running on port ${config.previews[treeName].port}`
    );
  }

  const treePath = tree.path;
  const defaultPort = FRAMEWORK_CONFIGS[config.framework].defaultPort;
  // Use portHint if provided (for batch operations), otherwise use default port
  const desiredPort = options.port ?? options.portHint ?? defaultPort;
  const port = await findAvailablePort(desiredPort);
  if (options.port && port !== desiredPort) {
    throw new Error(`Port ${desiredPort} is not available`);
  }

  let cmdString: string;
  let extraEnv: Record<string, string> = {};

  if (mode === 'dev') {
    const devCmd = await getDevCommand(treePath, config.packageManager);
    const injected = injectPortIntoCommand(devCmd, config.framework, port);
    cmdString = injected.cmd;
    extraEnv = injected.env;
  } else {
    // Build first, then serve
    const buildCmd = await getBuildCommand(treePath, config.packageManager);
    await execaCommand(buildCmd, {
      cwd: treePath,
      stdio: 'inherit',
    });

    const serveCmd = await getServeCommand(treePath, config.packageManager);
    const injected = injectPortIntoCommand(serveCmd, config.framework, port);
    cmdString = injected.cmd;
    extraEnv = injected.env;
  }

  // Start the process
  const child = execaCommand(cmdString, {
    cwd: treePath,
    stdio: 'inherit',
    detached: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  // Don't await - let it run in background
  child.catch(() => {
    // Process ended - clean up config
    cleanupPreview(treeName, cwd).catch(() => {});
  });

  const pid = child.pid!;
  runningProcesses.set(treeName, child);

  const previewInfo: PreviewInfo = {
    pid,
    port,
    mode,
    startedAt: new Date().toISOString(),
  };

  // Save to config
  await updateConfig((c) => ({
    ...c,
    previews: {
      ...c.previews,
      [treeName]: previewInfo,
    },
  }), cwd);

  return previewInfo;
}

export async function stopPreview(
  treeName: string,
  cwd: string = process.cwd()
): Promise<void> {
  const config = await readConfig(cwd);
  const preview = config.previews[treeName];

  if (!preview) {
    throw new Error(`No preview running for '${treeName}'`);
  }

  // Kill the process tree
  await new Promise<void>((resolve, reject) => {
    treeKill(preview.pid, 'SIGTERM', (err) => {
      if (err) {
        // Process might already be dead
        resolve();
      } else {
        resolve();
      }
    });
  });

  await cleanupPreview(treeName, cwd);
}

export async function stopAllPreviews(cwd: string = process.cwd()): Promise<void> {
  const config = await readConfig(cwd);

  for (const treeName of Object.keys(config.previews)) {
    try {
      await stopPreview(treeName, cwd);
    } catch {
      // Continue stopping others
    }
  }
}

async function cleanupPreview(
  treeName: string,
  cwd: string = process.cwd()
): Promise<void> {
  runningProcesses.delete(treeName);

  await updateConfig((c) => {
    const { [treeName]: _, ...remainingPreviews } = c.previews;
    return {
      ...c,
      previews: remainingPreviews,
    };
  }, cwd);
}

export async function getRunningPreviews(
  cwd: string = process.cwd()
): Promise<Record<string, PreviewInfo>> {
  const config = await readConfig(cwd);
  return config.previews;
}

export async function isPreviewRunning(
  treeName: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  const config = await readConfig(cwd);
  const preview = config.previews[treeName];

  if (!preview) {
    return false;
  }

  // Check if process is actually running
  try {
    process.kill(preview.pid, 0);
    return true;
  } catch {
    // Process not running - clean up stale entry
    await cleanupPreview(treeName, cwd);
    return false;
  }
}
