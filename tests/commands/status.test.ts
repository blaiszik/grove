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

describe('grove status', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('shows grove status', async () => {
    const result = await runGrove(['status'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Grove Status');
  });

  it('shows current tree', async () => {
    const result = await runGrove(['status'], ctx.repoDir);

    expect(result.stdout).toContain('Current Tree');
  });

  it('shows running previews section', async () => {
    const result = await runGrove(['status'], ctx.repoDir);

    expect(result.stdout).toContain('Running Previews');
  });

  it('shows summary with tree count', async () => {
    // Create additional trees
    await createBranch(ctx.repoDir, 'tree-1');
    await createBranch(ctx.repoDir, 'tree-2');
    await runGrove(['plant', 'tree-1', '--no-install'], ctx.repoDir);
    await runGrove(['plant', 'tree-2', '--no-install'], ctx.repoDir);

    const result = await runGrove(['status'], ctx.repoDir);

    expect(result.stdout).toContain('Summary');
    expect(result.stdout).toContain('Trees: 3'); // Initial + 2 new
  });

  it('shows package manager', async () => {
    const result = await runGrove(['status'], ctx.repoDir);

    expect(result.stdout).toContain('Package manager: npm');
  });

  it('shows framework', async () => {
    const result = await runGrove(['status'], ctx.repoDir);

    expect(result.stdout).toContain('Framework: generic');
  });

  it('indicates when no previews are running', async () => {
    const result = await runGrove(['status'], ctx.repoDir);

    expect(result.stdout).toContain('No previews running');
  });
});
