import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import { createTestContext, TestContext } from '../helpers/test-utils.js';
import { GROVE_DIR } from '../../src/types.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

async function getDefaultBranch(repoDir: string): Promise<string> {
  const { stdout } = await execa('git', ['branch', '--show-current'], { cwd: repoDir });
  return stdout.trim();
}

describe('grove merge assist', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('applies merge result back to the source tree when --apply is used', async () => {
    const defaultBranch = await getDefaultBranch(ctx.repoDir);

    await execa('git', ['checkout', '-b', 'feature-sync'], { cwd: ctx.repoDir });
    await fs.writeFile(path.join(ctx.repoDir, 'feature.txt'), 'feature change\n');
    await execa('git', ['add', 'feature.txt'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'feature work'], { cwd: ctx.repoDir });

    await execa('git', ['checkout', defaultBranch], { cwd: ctx.repoDir });
    const mainOnly = path.join(ctx.repoDir, 'main-only.txt');
    await fs.writeFile(mainOnly, 'main change\n');
    await execa('git', ['add', 'main-only.txt'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'main change'], { cwd: ctx.repoDir });

    await runGrove(['plant', 'feature-sync', 'feature-tree', '--no-install'], ctx.repoDir);

    const result = await runGrove(
      ['merge', 'feature-tree', 'main', '--apply', '--no-fetch'],
      ctx.repoDir
    );

    expect(result.exitCode).toBe(0);

    const treePath = path.join(ctx.repoDir, GROVE_DIR, 'trees', 'feature-tree');
    expect(await fs.pathExists(path.join(treePath, 'main-only.txt'))).toBe(true);

    const { stdout: branchHead } = await execa('git', ['rev-parse', 'feature-sync'], {
      cwd: ctx.repoDir,
    });
    const { stdout: treeHead } = await execa('git', ['rev-parse', 'HEAD'], {
      cwd: treePath,
    });
    expect(branchHead.trim()).toBe(treeHead.trim());
  });

  it('keeps staging worktree when --keep-temp is provided', async () => {
    const defaultBranch = await getDefaultBranch(ctx.repoDir);

    await execa('git', ['checkout', '-b', 'feature-keep'], { cwd: ctx.repoDir });
    await fs.writeFile(path.join(ctx.repoDir, 'feature-keep.txt'), 'feature keep\n');
    await execa('git', ['add', 'feature-keep.txt'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'feature keep'], { cwd: ctx.repoDir });

    await execa('git', ['checkout', defaultBranch], { cwd: ctx.repoDir });
    await fs.writeFile(path.join(ctx.repoDir, 'main-keep.txt'), 'main keep\n');
    await execa('git', ['add', 'main-keep.txt'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'main keep'], { cwd: ctx.repoDir });

    await runGrove(['plant', 'feature-keep', 'keep-tree', '--no-install'], ctx.repoDir);

    const result = await runGrove(
      ['merge', 'keep-tree', 'main', '--keep-temp', '--json', '--no-fetch'],
      ctx.repoDir
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout.trim());

    expect(payload.ok).toBe(true);
    expect(payload.staging).toBeDefined();
    expect(payload.staging.kept).toBe(true);
    expect(await fs.pathExists(payload.staging.path)).toBe(true);
  });

  it('surfaces conflicts and leaves staging worktree when merge fails', async () => {
    const defaultBranch = await getDefaultBranch(ctx.repoDir);
    const shared = path.join(ctx.repoDir, 'shared.txt');

    await fs.writeFile(shared, 'base\n');
    await execa('git', ['add', 'shared.txt'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'add shared'], { cwd: ctx.repoDir });

    await execa('git', ['checkout', '-b', 'feature-conflict'], { cwd: ctx.repoDir });
    await fs.writeFile(shared, 'feature version\n');
    await execa('git', ['add', 'shared.txt'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'feature edit'], { cwd: ctx.repoDir });

    await execa('git', ['checkout', defaultBranch], { cwd: ctx.repoDir });
    await fs.writeFile(shared, 'main version\n');
    await execa('git', ['add', 'shared.txt'], { cwd: ctx.repoDir });
    await execa('git', ['commit', '-m', 'main edit'], { cwd: ctx.repoDir });

    await runGrove(['plant', 'feature-conflict', 'conflict-tree', '--no-install'], ctx.repoDir);

    const result = await runGrove(
      ['merge', 'conflict-tree', 'main', '--json', '--no-fetch'],
      ctx.repoDir
    );

    expect(result.exitCode).toBe(1);
    const payload = JSON.parse(result.stdout.trim());

    expect(payload.ok).toBe(false);
    expect(Array.isArray(payload.conflicts)).toBe(true);
    expect(payload.conflicts.length).toBeGreaterThan(0);
    expect(payload.staging).toBeDefined();
    expect(payload.staging.path).toBeDefined();
    expect(await fs.pathExists(payload.staging.path)).toBe(true);
  });
});
