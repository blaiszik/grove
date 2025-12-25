/**
 * Error Path Coverage Tests
 *
 * These tests focus on edge cases and error handling
 * that may not be covered by the primary command tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  createTestContext,
  createBranch,
  TestContext,
  generateTestDir,
  safeCleanup,
} from './helpers/test-utils.js';
import { GROVE_DIR, GROVE_CONFIG, GroveConfig } from '../src/types.js';
import { assertValidTreeName } from '../src/lib/config.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

describe('tree name validation', () => {
  it('rejects empty tree names', () => {
    expect(() => assertValidTreeName('')).toThrow('Invalid tree name');
  });

  it('rejects tree names with leading/trailing whitespace', () => {
    expect(() => assertValidTreeName(' feature')).toThrow('Invalid tree name');
    expect(() => assertValidTreeName('feature ')).toThrow('Invalid tree name');
    expect(() => assertValidTreeName('  ')).toThrow('Invalid tree name');
  });

  it('rejects "." and ".." as tree names', () => {
    expect(() => assertValidTreeName('.')).toThrow('Invalid tree name');
    expect(() => assertValidTreeName('..')).toThrow('Invalid tree name');
  });

  it('rejects tree names with path separators', () => {
    expect(() => assertValidTreeName('feature/branch')).toThrow('path separators');
    expect(() => assertValidTreeName('feature\\branch')).toThrow('path separators');
    expect(() => assertValidTreeName('../parent')).toThrow('path separators');
  });

  it('rejects tree names with special characters', () => {
    expect(() => assertValidTreeName('feature@branch')).toThrow('Invalid tree name');
    expect(() => assertValidTreeName('feature:branch')).toThrow('Invalid tree name');
    expect(() => assertValidTreeName('feature*')).toThrow('Invalid tree name');
    expect(() => assertValidTreeName('feature?name')).toThrow('Invalid tree name');
    expect(() => assertValidTreeName('feature name')).toThrow('Invalid tree name'); // space
  });

  it('accepts valid tree names', () => {
    expect(() => assertValidTreeName('feature')).not.toThrow();
    expect(() => assertValidTreeName('feature-branch')).not.toThrow();
    expect(() => assertValidTreeName('feature_branch')).not.toThrow();
    expect(() => assertValidTreeName('feature.1')).not.toThrow();
    expect(() => assertValidTreeName('UPPERCASE')).not.toThrow();
    expect(() => assertValidTreeName('MixedCase123')).not.toThrow();
  });
});

describe('CLI error handling', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('grove plant error paths', () => {
    it('rejects invalid tree names via CLI', async () => {
      await createBranch(ctx.repoDir, 'feature-test');

      const result = await runGrove(
        ['plant', 'feature-test', 'invalid@name', '--no-install'],
        ctx.repoDir
      );

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Invalid tree name');
    });

    it('fails when branch does not exist and -n not specified', async () => {
      const result = await runGrove(
        ['plant', 'nonexistent-branch', '--no-install'],
        ctx.repoDir
      );

      expect(result.exitCode).toBe(1);
      // Should fail because branch doesn't exist
    });

    it('handles JSON output for tree already exists error', async () => {
      await createBranch(ctx.repoDir, 'feature-json');
      await runGrove(['plant', 'feature-json', '--no-install'], ctx.repoDir);

      // Try to create again with JSON output
      const result = await runGrove(
        ['plant', 'feature-json', '--no-install', '--json'],
        ctx.repoDir
      );

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('already exists');
    });
  });

  describe('grove tend error paths', () => {
    it('handles invalid tree name via CLI', async () => {
      const result = await runGrove(['tend', '../../../etc'], ctx.repoDir);

      expect(result.exitCode).toBe(1);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/invalid|not found/);
    });

    it('handles JSON output for tree not found', async () => {
      const result = await runGrove(['tend', 'nonexistent', '--json'], ctx.repoDir);

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('not found');
    });

    it('handles JSON output for already on tree', async () => {
      const config = await fs.readJson(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
      const currentTree = config.current;

      const result = await runGrove(['tend', currentTree, '--json'], ctx.repoDir);

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(true);
      expect(json.alreadyCurrent).toBe(true);
    });
  });

  describe('grove uproot error paths', () => {
    it('handles JSON output for tree not found', async () => {
      const result = await runGrove(['uproot', 'nonexistent', '--json'], ctx.repoDir);

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('not found');
    });

    it('handles JSON output for cannot uproot main', async () => {
      const result = await runGrove(['uproot', 'main', '--json'], ctx.repoDir);

      expect(result.exitCode).toBe(1);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(false);
      expect(json.error).toContain('main');
    });
  });

  describe('grove list error paths', () => {
    it('handles JSON output correctly', async () => {
      const result = await runGrove(['list', '--json'], ctx.repoDir);

      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.ok).toBe(true);
      expect(json.trees).toBeDefined();
      expect(json.current).toBeDefined();
    });
  });

  describe('grove status error paths', () => {
    it('handles JSON output when grove not initialized', async () => {
      const nonGroveDir = generateTestDir();
      try {
        await fs.ensureDir(nonGroveDir);
        // Initialize git but not grove
        await execa('git', ['init'], { cwd: nonGroveDir });

        const result = await runGrove(['status', '--json'], nonGroveDir);

        expect(result.exitCode).toBe(1);
        const json = JSON.parse(result.stdout);
        expect(json.ok).toBe(false);
      } finally {
        await safeCleanup(nonGroveDir);
      }
    });
  });
});

describe('config corruption handling', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = generateTestDir();
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await safeCleanup(testDir);
  });

  it('handles missing config.json gracefully', async () => {
    const groveDir = path.join(testDir, '.grove');
    await fs.ensureDir(groveDir);
    // Don't create config.json

    const result = await runGrove(['list'], testDir);

    expect(result.exitCode).toBe(1);
    // Should indicate grove not initialized
  });

  it('handles malformed JSON in config', async () => {
    const groveDir = path.join(testDir, '.grove');
    await fs.ensureDir(groveDir);
    await fs.writeFile(path.join(groveDir, 'config.json'), 'not valid json {{{');

    const result = await runGrove(['list'], testDir);

    expect(result.exitCode).toBe(1);
  });
});

describe('resolveGroveRoot behavior', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = generateTestDir();
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await safeCleanup(testDir);
  });

  it('throws when grove not initialized', async () => {
    const { resolveGroveRoot } = await import('../src/lib/config.js');

    await expect(resolveGroveRoot(testDir)).rejects.toThrow(
      'Grove not initialized'
    );
  });

  it('finds grove root from nested directory', async () => {
    // Initialize grove
    await execa('git', ['init'], { cwd: testDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: testDir });

    const groveDir = path.join(testDir, '.grove');
    await fs.ensureDir(path.join(groveDir, 'trees'));

    const config: GroveConfig = {
      version: 1,
      repo: testDir,
      packageManager: 'npm',
      framework: 'generic',
      trees: {},
      current: null,
      previews: {},
    };
    await fs.writeJson(path.join(groveDir, 'config.json'), config);

    // Create nested directory
    const nestedDir = path.join(testDir, 'src', 'components', 'deep');
    await fs.ensureDir(nestedDir);

    const { findGroveRoot } = await import('../src/lib/config.js');
    const root = await findGroveRoot(nestedDir);

    expect(root).toBe(testDir);
  });
});

describe('output mode tests', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('grove list quiet mode outputs only tree names', async () => {
    await createBranch(ctx.repoDir, 'feature-quiet');
    await runGrove(['plant', 'feature-quiet', '--no-install'], ctx.repoDir);

    const result = await runGrove(['list', '--quiet'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    expect(lines).toContain('main');
    expect(lines).toContain('feature-quiet');
    // Should not contain extra formatting
    expect(result.stdout).not.toContain('Trees:');
  });

  it('grove status quiet mode outputs minimal info', async () => {
    const result = await runGrove(['status', '--quiet'], ctx.repoDir);

    expect(result.exitCode).toBe(0);
    // Should output the current tree name
    expect(result.stdout.trim()).toBeTruthy();
  });
});
