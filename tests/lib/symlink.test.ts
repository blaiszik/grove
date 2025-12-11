import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  createTestContext,
  TestContext,
  assertSymlink,
  safeCleanup,
} from '../helpers/test-utils.js';
import {
  getCurrentLinkPath,
  createCurrentLink,
  removeCurrentLink,
  getCurrentTreeName,
  isSymlinkValid,
} from '../../src/lib/symlink.js';
import { getGroveDir, getTreesDir } from '../../src/lib/config.js';
import { CURRENT_LINK } from '../../src/types.js';

describe('symlink', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
    // Create grove structure
    const treesDir = getTreesDir(ctx.repoDir);
    await fs.ensureDir(treesDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('getCurrentLinkPath', () => {
    it('returns correct path for current symlink', () => {
      const result = getCurrentLinkPath(ctx.repoDir);
      expect(result).toBe(path.join(ctx.repoDir, CURRENT_LINK));
    });
  });

  describe('createCurrentLink', () => {
    it('creates symlink to tree directory', async () => {
      // Create a tree directory
      const treeName = 'main';
      const treePath = path.join(getTreesDir(ctx.repoDir), treeName);
      await fs.ensureDir(treePath);
      await fs.writeFile(path.join(treePath, 'test.txt'), 'hello');

      await createCurrentLink(treeName, ctx.repoDir);

      // Verify symlink exists
      const linkPath = getCurrentLinkPath(ctx.repoDir);
      const stat = await fs.lstat(linkPath);
      expect(stat.isSymbolicLink()).toBe(true);

      // Verify we can read through the symlink
      const content = await fs.readFile(path.join(linkPath, 'test.txt'), 'utf-8');
      expect(content).toBe('hello');
    });

    it('replaces existing symlink', async () => {
      const treesDir = getTreesDir(ctx.repoDir);

      // Create two tree directories
      const tree1 = path.join(treesDir, 'tree1');
      const tree2 = path.join(treesDir, 'tree2');
      await fs.ensureDir(tree1);
      await fs.ensureDir(tree2);
      await fs.writeFile(path.join(tree1, 'file.txt'), 'tree1');
      await fs.writeFile(path.join(tree2, 'file.txt'), 'tree2');

      // Create link to tree1
      await createCurrentLink('tree1', ctx.repoDir);

      // Update link to tree2
      await createCurrentLink('tree2', ctx.repoDir);

      // Verify symlink now points to tree2
      const linkPath = getCurrentLinkPath(ctx.repoDir);
      const content = await fs.readFile(path.join(linkPath, 'file.txt'), 'utf-8');
      expect(content).toBe('tree2');
    });
  });

  describe('removeCurrentLink', () => {
    it('removes existing symlink', async () => {
      // Create a tree and symlink
      const treePath = path.join(getTreesDir(ctx.repoDir), 'main');
      await fs.ensureDir(treePath);
      await createCurrentLink('main', ctx.repoDir);

      // Verify it exists
      const linkPath = getCurrentLinkPath(ctx.repoDir);
      let exists = await fs.pathExists(linkPath);
      expect(exists).toBe(true);

      // Remove it
      await removeCurrentLink(ctx.repoDir);

      // Verify it's gone
      exists = await fs.pathExists(linkPath);
      expect(exists).toBe(false);
    });

    it('does nothing when symlink does not exist', async () => {
      // Should not throw
      await removeCurrentLink(ctx.repoDir);

      const linkPath = getCurrentLinkPath(ctx.repoDir);
      const exists = await fs.pathExists(linkPath);
      expect(exists).toBe(false);
    });
  });

  describe('getCurrentTreeName', () => {
    it('returns tree name from symlink', async () => {
      const treePath = path.join(getTreesDir(ctx.repoDir), 'feature-x');
      await fs.ensureDir(treePath);
      await createCurrentLink('feature-x', ctx.repoDir);

      const name = await getCurrentTreeName(ctx.repoDir);
      expect(name).toBe('feature-x');
    });

    it('returns null when no symlink exists', async () => {
      const name = await getCurrentTreeName(ctx.repoDir);
      expect(name).toBeNull();
    });

    it('handles tree names with special characters', async () => {
      const treeName = 'feature-auth-v2';
      const treePath = path.join(getTreesDir(ctx.repoDir), treeName);
      await fs.ensureDir(treePath);
      await createCurrentLink(treeName, ctx.repoDir);

      const name = await getCurrentTreeName(ctx.repoDir);
      expect(name).toBe(treeName);
    });
  });

  describe('isSymlinkValid', () => {
    it('returns true for valid symlink', async () => {
      const treePath = path.join(getTreesDir(ctx.repoDir), 'main');
      await fs.ensureDir(treePath);
      await createCurrentLink('main', ctx.repoDir);

      const valid = await isSymlinkValid(ctx.repoDir);
      expect(valid).toBe(true);
    });

    it('returns false when symlink does not exist', async () => {
      const valid = await isSymlinkValid(ctx.repoDir);
      expect(valid).toBe(false);
    });

    it('returns false when symlink target does not exist', async () => {
      const treePath = path.join(getTreesDir(ctx.repoDir), 'deleted');
      await fs.ensureDir(treePath);
      await createCurrentLink('deleted', ctx.repoDir);

      // Remove the target directory safely
      await safeCleanup(treePath);

      const valid = await isSymlinkValid(ctx.repoDir);
      expect(valid).toBe(false);
    });

    it('returns false when path is a regular file', async () => {
      const linkPath = getCurrentLinkPath(ctx.repoDir);
      await fs.writeFile(linkPath, 'not a symlink');

      const valid = await isSymlinkValid(ctx.repoDir);
      expect(valid).toBe(false);
    });

    it('returns false when path is a directory', async () => {
      const linkPath = getCurrentLinkPath(ctx.repoDir);
      await fs.ensureDir(linkPath);

      const valid = await isSymlinkValid(ctx.repoDir);
      expect(valid).toBe(false);
    });
  });
});
