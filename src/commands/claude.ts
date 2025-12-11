import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { resolveGroveRoot } from '../lib/config.js';
import { getOutputOptions, shouldUseSpinner, printJson } from '../lib/output.js';

interface ClaudeSetupOptions {
  dryRun?: boolean;
  force?: boolean;
  settings?: boolean;
}

const DEFAULT_GROVE_SKILL_MD = `---
name: grove
description: Use this skill when the user wants to work with git worktrees, manage multiple branches simultaneously, or run parallel AI development environments.
---

# Grove - Git Worktree Manager

Use this skill when the user wants to work with git worktrees, manage multiple branches simultaneously, or run parallel AI development environments.

## What is Grove?

Grove is a CLI tool that manages git worktrees with smart dependency handling. It's designed for AI-assisted development workflows where you need to:

- Work on multiple branches simultaneously
- Run preview servers for different branches
- Avoid reinstalling node_modules for every branch
- Open different branches in separate editor windows

## Key Commands

- Initialize in a repo: \`grove init\`
- Create a new tree: \`grove plant <branch> [name]\`
- Switch current tree: \`grove tend <name>\`
- List trees: \`grove list\`
- Remove a tree: \`grove uproot <name> [--force]\`
- Adopt existing worktree: \`grove adopt <path> [name]\`
- Health / cleanup: \`grove doctor [--fix]\`, \`grove prune [--dry-run]\`

## AI Sessions

Start AI tools inside a tree:

- Claude Code: \`grove ai claude <name>\`
- Codex CLI: \`grove ai codex <name>\`
- Any command: \`grove ai run <name> -- <command> [args...]\`

AI sessions inherit helpful environment variables like \`GROVE_TREE\`, \`GROVE_TREE_PATH\`, and \`GROVE_REPO\`.

## Preview Servers

- Start a preview: \`grove preview <name>\`
- Start multiple previews: \`grove preview <name-a> <name-b>\`
- Start all previews: \`grove preview all\` or \`grove preview --all\`
- Stop previews: \`grove preview stop [names...]\`
- Specific port (single tree): \`grove preview <name> --port 4000\`

## Single-Session Multi-Variant Workflow

When the user wants two different implementations/designs:

1. Create two worktrees:
   - \`grove plant -n <variant-a> -b main --no-install\`
   - \`grove plant -n <variant-b> -b main --no-install\`
2. Get their paths:
   - \`grove path <variant-a>\`
   - \`grove path <variant-b>\`
3. Edit each variant by targeting files under each path separately.
4. Preview side-by-side:
   - \`grove preview <variant-a> <variant-b>\`
5. Summarize the differences and recommend a winner.

## Tips

- You can run Grove commands from any subdirectory; it finds the grove root automatically.
- The \`current\` symlink points to the active tree.
`;

export async function claudeSetup(options: ClaudeSetupOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora('Setting up Claude integration...').start() : null;

  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const claudeDir = path.join(groveRoot, '.claude');
    const skillsDir = path.join(claudeDir, 'skills');
    const groveSkillDir = path.join(skillsDir, 'grove');
    const skillPath = path.join(groveSkillDir, 'SKILL.md');
    const settingsPath = path.join(claudeDir, 'settings.local.json');

    const createSettings = options.settings !== false;
    const dryRun = !!options.dryRun;
    const force = !!options.force;

    const skillExists = await fs.pathExists(skillPath);
    const settingsExists = await fs.pathExists(settingsPath);

    const actions: string[] = [];

    if (!skillExists) {
      actions.push(`create ${path.relative(groveRoot, skillPath)}`);
    } else if (force) {
      actions.push(`overwrite ${path.relative(groveRoot, skillPath)}`);
    } else {
      actions.push(`skip existing ${path.relative(groveRoot, skillPath)}`);
    }

    if (createSettings) {
      if (!settingsExists) {
        actions.push(`create ${path.relative(groveRoot, settingsPath)}`);
      } else {
        actions.push(`skip existing ${path.relative(groveRoot, settingsPath)}`);
      }
    } else {
      actions.push('skip settings.local.json (disabled)');
    }

    if (dryRun) {
      if (spinner) spinner.succeed('Dry run complete');
      if (out.json) {
        printJson({ ok: true, dryRun: true, actions });
        return;
      }
      if (out.quiet) return;
      console.log(chalk.gray('Dry run; no files written. Planned actions:'));
      for (const a of actions) console.log(chalk.gray(`  - ${a}`));
      return;
    }

    // Write skill
    if (!skillExists || force) {
      await fs.ensureDir(groveSkillDir);
      await fs.writeFile(skillPath, DEFAULT_GROVE_SKILL_MD, 'utf-8');
    }

    // Write settings if missing (never overwrite)
    if (createSettings && !settingsExists) {
      await fs.ensureDir(claudeDir);
      await fs.writeJson(
        settingsPath,
        { permissions: { allow: ['Bash(grove:*)'] } },
        { spaces: 2 }
      );
    }

    if (spinner) spinner.succeed('Claude integration ready');

    if (out.json) {
      printJson({ ok: true, dryRun: false, actions });
      return;
    }

    if (out.quiet) return;

    console.log('');
    console.log(chalk.green('Claude integration created:'));
    console.log(chalk.gray(`  Skill:     ${path.relative(groveRoot, skillPath)}`));
    if (createSettings) {
      if (!settingsExists) {
        console.log(chalk.gray(`  Settings:  ${path.relative(groveRoot, settingsPath)}`));
        console.log(chalk.gray(`            (allows Bash(grove:*))`));
      } else {
        console.log(chalk.yellow('  Settings:  already exists; not modified.'));
        console.log(chalk.gray('            To allow Grove commands, add:'));
        console.log(chalk.gray('            "Bash(grove:*)" to .claude/settings.local.json permissions.allow'));
      }
    }
  } catch (error) {
    if (spinner) spinner.fail('Failed to set up Claude integration');
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk.red(message));
    }
    process.exit(1);
  }
}

