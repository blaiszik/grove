import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  createTestContext,
  createBranch,
  TestContext,
} from '../helpers/test-utils.js';
import { GROVE_DIR, GROVE_CONFIG, GroveConfig } from '../../src/types.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

describe('grove prune', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('reports no stale trees when all are valid', async () => {
    const result = await runGrove(['prune'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain('No stale trees');
  });

  it('removes stale tree entries from config', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-stale');
    await runGrove(['plant', 'feature-stale', '--no-install'], ctx.repoDir);

    // Manually delete the worktree directory without using grove uproot
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-stale');
    await fs.remove(treePath);

    // Also need to remove git worktree reference
    await execa('git', ['worktree', 'prune'], { cwd: ctx.repoDir });

    // Run prune
    const result = await runGrove(['prune'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain('feature-stale');

    // Verify config was updated
    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.trees['feature-stale']).toBeUndefined();
  });

  it('dry run does not modify config', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-dry');
    await runGrove(['plant', 'feature-dry', '--no-install'], ctx.repoDir);

    // Manually delete the worktree
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-dry');
    await fs.remove(treePath);
    await execa('git', ['worktree', 'prune'], { cwd: ctx.repoDir });

    // Run prune with --dry-run
    const result = await runGrove(['prune', '--dry-run'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain('dry run');

    // Config should still have the stale entry
    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.trees['feature-dry']).toBeDefined();
  });

  it('updates current when current tree becomes stale', async () => {
    // Create two trees
    await createBranch(ctx.repoDir, 'tree-keep');
    await createBranch(ctx.repoDir, 'tree-stale');
    await runGrove(['plant', 'tree-keep', '--no-install'], ctx.repoDir);
    await runGrove(['plant', 'tree-stale', '--no-install'], ctx.repoDir);

    // Switch to tree-stale
    await runGrove(['tend', 'tree-stale'], ctx.repoDir);

    // Verify current is tree-stale
    let config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).toBe('tree-stale');

    // Remove tree-stale worktree manually
    const stalePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'tree-stale');
    await fs.remove(stalePath);
    await execa('git', ['worktree', 'prune'], { cwd: ctx.repoDir });

    // Run prune
    const result = await runGrove(['prune'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    // Current should be updated to another tree
    config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).not.toBe('tree-stale');
    expect(config.current).toBeTruthy();
  });

  it('prunes stale preview entries', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-preview');
    await runGrove(['plant', 'feature-preview', '--no-install'], ctx.repoDir);

    // Manually add a preview entry to config
    const configPath = path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG);
    let config: GroveConfig = await fs.readJson(configPath);
    config.previews['feature-preview'] = {
      pid: 99999,
      port: 3000,
      mode: 'dev',
      startedAt: new Date().toISOString(),
    };
    await fs.writeJson(configPath, config);

    // Remove the worktree manually
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-preview');
    await fs.remove(treePath);
    await execa('git', ['worktree', 'prune'], { cwd: ctx.repoDir });

    // Run prune
    const result = await runGrove(['prune'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    // Both tree and preview should be removed
    config = await fs.readJson(configPath);
    expect(config.trees['feature-preview']).toBeUndefined();
    expect(config.previews['feature-preview']).toBeUndefined();
  });

  it('preserves main tree', async () => {
    // Prune should never remove the main tree
    const result = await runGrove(['prune'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.trees['main']).toBeDefined();
  });

  it('outputs JSON with --json flag', async () => {
    const result = await runGrove(['prune', '--json'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(true);
    expect(json.prunedTrees).toEqual([]);
    expect(json.prunedPreviews).toEqual([]);
  });

  it('outputs JSON with stale trees', async () => {
    // Create and then orphan a tree
    await createBranch(ctx.repoDir, 'feature-json');
    await runGrove(['plant', 'feature-json', '--no-install'], ctx.repoDir);

    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-json');
    await fs.remove(treePath);
    await execa('git', ['worktree', 'prune'], { cwd: ctx.repoDir });

    const result = await runGrove(['prune', '--json'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(true);
    expect(json.prunedTrees).toContain('feature-json');
  });

  it('quiet mode outputs only pruned tree names', async () => {
    // Create and orphan a tree
    await createBranch(ctx.repoDir, 'feature-quiet');
    await runGrove(['plant', 'feature-quiet', '--no-install'], ctx.repoDir);

    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-quiet');
    await fs.remove(treePath);
    await execa('git', ['worktree', 'prune'], { cwd: ctx.repoDir });

    const result = await runGrove(['prune', '--quiet'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('feature-quiet');
  });

  it('quiet mode outputs nothing when no stale trees', async () => {
    const result = await runGrove(['prune', '--quiet'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});
