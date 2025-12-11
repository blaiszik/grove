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

describe('grove list', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('lists all trees', async () => {
    // Create additional trees
    await createBranch(ctx.repoDir, 'feature-a');
    await createBranch(ctx.repoDir, 'feature-b');
    await runGrove(['plant', 'feature-a', '--no-install'], ctx.repoDir);
    await runGrove(['plant', 'feature-b', '--no-install'], ctx.repoDir);

    const result = await runGrove(['list'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('feature-a');
    expect(result.stdout).toContain('feature-b');
  });

  it('shows package manager in output', async () => {
    const result = await runGrove(['list'], ctx.repoDir);

    expect(result.stdout).toContain('Package manager: npm');
  });

  it('shows framework in output', async () => {
    const result = await runGrove(['list'], ctx.repoDir);

    expect(result.stdout).toContain('Framework: generic');
  });

  it('works with ls alias', async () => {
    const result = await runGrove(['ls'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Grove Trees');
  });

  it('shows branch names', async () => {
    await createBranch(ctx.repoDir, 'feature/test-branch');
    await runGrove(['plant', 'feature/test-branch', 'test-tree', '--no-install'], ctx.repoDir);

    const result = await runGrove(['list'], ctx.repoDir);

    expect(result.stdout).toContain('test-tree');
    expect(result.stdout).toContain('feature/test-branch');
  });
});
