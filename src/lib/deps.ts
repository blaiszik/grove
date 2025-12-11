import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import crypto from 'crypto';
import { PackageManager } from '../types.js';
import { getSharedDir } from './config.js';

export interface LockfileInfo {
  type: PackageManager;
  path: string;
  hash: string;
}

const LOCKFILES: Record<string, PackageManager> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
};

export async function detectPackageManager(
  cwd: string = process.cwd()
): Promise<PackageManager> {
  // Check for lockfiles in order of preference
  for (const [filename, manager] of Object.entries(LOCKFILES)) {
    if (await fs.pathExists(path.join(cwd, filename))) {
      return manager;
    }
  }
  return 'npm';
}

export async function getLockfileInfo(
  cwd: string = process.cwd()
): Promise<LockfileInfo | null> {
  for (const [filename, manager] of Object.entries(LOCKFILES)) {
    const lockfilePath = path.join(cwd, filename);
    if (await fs.pathExists(lockfilePath)) {
      const content = await fs.readFile(lockfilePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      return { type: manager, path: lockfilePath, hash };
    }
  }
  return null;
}

export async function installDependencies(
  manager: PackageManager,
  targetDir: string,
  options: { useSharedStore?: boolean; groveDir?: string } = {}
): Promise<void> {
  const args: string[] = ['install'];

  if (manager === 'pnpm' && options.useSharedStore && options.groveDir) {
    const storePath = path.join(getSharedDir(options.groveDir), 'pnpm-store');
    await fs.ensureDir(storePath);
    args.push('--store-dir', storePath);
  }

  // Add flags for cleaner output
  if (manager === 'npm') {
    args.push('--prefer-offline');
  } else if (manager === 'yarn') {
    args.push('--prefer-offline');
  } else if (manager === 'pnpm') {
    args.push('--prefer-offline');
  }

  await execa(manager, args, {
    cwd: targetDir,
    stdio: 'inherit',
  });
}

export async function canSymlinkNodeModules(
  sourceDir: string,
  targetDir: string
): Promise<boolean> {
  const sourceLockfile = await getLockfileInfo(sourceDir);
  const targetLockfile = await getLockfileInfo(targetDir);

  if (!sourceLockfile || !targetLockfile) {
    return false;
  }

  // Can only symlink if same package manager and same lockfile hash
  return (
    sourceLockfile.type === targetLockfile.type &&
    sourceLockfile.hash === targetLockfile.hash
  );
}

export async function symlinkNodeModules(
  sourceDir: string,
  targetDir: string
): Promise<void> {
  const sourceModules = path.join(sourceDir, 'node_modules');
  const targetModules = path.join(targetDir, 'node_modules');

  if (!(await fs.pathExists(sourceModules))) {
    throw new Error(`Source node_modules not found: ${sourceModules}`);
  }

  // Remove existing node_modules in target if present
  if (await fs.pathExists(targetModules)) {
    await fs.remove(targetModules);
  }

  // Create relative symlink
  const relativePath = path.relative(targetDir, sourceModules);
  await fs.symlink(relativePath, targetModules);
}

export async function copyLockfile(
  sourceDir: string,
  targetDir: string,
  manager: PackageManager
): Promise<void> {
  const lockfileName = Object.entries(LOCKFILES).find(
    ([, m]) => m === manager
  )?.[0];

  if (!lockfileName) return;

  const sourcePath = path.join(sourceDir, lockfileName);
  const targetPath = path.join(targetDir, lockfileName);

  if (await fs.pathExists(sourcePath)) {
    await fs.copy(sourcePath, targetPath);
  }
}

export async function hasNodeModules(dir: string): Promise<boolean> {
  return fs.pathExists(path.join(dir, 'node_modules'));
}
