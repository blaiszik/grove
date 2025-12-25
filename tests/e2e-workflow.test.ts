/**
 * End-to-End Workflow Tests
 *
 * These tests validate complete user workflows from start to finish,
 * ensuring that commands work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  createTestContext,
  createBranch,
  createAndCommitFile,
  TestContext,
} from './helpers/test-utils.js';
import { GROVE_DIR, GROVE_CONFIG, GroveConfig } from '../src/types.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

describe('complete workflow: init → plant → tend → uproot', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('executes full worktree lifecycle', async () => {
    // Step 1: Initialize grove
    const initResult = await runGrove(['init'], ctx.repoDir);
    expect(initResult.exitCode).toBe(0);

    // Verify initialization
    const groveDir = path.join(ctx.repoDir, GROVE_DIR);
    expect(await fs.pathExists(groveDir)).toBe(true);
    expect(await fs.pathExists(path.join(groveDir, GROVE_CONFIG))).toBe(true);

    let config: GroveConfig = await fs.readJson(path.join(groveDir, GROVE_CONFIG));
    expect(config.current).toBe('main');
    expect(config.trees['main']).toBeDefined();

    // Step 2: Create a feature branch and plant a tree
    await createBranch(ctx.repoDir, 'feature-workflow');
    const plantResult = await runGrove(
      ['plant', 'feature-workflow', '--no-install'],
      ctx.repoDir
    );
    expect(plantResult.exitCode).toBe(0);

    // Verify tree was created
    const treePath = path.join(groveDir, 'trees', 'feature-workflow');
    expect(await fs.pathExists(treePath)).toBe(true);

    config = await fs.readJson(path.join(groveDir, GROVE_CONFIG));
    expect(config.trees['feature-workflow']).toBeDefined();
    expect(config.trees['feature-workflow'].branch).toBe('feature-workflow');

    // Step 3: Switch to the new tree
    const tendResult = await runGrove(['tend', 'feature-workflow'], ctx.repoDir);
    expect(tendResult.exitCode).toBe(0);

    config = await fs.readJson(path.join(groveDir, GROVE_CONFIG));
    expect(config.current).toBe('feature-workflow');

    // Verify symlink points to correct tree
    const currentLink = path.join(ctx.repoDir, 'current');
    const linkTarget = await fs.readlink(currentLink);
    expect(linkTarget).toContain('feature-workflow');

    // Step 4: List trees and verify both exist
    const listResult = await runGrove(['list', '--json'], ctx.repoDir);
    expect(listResult.exitCode).toBe(0);
    const listJson = JSON.parse(listResult.stdout);
    expect(listJson.trees).toHaveProperty('main');
    expect(listJson.trees).toHaveProperty('feature-workflow');
    expect(listJson.current).toBe('feature-workflow');

    // Step 5: Check status
    const statusResult = await runGrove(['status', '--json'], ctx.repoDir);
    expect(statusResult.exitCode).toBe(0);
    const statusJson = JSON.parse(statusResult.stdout);
    expect(statusJson.current).toBe('feature-workflow');

    // Step 6: Switch back to main
    const tendMainResult = await runGrove(['tend', 'main'], ctx.repoDir);
    expect(tendMainResult.exitCode).toBe(0);

    config = await fs.readJson(path.join(groveDir, GROVE_CONFIG));
    expect(config.current).toBe('main');

    // Step 7: Uproot the feature tree
    const uprootResult = await runGrove(['uproot', 'feature-workflow'], ctx.repoDir);
    expect(uprootResult.exitCode).toBe(0);

    // Verify tree was removed
    expect(await fs.pathExists(treePath)).toBe(false);
    config = await fs.readJson(path.join(groveDir, GROVE_CONFIG));
    expect(config.trees['feature-workflow']).toBeUndefined();
    expect(config.trees['main']).toBeDefined();
  });
});

describe('workflow: multiple trees with switching', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('manages multiple parallel trees', async () => {
    // Create multiple feature branches
    await createBranch(ctx.repoDir, 'feature-a');
    await createBranch(ctx.repoDir, 'feature-b');
    await createBranch(ctx.repoDir, 'feature-c');

    // Plant all trees
    await runGrove(['plant', 'feature-a', '--no-install'], ctx.repoDir);
    await runGrove(['plant', 'feature-b', '--no-install'], ctx.repoDir);
    await runGrove(['plant', 'feature-c', '--no-install'], ctx.repoDir);

    // Verify all trees exist
    const config = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    expect(Object.keys(config.trees)).toEqual(
      expect.arrayContaining(['main', 'feature-a', 'feature-b', 'feature-c'])
    );

    // Switch between trees rapidly
    for (const tree of ['feature-a', 'feature-b', 'feature-c', 'main', 'feature-b']) {
      const result = await runGrove(['tend', tree], ctx.repoDir);
      expect(result.exitCode).toBe(0);

      const currentConfig = await fs.readJson(
        path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
      );
      expect(currentConfig.current).toBe(tree);
    }

    // Remove trees one by one
    await runGrove(['uproot', 'feature-a'], ctx.repoDir);
    await runGrove(['uproot', 'feature-c'], ctx.repoDir);

    const finalConfig = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    expect(Object.keys(finalConfig.trees)).toEqual(
      expect.arrayContaining(['main', 'feature-b'])
    );
    expect(finalConfig.trees['feature-a']).toBeUndefined();
    expect(finalConfig.trees['feature-c']).toBeUndefined();
  });
});

describe('workflow: plant with --switch flag', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('plants and switches in one command', async () => {
    await createBranch(ctx.repoDir, 'feature-switch');

    // Verify starting on main
    let config = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    expect(config.current).toBe('main');

    // Plant with --switch
    const result = await runGrove(
      ['plant', 'feature-switch', '--switch', '--no-install'],
      ctx.repoDir
    );
    expect(result.exitCode).toBe(0);

    // Should now be on feature-switch
    config = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    expect(config.current).toBe('feature-switch');
  });
});

describe('workflow: new branch creation', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('creates new branch with -n flag', async () => {
    // Create a new branch that doesn't exist yet
    const result = await runGrove(
      ['plant', '-n', 'brand-new-feature', '--no-install'],
      ctx.repoDir
    );
    expect(result.exitCode).toBe(0);

    // Verify branch was created
    const { stdout } = await execa('git', ['branch', '--list', 'brand-new-feature'], {
      cwd: ctx.repoDir,
    });
    expect(stdout).toContain('brand-new-feature');

    // Verify tree was created
    const config = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    expect(config.trees['brand-new-feature']).toBeDefined();
    expect(config.trees['brand-new-feature'].branch).toBe('brand-new-feature');
  });

  it('creates branch from specific base with -b flag', async () => {
    // Create a base branch with a unique file
    await createBranch(ctx.repoDir, 'develop', { checkout: true });
    await createAndCommitFile(ctx.repoDir, 'develop-only.txt', 'develop content');
    await execa('git', ['checkout', '-'], { cwd: ctx.repoDir }); // Go back

    // Create new branch from develop
    const result = await runGrove(
      ['plant', '-n', 'feature-from-develop', '-b', 'develop', '--no-install'],
      ctx.repoDir
    );
    expect(result.exitCode).toBe(0);

    // Verify the file from develop exists in the new tree
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-from-develop');
    expect(await fs.pathExists(path.join(treePath, 'develop-only.txt'))).toBe(true);
  });
});

describe('workflow: path command', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('returns correct path for trees', async () => {
    await createBranch(ctx.repoDir, 'feature-path');
    await runGrove(['plant', 'feature-path', '--no-install'], ctx.repoDir);

    const result = await runGrove(['path', 'feature-path'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    const outputPath = result.stdout.trim();
    expect(outputPath).toContain('feature-path');
    expect(await fs.pathExists(outputPath)).toBe(true);
  });

  it('returns current tree path without arguments', async () => {
    const result = await runGrove(['path'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    const outputPath = result.stdout.trim();
    expect(await fs.pathExists(outputPath)).toBe(true);
  });
});

describe('workflow: merge command', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('merges feature branch into current', async () => {
    // Create feature branch with a new file
    await createBranch(ctx.repoDir, 'feature-merge');
    await runGrove(['plant', 'feature-merge', '--no-install'], ctx.repoDir);

    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-merge');
    await fs.writeFile(path.join(treePath, 'new-feature.txt'), 'feature content');
    await execa('git', ['add', '.'], { cwd: treePath });
    await execa('git', ['commit', '-m', 'Add feature'], { cwd: treePath });

    // Switch to main
    await runGrove(['tend', 'main'], ctx.repoDir);

    // Get the branch name for main tree
    const config = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    const mainPath = config.trees['main'].path;

    // Merge feature into main
    const result = await runGrove(['merge', 'feature-merge'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    // Verify the feature file exists in main
    expect(await fs.pathExists(path.join(mainPath, 'new-feature.txt'))).toBe(true);
  });
});

describe('workflow: prune after manual deletion', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('cleans up after external worktree deletion', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-external-delete');
    await runGrove(['plant', 'feature-external-delete', '--no-install'], ctx.repoDir);

    // Simulate external deletion (e.g., user deleted folder manually)
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-external-delete');
    await fs.remove(treePath);

    // Also clean up git's worktree tracking
    await execa('git', ['worktree', 'prune'], { cwd: ctx.repoDir });

    // Grove config still has the tree
    let config = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    expect(config.trees['feature-external-delete']).toBeDefined();

    // Run prune
    const result = await runGrove(['prune'], ctx.repoDir);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain('feature-external-delete');

    // Config should be cleaned up
    config = await fs.readJson(
      path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG)
    );
    expect(config.trees['feature-external-delete']).toBeUndefined();
  });
});

describe('workflow: concurrent JSON operations', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('all commands support consistent JSON output', async () => {
    await createBranch(ctx.repoDir, 'feature-json');

    // Test various commands with --json
    const commands = [
      ['list', '--json'],
      ['status', '--json'],
      ['path', '--json'],
      ['plant', 'feature-json', '--no-install', '--json'],
      ['tend', 'feature-json', '--json'],
      ['prune', '--json'],
    ];

    for (const args of commands) {
      const result = await runGrove(args, ctx.repoDir);

      // All should return valid JSON
      expect(() => JSON.parse(result.stdout)).not.toThrow();

      const json = JSON.parse(result.stdout);
      // All should have an 'ok' field
      expect(typeof json.ok).toBe('boolean');
    }
  });
});
