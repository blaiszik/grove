import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import { createTestContext, TestContext } from '../helpers/test-utils.js';

const CLI_PATH = path.join(process.cwd(), 'bin', 'grove.js');

async function runGrove(args: string[], cwd: string) {
  return execa('node', [CLI_PATH, ...args], {
    cwd,
    reject: false,
  });
}

describe('grove claude setup', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext({ nodeProject: true });
    await runGrove(['init'], ctx.repoDir);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('creates skill and settings when missing', async () => {
    const result = await runGrove(['claude', 'setup'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    const skillPath = path.join(ctx.repoDir, '.claude', 'skills', 'grove.md');
    const settingsPath = path.join(ctx.repoDir, '.claude', 'settings.local.json');

    expect(await fs.pathExists(skillPath)).toBe(true);
    expect(await fs.pathExists(settingsPath)).toBe(true);

    const skillContent = await fs.readFile(skillPath, 'utf-8');
    expect(skillContent).toContain('Grove - Git Worktree Manager');

    const settings = await fs.readJson(settingsPath);
    expect(settings.permissions.allow).toContain('Bash(grove:*)');
  });

  it('does not overwrite existing settings file', async () => {
    const claudeDir = path.join(ctx.repoDir, '.claude');
    await fs.ensureDir(claudeDir);
    const settingsPath = path.join(claudeDir, 'settings.local.json');
    const original = {
      permissions: {
        allow: ['Bash(npm:*)'],
      },
    };
    await fs.writeJson(settingsPath, original, { spaces: 2 });

    const result = await runGrove(['claude', 'setup'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    const after = await fs.readJson(settingsPath);
    expect(after).toEqual(original);
  });

  it('dry-run does not write files', async () => {
    const result = await runGrove(['claude', 'setup', '--dry-run'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    const claudeDir = path.join(ctx.repoDir, '.claude');
    expect(await fs.pathExists(claudeDir)).toBe(false);
  });

  it('force overwrites existing skill file', async () => {
    const skillPath = path.join(ctx.repoDir, '.claude', 'skills', 'grove.md');
    await fs.ensureDir(path.dirname(skillPath));
    await fs.writeFile(skillPath, 'old content', 'utf-8');

    const result = await runGrove(['claude', 'setup', '--force', '--no-settings'], ctx.repoDir);
    expect(result.exitCode).toBe(0);

    const skillContent = await fs.readFile(skillPath, 'utf-8');
    expect(skillContent).not.toBe('old content');
    expect(skillContent).toContain('Grove - Git Worktree Manager');
  });
});

