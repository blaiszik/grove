import fs from 'fs-extra';
import path from 'path';
import { CURRENT_LINK } from '../types.js';
import { getTreePath, readConfig, findGroveRoot } from './config.js';

async function getGroveRootOrCwd(cwd: string): Promise<string> {
  const root = await findGroveRoot(cwd);
  return root ?? path.resolve(cwd);
}

export function getCurrentLinkPath(cwd: string = process.cwd()): string {
  return path.join(cwd, CURRENT_LINK);
}

export async function createCurrentLink(
  treeName: string,
  cwd: string = process.cwd()
): Promise<void> {
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);

  let targetPath = getTreePath(treeName, groveRoot);
  try {
    const config = await readConfig(groveRoot);
    const tree = config.trees[treeName];
    if (tree) {
      targetPath = tree.path;
    }
  } catch {
    // Grove may not be initialized; fall back to computed tree path
  }

  // Remove existing symlink if present
  if (await fs.pathExists(linkPath)) {
    await fs.remove(linkPath);
  }

  // Create relative symlink
  const relativePathRaw = path.relative(groveRoot, targetPath);
  const relativePath = relativePathRaw || '.';
  await fs.symlink(relativePath, linkPath);
}

export async function removeCurrentLink(cwd: string = process.cwd()): Promise<void> {
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);
  if (await fs.pathExists(linkPath)) {
    await fs.remove(linkPath);
  }
}

export async function getCurrentTreeName(cwd: string = process.cwd()): Promise<string | null> {
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);

  try {
    const target = await fs.readlink(linkPath);

    // Handle special case where symlink points to '.' (main repo)
    if (target === '.') {
      try {
        // Find the tree that points to the repo root
        const config = await readConfig(groveRoot);
        for (const [name, tree] of Object.entries(config.trees)) {
          // The main tree path is the repo root (cwd after normalization)
          const normalizedTreePath = path.resolve(tree.path);
          const normalizedCwd = path.resolve(groveRoot);
          if (normalizedTreePath === normalizedCwd) {
            return name;
          }
        }
      } catch {
        // No config; can't resolve main tree name
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
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);

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
