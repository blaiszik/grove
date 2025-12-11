import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  createTestContext,
  generateTestDir,
  safeCleanup,
  TestContext,
} from '../helpers/test-utils.js';
import {
  copyEditorConfigs,
  getEditorName,
  getSupportedEditors,
} from '../../src/lib/editor.js';

describe('editor', () => {
  describe('getSupportedEditors', () => {
    it('returns all supported editors', () => {
      const editors = getSupportedEditors();

      expect(editors).toContain('cursor');
      expect(editors).toContain('code');
      expect(editors).toContain('claude');
      expect(editors).toContain('zed');
    });
  });

  describe('getEditorName', () => {
    it('returns friendly name for cursor', () => {
      expect(getEditorName('cursor')).toBe('Cursor');
    });

    it('returns friendly name for code', () => {
      expect(getEditorName('code')).toBe('VS Code');
    });

    it('returns friendly name for claude', () => {
      expect(getEditorName('claude')).toBe('Claude Code');
    });

    it('returns friendly name for zed', () => {
      expect(getEditorName('zed')).toBe('Zed');
    });
  });

  describe('copyEditorConfigs', () => {
    it('copies .claude directory', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        // Create .claude directory with content
        const claudeDir = path.join(sourceDir, '.claude');
        await fs.ensureDir(claudeDir);
        await fs.writeFile(path.join(claudeDir, 'settings.json'), '{"test": true}');

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toContain('.claude');

        // Verify content was copied
        const content = await fs.readFile(
          path.join(targetDir, '.claude', 'settings.json'),
          'utf-8'
        );
        expect(content).toBe('{"test": true}');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('copies .cursor directory', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        const cursorDir = path.join(sourceDir, '.cursor');
        await fs.ensureDir(cursorDir);
        await fs.writeFile(path.join(cursorDir, 'rules'), 'cursor rules');

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toContain('.cursor');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('copies .vscode directory', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        const vscodeDir = path.join(sourceDir, '.vscode');
        await fs.ensureDir(vscodeDir);
        await fs.writeJson(path.join(vscodeDir, 'settings.json'), { editor: 'config' });

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toContain('.vscode');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('copies .cursorrules file', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        await fs.writeFile(path.join(sourceDir, '.cursorrules'), 'my cursor rules');

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toContain('.cursorrules');

        const content = await fs.readFile(path.join(targetDir, '.cursorrules'), 'utf-8');
        expect(content).toBe('my cursor rules');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('copies CLAUDE.md file', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        await fs.writeFile(path.join(sourceDir, 'CLAUDE.md'), '# Claude Context');

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toContain('CLAUDE.md');

        const content = await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf-8');
        expect(content).toBe('# Claude Context');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('copies multiple configs at once', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        // Create multiple configs
        await fs.ensureDir(path.join(sourceDir, '.claude'));
        await fs.ensureDir(path.join(sourceDir, '.vscode'));
        await fs.writeFile(path.join(sourceDir, 'CLAUDE.md'), '# Context');
        await fs.writeFile(path.join(sourceDir, '.cursorrules'), 'rules');

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toContain('.claude');
        expect(copied).toContain('.vscode');
        expect(copied).toContain('CLAUDE.md');
        expect(copied).toContain('.cursorrules');
        expect(copied.length).toBe(4);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('returns empty array when no configs exist', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toEqual([]);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('does not overwrite existing configs in target', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        // Create source config
        await fs.writeFile(path.join(sourceDir, 'CLAUDE.md'), 'source content');

        // Create existing target config
        await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), 'existing content');

        await copyEditorConfigs(sourceDir, targetDir);

        // Original should be preserved (overwrite: false)
        const content = await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf-8');
        expect(content).toBe('existing content');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('handles nested directory structures', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        // Create nested .claude structure
        const claudeDir = path.join(sourceDir, '.claude');
        const skillsDir = path.join(claudeDir, 'skills');
        await fs.ensureDir(skillsDir);
        await fs.writeFile(path.join(skillsDir, 'grove.md'), '# Grove Skill');
        await fs.writeFile(path.join(claudeDir, 'settings.json'), '{}');

        const copied = await copyEditorConfigs(sourceDir, targetDir);

        expect(copied).toContain('.claude');

        // Verify nested structure was copied
        const skillContent = await fs.readFile(
          path.join(targetDir, '.claude', 'skills', 'grove.md'),
          'utf-8'
        );
        expect(skillContent).toBe('# Grove Skill');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });
  });
});
