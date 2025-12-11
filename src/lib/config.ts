import fs from 'fs-extra';
import path from 'path';
import {
  GroveConfig,
  GROVE_DIR,
  GROVE_CONFIG,
  GROVE_TREES,
  GROVE_SHARED,
} from '../types.js';

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
  return fs.pathExists(getConfigPath(cwd));
}

export async function readConfig(cwd: string = process.cwd()): Promise<GroveConfig> {
  const configPath = getConfigPath(cwd);
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
  const config = await readConfig(cwd);
  const updated = await updater(config);
  await writeConfig(updated, cwd);
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
