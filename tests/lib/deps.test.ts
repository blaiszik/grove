import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  createTestContext,
  createTestNodeRepo,
  generateTestDir,
  safeCleanup,
  TestContext,
} from '../helpers/test-utils.js';
import {
  detectPackageManager,
  getLockfileInfo,
  canSymlinkNodeModules,
  symlinkNodeModules,
  copyLockfile,
  hasNodeModules,
} from '../../src/lib/deps.js';

describe('deps', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('detectPackageManager', () => {
    it('detects npm from package-lock.json', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package-lock.json'), {
          lockfileVersion: 3,
        });

        const result = await detectPackageManager(testDir);
        expect(result).toBe('npm');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('detects pnpm from pnpm-lock.yaml', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');

        const result = await detectPackageManager(testDir);
        expect(result).toBe('pnpm');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('detects yarn from yarn.lock', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeFile(path.join(testDir, 'yarn.lock'), '# yarn lockfile v1\n');

        const result = await detectPackageManager(testDir);
        expect(result).toBe('yarn');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('defaults to npm when no lockfile found', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);

        const result = await detectPackageManager(testDir);
        expect(result).toBe('npm');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('prefers pnpm when multiple lockfiles exist', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
        await fs.writeFile(path.join(testDir, 'yarn.lock'), '# yarn lockfile v1\n');
        await fs.writeJson(path.join(testDir, 'package-lock.json'), { lockfileVersion: 3 });

        const result = await detectPackageManager(testDir);
        expect(result).toBe('pnpm');
      } finally {
        await safeCleanup(testDir);
      }
    });
  });

  describe('getLockfileInfo', () => {
    it('returns lockfile info with hash', async () => {
      const info = await getLockfileInfo(ctx.repoDir);

      expect(info).not.toBeNull();
      expect(info?.type).toBe('npm');
      expect(info?.path).toBe(path.join(ctx.repoDir, 'package-lock.json'));
      expect(info?.hash).toBeDefined();
      expect(info?.hash.length).toBe(64); // SHA-256 hex length
    });

    it('returns null when no lockfile exists', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);

        const info = await getLockfileInfo(testDir);
        expect(info).toBeNull();
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('returns consistent hash for same content', async () => {
      const info1 = await getLockfileInfo(ctx.repoDir);
      const info2 = await getLockfileInfo(ctx.repoDir);

      expect(info1?.hash).toBe(info2?.hash);
    });
  });

  describe('hasNodeModules', () => {
    it('returns false when node_modules does not exist', async () => {
      const result = await hasNodeModules(ctx.repoDir);
      expect(result).toBe(false);
    });

    it('returns true when node_modules exists', async () => {
      await fs.ensureDir(path.join(ctx.repoDir, 'node_modules'));

      const result = await hasNodeModules(ctx.repoDir);
      expect(result).toBe(true);
    });
  });

  describe('canSymlinkNodeModules', () => {
    it('returns false when source has no lockfile', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);
        await fs.writeJson(path.join(targetDir, 'package-lock.json'), {
          lockfileVersion: 3,
        });

        const result = await canSymlinkNodeModules(sourceDir, targetDir);
        expect(result).toBe(false);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('returns false when target has no lockfile', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);
        await fs.writeJson(path.join(sourceDir, 'package-lock.json'), {
          lockfileVersion: 3,
        });

        const result = await canSymlinkNodeModules(sourceDir, targetDir);
        expect(result).toBe(false);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('returns true when lockfiles are identical', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        const lockContent = { lockfileVersion: 3, packages: { foo: '1.0.0' } };
        await fs.writeJson(path.join(sourceDir, 'package-lock.json'), lockContent);
        await fs.writeJson(path.join(targetDir, 'package-lock.json'), lockContent);

        const result = await canSymlinkNodeModules(sourceDir, targetDir);
        expect(result).toBe(true);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('returns false when lockfiles differ', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        await fs.writeJson(path.join(sourceDir, 'package-lock.json'), {
          lockfileVersion: 3,
          packages: { foo: '1.0.0' },
        });
        await fs.writeJson(path.join(targetDir, 'package-lock.json'), {
          lockfileVersion: 3,
          packages: { foo: '2.0.0' },
        });

        const result = await canSymlinkNodeModules(sourceDir, targetDir);
        expect(result).toBe(false);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('returns false when package managers differ', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        await fs.writeJson(path.join(sourceDir, 'package-lock.json'), {
          lockfileVersion: 3,
        });
        await fs.writeFile(path.join(targetDir, 'yarn.lock'), '# yarn lockfile v1\n');

        const result = await canSymlinkNodeModules(sourceDir, targetDir);
        expect(result).toBe(false);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });
  });

  describe('symlinkNodeModules', () => {
    it('creates symlink to source node_modules', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        // Create source node_modules with a test file
        const sourceModules = path.join(sourceDir, 'node_modules');
        await fs.ensureDir(sourceModules);
        await fs.writeFile(path.join(sourceModules, 'test.txt'), 'test');

        await symlinkNodeModules(sourceDir, targetDir);

        // Verify symlink was created
        const targetModules = path.join(targetDir, 'node_modules');
        const stat = await fs.lstat(targetModules);
        expect(stat.isSymbolicLink()).toBe(true);

        // Verify we can read through the symlink
        const content = await fs.readFile(path.join(targetModules, 'test.txt'), 'utf-8');
        expect(content).toBe('test');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('throws when source node_modules does not exist', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        await expect(symlinkNodeModules(sourceDir, targetDir)).rejects.toThrow(
          'Source node_modules not found'
        );
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('replaces existing node_modules in target', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        // Create source node_modules
        const sourceModules = path.join(sourceDir, 'node_modules');
        await fs.ensureDir(sourceModules);
        await fs.writeFile(path.join(sourceModules, 'source.txt'), 'from source');

        // Create existing target node_modules
        const targetModules = path.join(targetDir, 'node_modules');
        await fs.ensureDir(targetModules);
        await fs.writeFile(path.join(targetModules, 'target.txt'), 'from target');

        await symlinkNodeModules(sourceDir, targetDir);

        // Verify symlink points to source
        const stat = await fs.lstat(targetModules);
        expect(stat.isSymbolicLink()).toBe(true);

        // Source file should be accessible
        const exists = await fs.pathExists(path.join(targetModules, 'source.txt'));
        expect(exists).toBe(true);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });
  });

  describe('copyLockfile', () => {
    it('copies npm lockfile', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        await fs.writeJson(path.join(sourceDir, 'package-lock.json'), {
          lockfileVersion: 3,
          test: true,
        });

        await copyLockfile(sourceDir, targetDir, 'npm');

        const copied = await fs.readJson(path.join(targetDir, 'package-lock.json'));
        expect(copied.test).toBe(true);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('copies pnpm lockfile', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        await fs.writeFile(
          path.join(sourceDir, 'pnpm-lock.yaml'),
          'lockfileVersion: 9.0\ntest: true\n'
        );

        await copyLockfile(sourceDir, targetDir, 'pnpm');

        const copied = await fs.readFile(path.join(targetDir, 'pnpm-lock.yaml'), 'utf-8');
        expect(copied).toContain('test: true');
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });

    it('does nothing when source lockfile does not exist', async () => {
      const sourceDir = generateTestDir();
      const targetDir = generateTestDir();
      try {
        await fs.ensureDir(sourceDir);
        await fs.ensureDir(targetDir);

        // Should not throw
        await copyLockfile(sourceDir, targetDir, 'npm');

        const exists = await fs.pathExists(path.join(targetDir, 'package-lock.json'));
        expect(exists).toBe(false);
      } finally {
        await safeCleanup(sourceDir);
        await safeCleanup(targetDir);
      }
    });
  });
});
