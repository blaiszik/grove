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

describe('grove tend', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('switches current symlink to specified tree', async () => {
    // Create another tree
    await createBranch(ctx.repoDir, 'feature-a');
    await runGrove(['plant', 'feature-a', '--no-install'], ctx.repoDir);

    // Switch to it
    const result = await runGrove(['tend', 'feature-a'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain("Now tending 'feature-a'");

    // Verify symlink
    const currentLink = path.join(ctx.repoDir, 'current');
    const target = await fs.readlink(currentLink);
    expect(target).toContain('feature-a');
  });

  it('updates config current field', async () => {
    await createBranch(ctx.repoDir, 'feature-b');
    await runGrove(['plant', 'feature-b', '--no-install'], ctx.repoDir);
    await runGrove(['tend', 'feature-b'], ctx.repoDir);

    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).toBe('feature-b');
  });

  it('reports when already on the specified tree', async () => {
    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    const currentTree = config.current;

    const result = await runGrove(['tend', currentTree], ctx.repoDir);

    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain(`Already on '${currentTree}'`);
  });

  it('fails when tree does not exist', async () => {
    const result = await runGrove(['tend', 'nonexistent-tree'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('not found');
  });

  it('lists available trees when tree not found', async () => {
    await createBranch(ctx.repoDir, 'available-tree');
    await runGrove(['plant', 'available-tree', '--no-install'], ctx.repoDir);

    const result = await runGrove(['tend', 'wrong-name'], ctx.repoDir);

    expect(result.stdout).toContain('Available trees');
    expect(result.stdout).toContain('available-tree');
  });

  it('can switch between multiple trees', async () => {
    // Create two trees
    await createBranch(ctx.repoDir, 'tree-1');
    await createBranch(ctx.repoDir, 'tree-2');
    await runGrove(['plant', 'tree-1', '--no-install'], ctx.repoDir);
    await runGrove(['plant', 'tree-2', '--no-install'], ctx.repoDir);

    // Switch to tree-1
    await runGrove(['tend', 'tree-1'], ctx.repoDir);
    let config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).toBe('tree-1');

    // Switch to tree-2
    await runGrove(['tend', 'tree-2'], ctx.repoDir);
    config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).toBe('tree-2');

    // Switch back to tree-1
    await runGrove(['tend', 'tree-1'], ctx.repoDir);
    config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).toBe('tree-1');
  });
});
