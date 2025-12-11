import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  createTestContext,
  createBranch,
  TestContext,
} from '../helpers/test-utils.js';
import { GROVE_DIR } from '../../src/types.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

describe('grove path', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('outputs the path to a tree', async () => {
    await createBranch(ctx.repoDir, 'feature-path');
    await runGrove(['plant', 'feature-path', '--no-install'], ctx.repoDir);

    const result = await runGrove(['path', 'feature-path'], ctx.repoDir);

    expect(result.exitCode).toBe(0);

    const expectedPath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-path');
    expect(result.stdout.trim()).toBe(expectedPath);
  });

  it('outputs only the path with no extra text', async () => {
    await createBranch(ctx.repoDir, 'feature-clean-output');
    await runGrove(['plant', 'feature-clean-output', '--no-install'], ctx.repoDir);

    const result = await runGrove(['path', 'feature-clean-output'], ctx.repoDir);

    // Should be just the path, nothing else
    const lines = result.stdout.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('feature-clean-output');
  });

  it('fails when tree does not exist', async () => {
    const result = await runGrove(['path', 'nonexistent'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  it('can be used for shell navigation', async () => {
    await createBranch(ctx.repoDir, 'feature-shell');
    await runGrove(['plant', 'feature-shell', '--no-install'], ctx.repoDir);

    const result = await runGrove(['path', 'feature-shell'], ctx.repoDir);
    const treePath = result.stdout.trim();

    // Verify the path actually exists and is navigable
    expect(await fs.pathExists(treePath)).toBe(true);

    // Verify it's a directory
    const stat = await fs.stat(treePath);
    expect(stat.isDirectory()).toBe(true);
  });
});
