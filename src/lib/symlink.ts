import fs from 'fs-extra';
import path from 'path';
import { CURRENT_LINK } from '../types.js';
import { getTreePath, readConfig } from './config.js';

export function getCurrentLinkPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CURRENT_LINK);
}

export async function createCurrentLink(
  treeName: string,
  cwd: string = process.cwd()
): Promise<void> {
  const linkPath = getCurrentLinkPath(cwd);
  const targetPath = getTreePath(treeName, cwd);

  // Remove existing symlink if present
  if (await fs.pathExists(linkPath)) {
    await fs.remove(linkPath);
  }

  // Create relative symlink
  const relativePath = path.relative(cwd, targetPath);
  await fs.symlink(relativePath, linkPath);
}

export async function removeCurrentLink(cwd: string = process.cwd()): Promise<void> {
  const linkPath = getCurrentLinkPath(cwd);
  if (await fs.pathExists(linkPath)) {
    await fs.remove(linkPath);
  }
}

export async function getCurrentTreeName(cwd: string = process.cwd()): Promise<string | null> {
  const linkPath = getCurrentLinkPath(cwd);

  try {
    const target = await fs.readlink(linkPath);

    // Handle special case where symlink points to '.' (main repo)
    if (target === '.') {
      // Find the tree that points to the repo root
      const config = await readConfig(cwd);
      for (const [name, tree] of Object.entries(config.trees)) {
        // The main tree path is the repo root (cwd after normalization)
        const normalizedTreePath = path.resolve(tree.path);
        const normalizedCwd = path.resolve(cwd);
        if (normalizedTreePath === normalizedCwd) {
          return name;
        }
      }
      return null;
    }

    // Extract tree name from path like .grove/trees/main
    const parts = target.split(path.sep);
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

export async function isSymlinkValid(cwd: string = process.cwd()): Promise<boolean> {
  const linkPath = getCurrentLinkPath(cwd);

  try {
    const stat = await fs.lstat(linkPath);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    // Check if target exists
    await fs.stat(linkPath);
    return true;
  } catch {
    return false;
  }
}
