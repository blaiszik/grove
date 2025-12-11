/**
 * Test utilities for grove
 *
 * SAFETY: All test directories are created in the system temp directory
 * and use unique prefixes to avoid any accidental deletion of real files.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execa } from 'execa';
import crypto from 'crypto';

// All test directories MUST be under this prefix
const TEST_DIR_PREFIX = 'grove-test-';
// On macOS, /var is a symlink to /private/var, so we need to resolve it
const TEMP_BASE = fs.realpathSync(os.tmpdir());

/**
 * Generates a unique test directory path in the system temp directory.
 * This ensures tests never operate on real user directories.
 */
export function generateTestDir(): string {
  const uniqueId = crypto.randomBytes(8).toString('hex');
  return path.join(TEMP_BASE, `${TEST_DIR_PREFIX}${uniqueId}`);
}

/**
 * Validates that a path is safe to delete.
 * Only allows deletion of paths that:
 * 1. Are under the system temp directory
 * 2. Have the grove-test- prefix
 */
export function isSafeToDelete(targetPath: string): boolean {
  const normalizedPath = path.normalize(path.resolve(targetPath));
  const normalizedTemp = path.normalize(TEMP_BASE);

  // Must be under temp directory
  if (!normalizedPath.startsWith(normalizedTemp)) {
    return false;
  }

  // Must have our test prefix in the path
  const relativePath = path.relative(normalizedTemp, normalizedPath);
  const firstSegment = relativePath.split(path.sep)[0];

  return firstSegment.startsWith(TEST_DIR_PREFIX);
}

/**
 * Safely removes a test directory.
 * Throws an error if the path doesn't meet safety criteria.
 */
export async function safeCleanup(targetPath: string): Promise<void> {
  if (!targetPath) {
    return;
  }

  if (!isSafeToDelete(targetPath)) {
    throw new Error(
      `SAFETY: Refusing to delete path outside test directory: ${targetPath}\n` +
        `Only paths under ${TEMP_BASE} with prefix '${TEST_DIR_PREFIX}' can be deleted.`
    );
  }

  // Double-check the path exists and is a directory
  if (await fs.pathExists(targetPath)) {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      throw new Error(`SAFETY: Path is not a directory: ${targetPath}`);
    }

    await fs.remove(targetPath);
  }
}

/**
 * Creates a test git repository with initial commit.
 */
export async function createTestRepo(testDir: string): Promise<string> {
  // Validate we're in a safe location
  if (!isSafeToDelete(testDir)) {
    throw new Error(`Cannot create test repo in unsafe location: ${testDir}`);
  }

  await fs.ensureDir(testDir);

  // Initialize git repo
  await execa('git', ['init'], { cwd: testDir });
  await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: testDir });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: testDir });

  // Create initial commit
  await fs.writeFile(path.join(testDir, 'README.md'), '# Test Repo\n');
  await execa('git', ['add', '.'], { cwd: testDir });
  await execa('git', ['commit', '-m', 'Initial commit'], { cwd: testDir });

  return testDir;
}

/**
 * Creates a test repo with a package.json (simulating a Node.js project).
 */
export async function createTestNodeRepo(
  testDir: string,
  options: {
    packageManager?: 'npm' | 'pnpm' | 'yarn';
    framework?: 'nextjs' | 'vite' | 'generic';
  } = {}
): Promise<string> {
  await createTestRepo(testDir);

  const { packageManager = 'npm', framework = 'generic' } = options;

  // Create package.json
  const packageJson: Record<string, unknown> = {
    name: 'test-project',
    version: '1.0.0',
    scripts: {
      dev: 'echo "dev server"',
      build: 'echo "build"',
      start: 'echo "start"',
    },
    dependencies: {},
    devDependencies: {},
  };

  // Add framework-specific dependencies
  if (framework === 'nextjs') {
    packageJson.dependencies = { next: '^14.0.0', react: '^18.0.0' };
  } else if (framework === 'vite') {
    packageJson.devDependencies = { vite: '^5.0.0' };
  }

  await fs.writeJson(path.join(testDir, 'package.json'), packageJson, { spaces: 2 });

  // Create lockfile based on package manager
  if (packageManager === 'pnpm') {
    await fs.writeFile(path.join(testDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  } else if (packageManager === 'yarn') {
    await fs.writeFile(path.join(testDir, 'yarn.lock'), '# yarn lockfile v1\n');
  } else {
    await fs.writeJson(path.join(testDir, 'package-lock.json'), {
      name: 'test-project',
      lockfileVersion: 3,
      packages: {},
    });
  }

  // Commit the package files
  await execa('git', ['add', '.'], { cwd: testDir });
  await execa('git', ['commit', '-m', 'Add package.json'], { cwd: testDir });

  return testDir;
}

/**
 * Creates a branch in the test repo.
 */
export async function createBranch(
  repoDir: string,
  branchName: string,
  options: { checkout?: boolean } = {}
): Promise<void> {
  const args = ['branch', branchName];
  await execa('git', args, { cwd: repoDir });

  if (options.checkout) {
    await execa('git', ['checkout', branchName], { cwd: repoDir });
  }
}

/**
 * Gets the current branch name.
 */
export async function getCurrentBranch(repoDir: string): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoDir,
  });
  return stdout.trim();
}

/**
 * Lists all branches in the repo.
 */
export async function listBranches(repoDir: string): Promise<string[]> {
  const { stdout } = await execa('git', ['branch', '--list', '--format=%(refname:short)'], {
    cwd: repoDir,
  });
  return stdout.trim().split('\n').filter(Boolean);
}

/**
 * Creates a file and commits it.
 */
export async function createAndCommitFile(
  repoDir: string,
  filename: string,
  content: string
): Promise<void> {
  await fs.writeFile(path.join(repoDir, filename), content);
  await execa('git', ['add', filename], { cwd: repoDir });
  await execa('git', ['commit', '-m', `Add ${filename}`], { cwd: repoDir });
}

/**
 * Test context that manages setup and cleanup.
 */
export interface TestContext {
  testDir: string;
  repoDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates a full test context with a git repo ready for grove testing.
 */
export async function createTestContext(
  options: {
    nodeProject?: boolean;
    packageManager?: 'npm' | 'pnpm' | 'yarn';
    framework?: 'nextjs' | 'vite' | 'generic';
  } = {}
): Promise<TestContext> {
  const testDir = generateTestDir();
  const repoDir = path.join(testDir, 'repo');

  if (options.nodeProject) {
    await createTestNodeRepo(repoDir, {
      packageManager: options.packageManager,
      framework: options.framework,
    });
  } else {
    await createTestRepo(repoDir);
  }

  return {
    testDir,
    repoDir,
    cleanup: async () => {
      await safeCleanup(testDir);
    },
  };
}

/**
 * Asserts that a path exists.
 */
export async function assertPathExists(targetPath: string): Promise<void> {
  const exists = await fs.pathExists(targetPath);
  if (!exists) {
    throw new Error(`Expected path to exist: ${targetPath}`);
  }
}

/**
 * Asserts that a path does not exist.
 */
export async function assertPathNotExists(targetPath: string): Promise<void> {
  const exists = await fs.pathExists(targetPath);
  if (exists) {
    throw new Error(`Expected path to not exist: ${targetPath}`);
  }
}

/**
 * Asserts that a path is a symlink pointing to the expected target.
 */
export async function assertSymlink(
  linkPath: string,
  expectedTarget: string
): Promise<void> {
  const stat = await fs.lstat(linkPath);
  if (!stat.isSymbolicLink()) {
    throw new Error(`Expected path to be a symlink: ${linkPath}`);
  }

  const actualTarget = await fs.readlink(linkPath);
  if (!actualTarget.includes(expectedTarget) && !expectedTarget.includes(actualTarget)) {
    throw new Error(
      `Symlink target mismatch:\n  Expected: ${expectedTarget}\n  Actual: ${actualTarget}`
    );
  }
}
