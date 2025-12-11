import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  createTestContext,
  createTestNodeRepo,
  generateTestDir,
  safeCleanup,
  TestContext,
} from '../helpers/test-utils.js';
import { GROVE_DIR, GROVE_CONFIG } from '../../src/types.js';

// Path to the built CLI
const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false, // Don't throw on non-zero exit
  });
}

describe('grove init', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('initializes grove in a git repository', async () => {
    const result = await runGrove(['init'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // ora spinner output goes to stderr
    const output = result.stdout + result.stderr;
    expect(output).toContain('Grove initialized');

    // Verify directory structure
    const groveDir = path.join(ctx.repoDir, GROVE_DIR);
    expect(await fs.pathExists(groveDir)).toBe(true);
    expect(await fs.pathExists(path.join(groveDir, 'trees'))).toBe(true);
    expect(await fs.pathExists(path.join(groveDir, 'shared'))).toBe(true);
    expect(await fs.pathExists(path.join(groveDir, GROVE_CONFIG))).toBe(true);
  });

  it('creates config with correct values', async () => {
    await runGrove(['init'], ctx.repoDir);

    const configPath = path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG);
    const config = await fs.readJson(configPath);

    expect(config.version).toBe(1);
    expect(config.repo).toBe(ctx.repoDir);
    expect(config.packageManager).toBe('npm'); // We created npm project
    expect(config.framework).toBe('generic');
    expect(config.trees).toBeDefined();
    expect(config.current).toBeDefined();
  });

  it('registers main repo as the "main" tree', async () => {
    await runGrove(['init'], ctx.repoDir);

    const configPath = path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG);
    const config = await fs.readJson(configPath);

    // Should have registered the main repo as "main" tree
    expect(config.trees['main']).toBeDefined();
    expect(config.current).toBe('main');
    // The path should point to the repo root (not a worktree subdirectory)
    // Note: git resolves symlinks, so we check if it contains the repo path
    expect(config.trees['main'].path).toContain('repo');
  });

  it('creates current symlink', async () => {
    await runGrove(['init'], ctx.repoDir);

    const currentLink = path.join(ctx.repoDir, 'current');
    const stat = await fs.lstat(currentLink);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('adds grove to .gitignore', async () => {
    await runGrove(['init'], ctx.repoDir);

    const gitignore = await fs.readFile(path.join(ctx.repoDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain(GROVE_DIR);
    expect(gitignore).toContain('current');
  });

  it('detects pnpm package manager', async () => {
    const pnpmDir = generateTestDir();
    try {
      await createTestNodeRepo(pnpmDir, { packageManager: 'pnpm' });

      await runGrove(['init'], pnpmDir);

      const config = await fs.readJson(path.join(pnpmDir, GROVE_DIR, GROVE_CONFIG));
      expect(config.packageManager).toBe('pnpm');
    } finally {
      await safeCleanup(pnpmDir);
    }
  });

  it('detects Next.js framework', async () => {
    const nextDir = generateTestDir();
    try {
      await createTestNodeRepo(nextDir, { framework: 'nextjs' });

      await runGrove(['init'], nextDir);

      const config = await fs.readJson(path.join(nextDir, GROVE_DIR, GROVE_CONFIG));
      expect(config.framework).toBe('nextjs');
    } finally {
      await safeCleanup(nextDir);
    }
  });

  it('fails gracefully when already initialized', async () => {
    // Initialize once
    await runGrove(['init'], ctx.repoDir);

    // Try again
    const result = await runGrove(['init'], ctx.repoDir);

    expect(result.stdout).toContain('already initialized');
  });

  it('fails when not in a git repository', async () => {
    const nonGitDir = generateTestDir();
    try {
      await fs.ensureDir(nonGitDir);

      const result = await runGrove(['init'], nonGitDir);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Not a git repository');
    } finally {
      await safeCleanup(nonGitDir);
    }
  });
});
