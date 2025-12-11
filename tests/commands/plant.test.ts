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

describe('grove plant', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    // Initialize grove first
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('creates worktree for existing branch', async () => {
    // Create a branch in the repo
    await createBranch(ctx.repoDir, 'feature-test');

    const result = await runGrove(['plant', 'feature-test', '--no-install'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain("Planted tree 'feature-test'");

    // Verify worktree was created
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-test');
    expect(await fs.pathExists(treePath)).toBe(true);
  });

  it('creates worktree with custom name', async () => {
    await createBranch(ctx.repoDir, 'feature/auth');

    const result = await runGrove(['plant', 'feature/auth', 'auth', '--no-install'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain("Planted tree 'auth'");

    // Verify worktree with custom name
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'auth');
    expect(await fs.pathExists(treePath)).toBe(true);
  });

  it('creates new branch with -n flag', async () => {
    const result = await runGrove(['plant', '-n', 'new-feature', '--no-install'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain("Planted tree 'new-feature'");

    // Verify branch was created
    const { stdout } = await execa('git', ['branch', '--list', 'new-feature'], {
      cwd: ctx.repoDir,
    });
    expect(stdout).toContain('new-feature');
  });

  it('creates new branch from base with -b flag', async () => {
    // Create a base branch with a unique file
    await createBranch(ctx.repoDir, 'develop', { checkout: true });
    await fs.writeFile(path.join(ctx.repoDir, 'develop-file.txt'), 'develop');
    await execa('git', ['add', '.'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'develop commit'], { cwd: ctx.repoDir });

    // Go back to original branch
    const { stdout: defaultBranch } = await execa('git', ['branch', '--show-current'], {
      cwd: ctx.repoDir,
    });

    const result = await runGrove(
      ['plant', '-n', 'feature-from-develop', '-b', 'develop', '--no-install'],
      ctx.repoDir
    );

    expect(result.exitCode).toBe(0);

    // Verify the file from develop exists in new worktree
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-from-develop');
    expect(await fs.pathExists(path.join(treePath, 'develop-file.txt'))).toBe(true);
  });

  it('registers tree in config', async () => {
    await createBranch(ctx.repoDir, 'feature-config');
    await runGrove(['plant', 'feature-config', '--no-install'], ctx.repoDir);

    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));

    expect(config.trees['feature-config']).toBeDefined();
    expect(config.trees['feature-config'].branch).toBe('feature-config');
    expect(config.trees['feature-config'].created).toBeDefined();
  });

  it('switches to new tree with --switch flag', async () => {
    await createBranch(ctx.repoDir, 'feature-switch');
    await runGrove(['plant', 'feature-switch', '--switch', '--no-install'], ctx.repoDir);

    const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    expect(config.current).toBe('feature-switch');

    // Verify symlink points to new tree
    const currentLink = path.join(ctx.repoDir, 'current');
    const target = await fs.readlink(currentLink);
    expect(target).toContain('feature-switch');
  });

  it('skips install with --no-install flag', async () => {
    await createBranch(ctx.repoDir, 'feature-no-install');

    const result = await runGrove(['plant', 'feature-no-install', '--no-install'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // Output should not mention installing dependencies
    expect(result.stdout).not.toContain('Installing dependencies');
  });

  it('fails when tree already exists', async () => {
    await createBranch(ctx.repoDir, 'feature-duplicate');
    await runGrove(['plant', 'feature-duplicate', '--no-install'], ctx.repoDir);

    // Try to create again
    const result = await runGrove(['plant', 'feature-duplicate', '--no-install'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain('already exists');
  });

  it('sanitizes branch names with slashes', async () => {
    await createBranch(ctx.repoDir, 'feature/with/slashes');
    const result = await runGrove(['plant', 'feature/with/slashes', '--no-install'], ctx.repoDir);

    expect(result.exitCode).toBe(0);

    // Name should have slashes replaced with dashes
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-with-slashes');
    expect(await fs.pathExists(treePath)).toBe(true);
  });

  it('copies editor configs to new worktree', async () => {
    // Create some editor configs in the repo root
    await fs.ensureDir(path.join(ctx.repoDir, '.claude'));
    await fs.writeFile(path.join(ctx.repoDir, '.claude', 'config.json'), '{}');
    await fs.writeFile(path.join(ctx.repoDir, 'CLAUDE.md'), '# Context');

    // Commit them so they're in the repo
    await execa('git', ['add', '.'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'Add editor configs'], { cwd: ctx.repoDir });

    await createBranch(ctx.repoDir, 'feature-configs');
    await runGrove(['plant', 'feature-configs', '--no-install'], ctx.repoDir);

    // Verify configs were copied
    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-configs');
    expect(await fs.pathExists(path.join(treePath, '.claude'))).toBe(true);
    expect(await fs.pathExists(path.join(treePath, 'CLAUDE.md'))).toBe(true);
  });
});
