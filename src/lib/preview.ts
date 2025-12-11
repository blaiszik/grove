import { execa, type ExecaChildProcess } from 'execa';
import detectPort from 'detect-port';
import treeKill from 'tree-kill';
import { PreviewInfo } from '../types.js';
import { readConfig, updateConfig, getTreePath } from './config.js';
import { getDevCommand, getBuildCommand, getServeCommand, FRAMEWORK_CONFIGS } from './framework.js';

const runningProcesses: Map<string, ExecaChildProcess> = new Map();

export async function findAvailablePort(startPort: number = 3000): Promise<number> {
  return detectPort(startPort);
}

export async function startPreview(
  treeName: string,
  mode: 'dev' | 'build',
  cwd: string = process.cwd()
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

  const treePath = getTreePath(treeName, cwd);
  const defaultPort = FRAMEWORK_CONFIGS[config.framework].defaultPort;
  const port = await findAvailablePort(defaultPort);

  let command: string;
  let args: string[];

  if (mode === 'dev') {
    const devCmd = await getDevCommand(treePath);
    const parts = devCmd.split(' ');
    command = parts[0];
    args = [...parts.slice(1), '--port', String(port)];
  } else {
    // Build first, then serve
    const buildCmd = await getBuildCommand(treePath);
    const buildParts = buildCmd.split(' ');
    await execa(buildParts[0], buildParts.slice(1), {
      cwd: treePath,
      stdio: 'inherit',
    });

    const serveCmd = await getServeCommand(treePath);
    const serveParts = serveCmd.split(' ');
    command = serveParts[0];
    args = [...serveParts.slice(1), '--port', String(port)];
  }

  // Start the process
  const child = execa(command, args, {
    cwd: treePath,
    stdio: 'inherit',
    detached: true,
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
