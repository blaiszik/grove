import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  createTestContext,
  createBranch,
  createAndCommitFile,
  TestContext,
} from '../helpers/test-utils.js';
import {
  isGitRepo,
  getRepoRoot,
  getCurrentBranch,
  branchExists,
  createWorktree,
  removeWorktree,
  listWorktrees,
  getGitDir,
} from '../../src/lib/git.js';

describe('git', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('isGitRepo', () => {
    it('returns true for a git repository', async () => {
      const result = await isGitRepo(ctx.repoDir);
      expect(result).toBe(true);
    });

    it('returns false for non-git directory', async () => {
      const nonGitDir = path.join(ctx.testDir, 'not-a-repo');
      await fs.ensureDir(nonGitDir);

      const result = await isGitRepo(nonGitDir);
      expect(result).toBe(false);
    });
  });

  describe('getRepoRoot', () => {
    it('returns the repository root', async () => {
      const result = await getRepoRoot(ctx.repoDir);
      expect(result).toBe(ctx.repoDir);
    });

    it('returns repo root from subdirectory', async () => {
      const subDir = path.join(ctx.repoDir, 'src', 'components');
      await fs.ensureDir(subDir);

      const result = await getRepoRoot(subDir);
      expect(result).toBe(ctx.repoDir);
    });
  });

  describe('getCurrentBranch', () => {
    it('returns current branch name', async () => {
      const branch = await getCurrentBranch(ctx.repoDir);
      // Default branch could be 'main' or 'master' depending on git config
      expect(['main', 'master']).toContain(branch);
    });

    it('returns new branch after checkout', async () => {
      await createBranch(ctx.repoDir, 'feature-test', { checkout: true });

      const branch = await getCurrentBranch(ctx.repoDir);
      expect(branch).toBe('feature-test');
    });
  });

  describe('branchExists', () => {
    it('returns true for existing branch', async () => {
      const currentBranch = await getCurrentBranch(ctx.repoDir);
      const exists = await branchExists(currentBranch, ctx.repoDir);
      expect(exists).toBe(true);
    });

    it('returns false for non-existing branch', async () => {
      const exists = await branchExists('non-existent-branch-xyz', ctx.repoDir);
      expect(exists).toBe(false);
    });

    it('returns true for newly created branch', async () => {
      await createBranch(ctx.repoDir, 'new-feature');

      const exists = await branchExists('new-feature', ctx.repoDir);
      expect(exists).toBe(true);
    });
  });

  describe('getGitDir', () => {
    it('returns .git directory path', async () => {
      const gitDir = await getGitDir(ctx.repoDir);
      expect(gitDir).toBe(path.join(ctx.repoDir, '.git'));
    });
  });

  describe('worktree operations', () => {
    it('createWorktree creates a new worktree for existing branch', async () => {
      // Create a branch first
      await createBranch(ctx.repoDir, 'feature-a');

      const worktreePath = path.join(ctx.testDir, 'worktree-a');
      await createWorktree(worktreePath, 'feature-a', {}, ctx.repoDir);

      // Verify worktree exists
      const exists = await fs.pathExists(worktreePath);
      expect(exists).toBe(true);

      // Verify it has the README from initial commit
      const readmeExists = await fs.pathExists(path.join(worktreePath, 'README.md'));
      expect(readmeExists).toBe(true);
    });

    it('createWorktree creates a new branch with createBranch option', async () => {
      const worktreePath = path.join(ctx.testDir, 'worktree-new');
      await createWorktree(
        worktreePath,
        'brand-new-branch',
        { createBranch: true },
        ctx.repoDir
      );

      // Verify worktree exists
      const exists = await fs.pathExists(worktreePath);
      expect(exists).toBe(true);

      // Verify branch was created
      const branchCreated = await branchExists('brand-new-branch', ctx.repoDir);
      expect(branchCreated).toBe(true);
    });

    it('listWorktrees returns all worktrees', async () => {
      // Create a worktree
      await createBranch(ctx.repoDir, 'feature-list-test');
      const worktreePath = path.join(ctx.testDir, 'worktree-list');
      await createWorktree(worktreePath, 'feature-list-test', {}, ctx.repoDir);

      const worktrees = await listWorktrees(ctx.repoDir);

      // Should have at least 2: main repo and the new worktree
      expect(worktrees.length).toBeGreaterThanOrEqual(2);

      // Find our worktree
      const ourWorktree = worktrees.find((wt) => wt.path === worktreePath);
      expect(ourWorktree).toBeDefined();
      expect(ourWorktree?.branch).toBe('feature-list-test');
    });

    it('removeWorktree removes an existing worktree', async () => {
      // Create a worktree
      await createBranch(ctx.repoDir, 'feature-remove-test');
      const worktreePath = path.join(ctx.testDir, 'worktree-remove');
      await createWorktree(worktreePath, 'feature-remove-test', {}, ctx.repoDir);

      // Verify it exists
      let exists = await fs.pathExists(worktreePath);
      expect(exists).toBe(true);

      // Remove it
      await removeWorktree(worktreePath, {}, ctx.repoDir);

      // Verify it's gone
      exists = await fs.pathExists(worktreePath);
      expect(exists).toBe(false);
    });

    it('removeWorktree with force removes worktree with changes', async () => {
      // Create a worktree
      await createBranch(ctx.repoDir, 'feature-force-test');
      const worktreePath = path.join(ctx.testDir, 'worktree-force');
      await createWorktree(worktreePath, 'feature-force-test', {}, ctx.repoDir);

      // Make uncommitted changes
      await fs.writeFile(path.join(worktreePath, 'dirty.txt'), 'uncommitted');

      // Remove with force
      await removeWorktree(worktreePath, { force: true }, ctx.repoDir);

      // Verify it's gone
      const exists = await fs.pathExists(worktreePath);
      expect(exists).toBe(false);
    });
  });
});
