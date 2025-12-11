import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  createTestContext,
  safeCleanup,
  TestContext,
} from '../helpers/test-utils.js';
import {
  getGroveDir,
  getConfigPath,
  getTreesDir,
  getSharedDir,
  getTreePath,
  groveExists,
  readConfig,
  writeConfig,
  updateConfig,
  createDefaultConfig,
} from '../../src/lib/config.js';
import { GROVE_DIR, GROVE_CONFIG, GroveConfig } from '../../src/types.js';

describe('config', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('path functions', () => {
    it('getGroveDir returns correct path', () => {
      const result = getGroveDir(ctx.repoDir);
      expect(result).toBe(path.join(ctx.repoDir, GROVE_DIR));
    });

    it('getConfigPath returns correct path', () => {
      const result = getConfigPath(ctx.repoDir);
      expect(result).toBe(path.join(ctx.repoDir, GROVE_DIR, GROVE_CONFIG));
    });

    it('getTreesDir returns correct path', () => {
      const result = getTreesDir(ctx.repoDir);
      expect(result).toBe(path.join(ctx.repoDir, GROVE_DIR, 'trees'));
    });

    it('getSharedDir returns correct path', () => {
      const result = getSharedDir(ctx.repoDir);
      expect(result).toBe(path.join(ctx.repoDir, GROVE_DIR, 'shared'));
    });

    it('getTreePath returns correct path for tree', () => {
      const result = getTreePath('feature-x', ctx.repoDir);
      expect(result).toBe(path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-x'));
    });
  });

  describe('groveExists', () => {
    it('returns false when grove is not initialized', async () => {
      const exists = await groveExists(ctx.repoDir);
      expect(exists).toBe(false);
    });

    it('returns true when config exists', async () => {
      // Create grove structure
      const configPath = getConfigPath(ctx.repoDir);
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, createDefaultConfig(ctx.repoDir));

      const exists = await groveExists(ctx.repoDir);
      expect(exists).toBe(true);
    });
  });

  describe('createDefaultConfig', () => {
    it('creates config with correct structure', () => {
      const config = createDefaultConfig('/path/to/repo');

      expect(config.version).toBe(1);
      expect(config.repo).toBe('/path/to/repo');
      expect(config.packageManager).toBe('npm');
      expect(config.framework).toBe('generic');
      expect(config.trees).toEqual({});
      expect(config.current).toBeNull();
      expect(config.previews).toEqual({});
    });
  });

  describe('writeConfig and readConfig', () => {
    it('writes and reads config correctly', async () => {
      // Create grove directory
      const configPath = getConfigPath(ctx.repoDir);
      await fs.ensureDir(path.dirname(configPath));

      const config = createDefaultConfig(ctx.repoDir);
      config.packageManager = 'pnpm';
      config.framework = 'nextjs';
      config.trees = {
        main: {
          branch: 'main',
          path: '/path/to/main',
          created: '2024-01-01T00:00:00.000Z',
        },
      };
      config.current = 'main';

      await writeConfig(config, ctx.repoDir);

      const readBack = await readConfig(ctx.repoDir);
      expect(readBack).toEqual(config);
    });

    it('throws error when reading non-existent config', async () => {
      await expect(readConfig(ctx.repoDir)).rejects.toThrow(
        'Grove not initialized'
      );
    });
  });

  describe('updateConfig', () => {
    it('updates config using updater function', async () => {
      // Create initial config
      const configPath = getConfigPath(ctx.repoDir);
      await fs.ensureDir(path.dirname(configPath));
      const initial = createDefaultConfig(ctx.repoDir);
      await writeConfig(initial, ctx.repoDir);

      // Update config
      const updated = await updateConfig(
        (c) => ({
          ...c,
          current: 'feature-x',
          trees: {
            'feature-x': {
              branch: 'feature-x',
              path: '/path/to/feature-x',
              created: new Date().toISOString(),
            },
          },
        }),
        ctx.repoDir
      );

      expect(updated.current).toBe('feature-x');
      expect(updated.trees['feature-x']).toBeDefined();

      // Verify it's persisted
      const readBack = await readConfig(ctx.repoDir);
      expect(readBack.current).toBe('feature-x');
    });

    it('supports async updater function', async () => {
      const configPath = getConfigPath(ctx.repoDir);
      await fs.ensureDir(path.dirname(configPath));
      await writeConfig(createDefaultConfig(ctx.repoDir), ctx.repoDir);

      const updated = await updateConfig(async (c) => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ...c, packageManager: 'yarn' as const };
      }, ctx.repoDir);

      expect(updated.packageManager).toBe('yarn');
    });
  });
});
