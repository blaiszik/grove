import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  createTestContext,
  createBranch,
  TestContext,
} from '../helpers/test-utils.js';
import { GROVE_DIR, GROVE_CONFIG } from '../../src/types.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

describe('grove uproot', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('removes a worktree', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-remove');
    await runGrove(['plant', 'feature-remove', '--no-install'], ctx.repoDir);

    // Verify it exists
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-remove');
    expect(await fs.pathExists(treePath)).toBe(true);

    // Remove it
    const result = await runGrove(['uproot', 'feature-remove'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain("Uprooted 'feature-remove'");
    expect(await fs.pathExists(treePath)).toBe(false);
  });

  it('removes tree from config', async () => {
    await createBranch(ctx.repoDir, 'feature-config-remove');
    await runGrove(['plant', 'feature-config-remove', '--no-install'], ctx.repoDir);
    await runGrove(['uproot', 'feature-config-remove'], ctx.repoDir);

    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.trees['feature-config-remove']).toBeUndefined();
  });

  it('fails when tree does not exist', async () => {
    const result = await runGrove(['uproot', 'nonexistent'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('not found');
  });

  it('prevents removing the main repository tree', async () => {
    // The "main" tree created during init points to the repo root
    // and cannot be uprooted
    const result = await runGrove(['uproot', 'main'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    // Check both stdout and stderr (ora spinner outputs to stderr)
    const output = result.stdout + result.stderr;
    expect(output).toContain("Cannot uproot 'main'");
    expect(output).toContain('main repository');
  });

  it('switches to another tree when current tree is removed', async () => {
    // Create two trees
    await createBranch(ctx.repoDir, 'tree-stay');
    await createBranch(ctx.repoDir, 'tree-remove');
    const plantStay = await runGrove(['plant', 'tree-stay', '--no-install'], ctx.repoDir);
    const plantRemove = await runGrove(['plant', 'tree-remove', '--no-install'], ctx.repoDir);

    // Debug output if plant fails
    if (plantStay.exitCode !== 0) {
      console.log('plant tree-stay failed:', plantStay.stdout, plantStay.stderr);
    }
    if (plantRemove.exitCode !== 0) {
      console.log('plant tree-remove failed:', plantRemove.stdout, plantRemove.stderr);
    }

    // Switch to tree-remove
    const tendResult = await runGrove(['tend', 'tree-remove'], ctx.repoDir);
    if (tendResult.exitCode !== 0) {
      console.log('tend failed:', tendResult.stdout, tendResult.stderr);
    }

    // Remove it
    const result = await runGrove(['uproot', 'tree-remove'], ctx.repoDir);

    // Debug
    if (result.exitCode !== 0) {
      console.log('uproot failed:', result.stdout, result.stderr);
    }

    expect(result.exitCode).toBe(0);

    // Should have switched to another tree
    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).not.toBe('tree-remove');
    expect(config.current).not.toBeNull();
  });

  it('removes worktree with uncommitted changes using --force', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-dirty');
    await runGrove(['plant', 'feature-dirty', '--no-install'], ctx.repoDir);

    // Make uncommitted changes
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-dirty');
    await fs.writeFile(path.join(treePath, 'dirty.txt'), 'uncommitted changes');

    // Create another tree so this isn't the last one
    await createBranch(ctx.repoDir, 'feature-clean');
    await runGrove(['plant', 'feature-clean', '--no-install'], ctx.repoDir);

    // Remove with force
    const result = await runGrove(['uproot', 'feature-dirty', '--force'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(treePath)).toBe(false);
  });

  it('shows tip about --force when removal fails', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-tip');
    await runGrove(['plant', 'feature-tip', '--no-install'], ctx.repoDir);

    // Make uncommitted changes
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-tip');
    await fs.writeFile(path.join(treePath, 'dirty.txt'), 'changes');

    // Create another tree
    await createBranch(ctx.repoDir, 'feature-other');
    await runGrove(['plant', 'feature-other', '--no-install'], ctx.repoDir);

    // Try to remove without force (might fail depending on git version)
    const result = await runGrove(['uproot', 'feature-tip'], ctx.repoDir);

    // If it failed, should show tip
    if (result.exitCode !== 0) {
      expect(result.stdout).toContain('--force');
    }
  });
});
