import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import {
  createTestContext,
  createBranch,
  TestContext,
  generateTestDir,
  safeCleanup,
} from '../helpers/test-utils.js';
import { GROVE_DIR, GROVE_CONFIG, GroveConfig } from '../../src/types.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

describe('grove open', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('fails when tree does not exist', async () => {
    const result = await runGrove(['open', 'nonexistent'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('not found');
  });

  it('shows available trees when tree not found', async () => {
    const result = await runGrove(['open', 'nonexistent'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Available trees');
    expect(output).toContain('main');
  });

  it('fails with invalid editor option', async () => {
    // Create a tree
    await createBranch(ctx.repoDir, 'feature-editor');
    await runGrove(['plant', 'feature-editor', '--no-install'], ctx.repoDir);

    const result = await runGrove(
      ['open', 'feature-editor', '--editor', 'invalid-editor'],
      ctx.repoDir
    );

    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('Unknown editor');
    expect(output).toContain('Supported');
  });

  it('outputs JSON error when tree not found with --json', async () => {
    const result = await runGrove(['open', 'nonexistent', '--json'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(false);
    expect(json.error).toContain('not found');
  });

  it('outputs JSON error for invalid editor with --json', async () => {
    await createBranch(ctx.repoDir, 'feature-json');
    await runGrove(['plant', 'feature-json', '--no-install'], ctx.repoDir);

    const result = await runGrove(
      ['open', 'feature-json', '--editor', 'fake', '--json'],
      ctx.repoDir
    );

    expect(result.exitCode).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(false);
    expect(json.error).toContain('Unknown editor');
  });

  it('validates tree name', async () => {
    // Try to open with invalid tree name
    const result = await runGrove(['open', '../../../etc/passwd'], ctx.repoDir);

    expect(result.exitCode).toBe(1);
    const output = result.stdout + result.stderr;
    // Should reject the name as invalid
    expect(output.toLowerCase()).toMatch(/invalid|not found/);
  });

  // Note: We can't easily test successful editor opening in CI
  // because it requires actual editor binaries to be installed.
  // These tests focus on error handling and validation.
});

describe('grove open - unit tests', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = generateTestDir();
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await safeCleanup(testDir);
  });

  it('detectAvailableEditors returns empty when no editors installed', async () => {
    // This test documents behavior - in CI, likely no editors are installed
    const { detectAvailableEditors } = await import('../../src/lib/editor.js');
    const editors = await detectAvailableEditors();

    // Editors array should exist (may be empty in CI)
    expect(Array.isArray(editors)).toBe(true);
  });

  it('getEditorName returns correct names', async () => {
    const { getEditorName } = await import('../../src/lib/editor.js');

    expect(getEditorName('cursor')).toBe('Cursor');
    expect(getEditorName('code')).toBe('VS Code');
    expect(getEditorName('claude')).toBe('Claude Code');
    expect(getEditorName('zed')).toBe('Zed');
  });

  it('getSupportedEditors returns all editors', async () => {
    const { getSupportedEditors } = await import('../../src/lib/editor.js');
    const editors = getSupportedEditors();

    expect(editors).toContain('cursor');
    expect(editors).toContain('code');
    expect(editors).toContain('claude');
    expect(editors).toContain('zed');
    expect(editors.length).toBe(4);
  });

  it('openInEditor throws when tree not found', async () => {
    const groveDir = path.join(testDir, '.grove');
    await fs.ensureDir(groveDir);

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

    const { openInEditor } = await import('../../src/lib/editor.js');

    await expect(openInEditor('nonexistent', 'code', testDir)).rejects.toThrow(
      "Tree 'nonexistent' not found"
    );
  });

  it('openInEditor throws when tree path does not exist', async () => {
    const groveDir = path.join(testDir, '.grove');
    await fs.ensureDir(groveDir);

    const nonExistentPath = path.join(testDir, 'does-not-exist');

    const config: GroveConfig = {
      version: 1,
      repo: testDir,
      packageManager: 'npm',
      framework: 'generic',
      trees: {
        orphan: {
          branch: 'orphan',
          path: nonExistentPath,
          created: '2024-01-01',
        },
      },
      current: null,
      previews: {},
    };
    await fs.writeJson(path.join(groveDir, 'config.json'), config);

    const { openInEditor } = await import('../../src/lib/editor.js');

    await expect(openInEditor('orphan', 'code', testDir)).rejects.toThrow(
      'Tree path does not exist'
    );
  });

  it('copyEditorConfigs copies existing config directories', async () => {
    const sourceDir = path.join(testDir, 'source');
    const targetDir = path.join(testDir, 'target');
    await fs.ensureDir(sourceDir);
    await fs.ensureDir(targetDir);

    // Create some config directories
    await fs.ensureDir(path.join(sourceDir, '.vscode'));
    await fs.writeFile(
      path.join(sourceDir, '.vscode', 'settings.json'),
      '{"editor.fontSize": 14}'
    );
    await fs.ensureDir(path.join(sourceDir, '.claude'));
    await fs.writeFile(path.join(sourceDir, 'CLAUDE.md'), '# Claude Config');

    const { copyEditorConfigs } = await import('../../src/lib/editor.js');
    const copied = await copyEditorConfigs(sourceDir, targetDir);

    expect(copied).toContain('.vscode');
    expect(copied).toContain('.claude');
    expect(copied).toContain('CLAUDE.md');
    expect(await fs.pathExists(path.join(targetDir, '.vscode', 'settings.json'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(true);
  });

  it('copyEditorConfigs skips non-existent configs', async () => {
    const sourceDir = path.join(testDir, 'source-empty');
    const targetDir = path.join(testDir, 'target-empty');
    await fs.ensureDir(sourceDir);
    await fs.ensureDir(targetDir);

    const { copyEditorConfigs } = await import('../../src/lib/editor.js');
    const copied = await copyEditorConfigs(sourceDir, targetDir);

    expect(copied).toEqual([]);
  });

  it('copyEditorConfigs does not overwrite existing files', async () => {
    const sourceDir = path.join(testDir, 'source-overwrite');
    const targetDir = path.join(testDir, 'target-overwrite');
    await fs.ensureDir(sourceDir);
    await fs.ensureDir(targetDir);

    // Create file in source and target with different content
    await fs.writeFile(path.join(sourceDir, 'CLAUDE.md'), 'source content');
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), 'target content');

    const { copyEditorConfigs } = await import('../../src/lib/editor.js');
    await copyEditorConfigs(sourceDir, targetDir);

    // Target content should be preserved
    const content = await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8');
    expect(content).toBe('target content');
  });
});
