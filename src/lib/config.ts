import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  GroveConfig,
  GROVE_DIR,
  GROVE_CONFIG,
  GROVE_TREES,
  GROVE_SHARED,
} from '../types.js';

/**
 * Find the grove root (directory containing .grove/config.json) starting from cwd.
 * Returns null if not found.
 */
export async function findGroveRoot(cwd: string = process.cwd()): Promise<string | null> {
  let dir = path.resolve(cwd);

  // Walk up looking for .grove/config.json
  while (true) {
    const candidate = path.join(dir, GROVE_DIR, GROVE_CONFIG);
    if (await fs.pathExists(candidate)) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Fallback: if inside a git repo/worktree, derive from git common dir
  try {
    const { stdout } = await execa('git', ['rev-parse', '--git-common-dir'], { cwd });
    const commonDir = stdout.trim();
    const commonAbs = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    const commonParent = path.dirname(commonAbs);
    const candidate = path.join(commonParent, GROVE_DIR, GROVE_CONFIG);
    if (await fs.pathExists(candidate)) {
      return commonParent;
    }
  } catch {
    // Not a git repo or git unavailable
  }

  return null;
}

/**
 * Resolve grove root or throw a standard error.
 */
export async function resolveGroveRoot(cwd: string = process.cwd()): Promise<string> {
  const root = await findGroveRoot(cwd);
  if (!root) {
    throw new Error('Grove not initialized. Run `grove init` first.');
  }
  return root;
}

/**
 * Throw if a tree name could escape grove boundaries or create unsafe paths.
 */
export function assertValidTreeName(name: string): void {
  if (!name || name.trim() !== name) {
    throw new Error(`Invalid tree name '${name}'.`);
  }
  if (name === '.' || name === '..') {
    throw new Error(`Invalid tree name '${name}'.`);
  }
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid tree name '${name}': path separators are not allowed.`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(
      `Invalid tree name '${name}': only letters, numbers, '.', '_' and '-' are allowed.`
    );
  }
}

export function getGroveDir(cwd: string = process.cwd()): string {
  return path.join(cwd, GROVE_DIR);
}

export function getConfigPath(cwd: string = process.cwd()): string {
  return path.join(getGroveDir(cwd), GROVE_CONFIG);
}

export function getTreesDir(cwd: string = process.cwd()): string {
  return path.join(getGroveDir(cwd), GROVE_TREES);
}

export function getSharedDir(cwd: string = process.cwd()): string {
  return path.join(getGroveDir(cwd), GROVE_SHARED);
}

export function getTreePath(name: string, cwd: string = process.cwd()): string {
  return path.join(getTreesDir(cwd), name);
}

export async function groveExists(cwd: string = process.cwd()): Promise<boolean> {
  const root = await findGroveRoot(cwd);
  return root ? fs.pathExists(getConfigPath(root)) : false;
}

export async function readConfig(cwd: string = process.cwd()): Promise<GroveConfig> {
  const root = await resolveGroveRoot(cwd);
  const configPath = getConfigPath(root);
  if (!(await fs.pathExists(configPath))) {
    throw new Error('Grove not initialized. Run `grove init` first.');
  }
  return fs.readJson(configPath);
}

export async function writeConfig(
  config: GroveConfig,
  cwd: string = process.cwd()
): Promise<void> {
  const configPath = getConfigPath(cwd);
  await fs.writeJson(configPath, config, { spaces: 2 });
}

export async function updateConfig(
  updater: (config: GroveConfig) => GroveConfig | Promise<GroveConfig>,
  cwd: string = process.cwd()
): Promise<GroveConfig> {
  const root = await resolveGroveRoot(cwd);
  const config = await readConfig(root);
  const updated = await updater(config);
  await writeConfig(updated, root);
  return updated;
}

export function createDefaultConfig(repo: string): GroveConfig {
  return {
    version: 1,
    repo,
    packageManager: 'npm',
    framework: 'generic',
    trees: {},
    current: null,
    previews: {},
  };
}
