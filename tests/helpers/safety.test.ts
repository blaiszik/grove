import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// On macOS, /var is a symlink to /private/var
const RESOLVED_TMPDIR = fs.realpathSync(os.tmpdir());
import {
  generateTestDir,
  isSafeToDelete,
  safeCleanup,
} from './test-utils.js';

describe('test safety utilities', () => {
  describe('generateTestDir', () => {
    it('generates paths under system temp directory', () => {
      const testDir = generateTestDir();

      expect(testDir.startsWith(RESOLVED_TMPDIR)).toBe(true);
    });

    it('generates unique paths', () => {
      const dir1 = generateTestDir();
      const dir2 = generateTestDir();

      expect(dir1).not.toBe(dir2);
    });

    it('includes grove-test prefix', () => {
      const testDir = generateTestDir();
      const basename = path.basename(testDir);

      expect(basename.startsWith('grove-test-')).toBe(true);
    });
  });

  describe('isSafeToDelete', () => {
    it('returns true for paths with grove-test prefix under temp', () => {
      const safePath = path.join(RESOLVED_TMPDIR, 'grove-test-abc123');

      expect(isSafeToDelete(safePath)).toBe(true);
    });

    it('returns true for nested paths under grove-test directory', () => {
      const safePath = path.join(RESOLVED_TMPDIR, 'grove-test-abc123', 'nested', 'deeply');

      expect(isSafeToDelete(safePath)).toBe(true);
    });

    it('returns false for paths outside temp directory', () => {
      const unsafePath = '/home/user/important-files';

      expect(isSafeToDelete(unsafePath)).toBe(false);
    });

    it('returns false for home directory', () => {
      const unsafePath = os.homedir();

      expect(isSafeToDelete(unsafePath)).toBe(false);
    });

    it('returns false for root directory', () => {
      expect(isSafeToDelete('/')).toBe(false);
    });

    it('returns false for temp directory itself', () => {
      expect(isSafeToDelete(RESOLVED_TMPDIR)).toBe(false);
    });

    it('returns false for paths in temp without grove-test prefix', () => {
      const unsafePath = path.join(RESOLVED_TMPDIR, 'some-other-dir');

      expect(isSafeToDelete(unsafePath)).toBe(false);
    });

    it('returns false for paths that look like grove-test but are not under temp', () => {
      const unsafePath = '/home/user/grove-test-fake';

      expect(isSafeToDelete(unsafePath)).toBe(false);
    });

    it('handles relative paths by resolving them', () => {
      // A relative path that resolves to current directory (not temp)
      expect(isSafeToDelete('.')).toBe(false);
      expect(isSafeToDelete('..')).toBe(false);
    });
  });

  describe('safeCleanup', () => {
    it('deletes safe directories', async () => {
      const testDir = generateTestDir();
      await fs.ensureDir(testDir);
      await fs.writeFile(path.join(testDir, 'test.txt'), 'test');

      await safeCleanup(testDir);

      expect(await fs.pathExists(testDir)).toBe(false);
    });

    it('throws error for unsafe paths', async () => {
      const unsafePath = '/home/user/important';

      await expect(safeCleanup(unsafePath)).rejects.toThrow('SAFETY');
    });

    it('throws error for paths without grove-test prefix', async () => {
      const unsafePath = path.join(RESOLVED_TMPDIR, 'not-grove-test');

      await expect(safeCleanup(unsafePath)).rejects.toThrow('SAFETY');
    });

    it('handles empty string gracefully', async () => {
      // Should not throw, just return
      await safeCleanup('');
    });

    it('handles non-existent paths gracefully', async () => {
      const nonExistent = generateTestDir();

      // Should not throw
      await safeCleanup(nonExistent);
    });

    it('includes helpful error message', async () => {
      const unsafePath = '/some/important/path';

      try {
        await safeCleanup(unsafePath);
        expect.fail('Should have thrown');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('SAFETY');
        expect(message).toContain('Refusing to delete');
        expect(message).toContain('grove-test-');
      }
    });
  });

  describe('integration: full test lifecycle', () => {
    it('safely creates and cleans up test directories', async () => {
      const testDir = generateTestDir();

      // Create directory structure
      await fs.ensureDir(testDir);
      await fs.ensureDir(path.join(testDir, 'subdir'));
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content');
      await fs.writeFile(path.join(testDir, 'subdir', 'nested.txt'), 'nested');

      // Verify it exists
      expect(await fs.pathExists(testDir)).toBe(true);
      expect(await fs.pathExists(path.join(testDir, 'subdir', 'nested.txt'))).toBe(true);

      // Clean up
      await safeCleanup(testDir);

      // Verify it's gone
      expect(await fs.pathExists(testDir)).toBe(false);
    });
  });
});
