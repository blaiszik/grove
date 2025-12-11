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
  detectFramework,
  getFrameworkConfig,
  getDevCommand,
  getBuildCommand,
  getServeCommand,
  clearFrameworkCache,
  FRAMEWORK_CONFIGS,
} from '../../src/lib/framework.js';

describe('framework', () => {
  describe('detectFramework', () => {
    it('detects Next.js from dependencies', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          dependencies: { next: '^14.0.0', react: '^18.0.0' },
        });

        const result = await detectFramework(testDir);
        expect(result).toBe('nextjs');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('detects Vite from devDependencies', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          devDependencies: { vite: '^5.0.0' },
        });

        const result = await detectFramework(testDir);
        expect(result).toBe('vite');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('detects Create React App from react-scripts', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          dependencies: { 'react-scripts': '^5.0.0', react: '^18.0.0' },
        });

        const result = await detectFramework(testDir);
        expect(result).toBe('cra');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('returns generic when no framework detected', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          dependencies: { express: '^4.0.0' },
        });

        const result = await detectFramework(testDir);
        expect(result).toBe('generic');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('returns generic when no package.json exists', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);

        const result = await detectFramework(testDir);
        expect(result).toBe('generic');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('returns generic when package.json is invalid', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeFile(path.join(testDir, 'package.json'), 'not json');

        const result = await detectFramework(testDir);
        expect(result).toBe('generic');
      } finally {
        await safeCleanup(testDir);
      }
    });
  });

  describe('getFrameworkConfig', () => {
    it('returns correct config for Next.js', () => {
      const config = getFrameworkConfig('nextjs');

      expect(config.devCommand).toBe('next dev');
      expect(config.buildCommand).toBe('next build');
      expect(config.serveCommand).toBe('next start');
      expect(config.defaultPort).toBe(3000);
      expect(config.cacheDir).toBe('.next');
    });

    it('returns correct config for Vite', () => {
      const config = getFrameworkConfig('vite');

      expect(config.devCommand).toBe('vite');
      expect(config.buildCommand).toBe('vite build');
      expect(config.serveCommand).toBe('vite preview');
      expect(config.defaultPort).toBe(5173);
      expect(config.cacheDir).toBe('.vite');
    });

    it('returns correct config for CRA', () => {
      const config = getFrameworkConfig('cra');

      expect(config.devCommand).toBe('react-scripts start');
      expect(config.buildCommand).toBe('react-scripts build');
      expect(config.serveCommand).toBe('serve -s build');
      expect(config.defaultPort).toBe(3000);
      expect(config.cacheDir).toBeNull();
    });

    it('returns correct config for generic', () => {
      const config = getFrameworkConfig('generic');

      expect(config.devCommand).toBe('npm run dev');
      expect(config.buildCommand).toBe('npm run build');
      expect(config.serveCommand).toBe('npm run start');
      expect(config.defaultPort).toBe(3000);
      expect(config.cacheDir).toBeNull();
    });
  });

  describe('getDevCommand', () => {
    it('uses npm run dev when script exists', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          scripts: { dev: 'custom dev command' },
        });

        const result = await getDevCommand(testDir);
        expect(result).toBe('npm run dev');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('uses npm run start when dev script missing but start exists', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          scripts: { start: 'custom start command' },
        });

        const result = await getDevCommand(testDir);
        expect(result).toBe('npm run start');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('falls back to framework default when no scripts', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          dependencies: { next: '^14.0.0' },
        });

        const result = await getDevCommand(testDir);
        expect(result).toBe('next dev');
      } finally {
        await safeCleanup(testDir);
      }
    });
  });

  describe('getBuildCommand', () => {
    it('uses npm run build when script exists', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          scripts: { build: 'custom build command' },
        });

        const result = await getBuildCommand(testDir);
        expect(result).toBe('npm run build');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('falls back to framework default when no build script', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          dependencies: { vite: '^5.0.0' },
        });

        const result = await getBuildCommand(testDir);
        expect(result).toBe('vite build');
      } finally {
        await safeCleanup(testDir);
      }
    });
  });

  describe('getServeCommand', () => {
    it('uses npm run start when script exists', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          scripts: { start: 'custom start command' },
        });

        const result = await getServeCommand(testDir);
        expect(result).toBe('npm run start');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('uses npm run serve when start missing but serve exists', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);
        await fs.writeJson(path.join(testDir, 'package.json'), {
          scripts: { serve: 'custom serve command' },
        });

        const result = await getServeCommand(testDir);
        expect(result).toBe('npm run serve');
      } finally {
        await safeCleanup(testDir);
      }
    });
  });

  describe('clearFrameworkCache', () => {
    it('removes Next.js cache directory', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);

        // Create .next cache
        const cacheDir = path.join(testDir, '.next');
        await fs.ensureDir(cacheDir);
        await fs.writeFile(path.join(cacheDir, 'cache.txt'), 'cached');

        await clearFrameworkCache(testDir, 'nextjs');

        const exists = await fs.pathExists(cacheDir);
        expect(exists).toBe(false);
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('removes Vite cache directory', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);

        const cacheDir = path.join(testDir, '.vite');
        await fs.ensureDir(cacheDir);

        await clearFrameworkCache(testDir, 'vite');

        const exists = await fs.pathExists(cacheDir);
        expect(exists).toBe(false);
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('does nothing for generic framework', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);

        // Should not throw
        await clearFrameworkCache(testDir, 'generic');
      } finally {
        await safeCleanup(testDir);
      }
    });

    it('does nothing when cache directory does not exist', async () => {
      const testDir = generateTestDir();
      try {
        await fs.ensureDir(testDir);

        // Should not throw
        await clearFrameworkCache(testDir, 'nextjs');
      } finally {
        await safeCleanup(testDir);
      }
    });
  });
});
