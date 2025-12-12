#!/usr/bin/env node
import { program } from 'commander';
import { init } from './commands/init.js';
import { plant } from './commands/plant.js';
import { list } from './commands/list.js';
import { tend } from './commands/tend.js';
import { uproot } from './commands/uproot.js';
import { preview } from './commands/preview.js';
import { status } from './commands/status.js';
import { open } from './commands/open.js';
import { spawn } from './commands/spawn.js';
import { getPath } from './commands/path.js';
import { ai } from './commands/ai.js';
import { adopt } from './commands/adopt.js';
import { prune } from './commands/prune.js';
import { doctor } from './commands/doctor.js';
import { claudeSetup } from './commands/claude.js';
import { mergeAssist } from './commands/merge.js';

program
  .name('grove')
  .description('Git worktree manager with smart dependency handling')
  .version('1.0.0')
  .option('--json', 'Output machine-readable JSON')
  .option('-q, --quiet', 'Suppress non-essential output');

program
  .command('init')
  .description('Initialize grove in current repository')
  .action(init);

program
  .command('plant <branch> [name]')
  .description('Create a new worktree (plant a tree)')
  .option('-n, --new', 'Create a new branch')
  .option('-b, --base <branch>', 'Base branch for new branch')
  .option('--no-install', 'Skip dependency installation')
  .option('-s, --switch', 'Switch to the new tree after creating')
  .action(plant);

program
  .command('tend <name>')
  .description('Switch to a worktree (tend to a tree)')
  .action(tend);

program
  .command('list')
  .alias('ls')
  .description('List all trees in the grove')
  .action(list);

program
  .command('uproot <name>')
  .description('Remove a worktree')
  .option('-f, --force', 'Force removal even with uncommitted changes')
  .action(uproot);

// AI Coding Tool Integration
program
  .command('open <name>')
  .description('Open a worktree in Cursor, VS Code, or other editor')
  .option('-e, --editor <editor>', 'Specify editor (cursor, code, zed)')
  .action(open);

program
  .command('spawn <name>')
  .description('Start an interactive Claude Code session in a worktree')
  .action(spawn);

program
  .command('ai <tool> <name> [args...]')
  .description('Start an AI coding session in a worktree (tool: claude, codex, run)')
  .allowUnknownOption(true)
  .action(ai);

program
  .command('path <name>')
  .description('Print the path to a worktree (for shell integration)')
  .action(getPath);

program
  .command('adopt <path> [name]')
  .description('Adopt an existing git worktree into grove')
  .option('-s, --switch', 'Switch to the adopted tree after adopting')
  .action(adopt);

program
  .command('prune')
  .description('Remove stale grove config entries for missing worktrees')
  .option('--dry-run', 'Show what would be pruned without changing config')
  .action(prune);

program
  .command('doctor')
  .description('Check grove health and optionally repair')
  .option('--fix', 'Attempt to repair common issues')
  .action(doctor);

program
  .command('claude')
  .description('Claude Code integration helpers')
  .command('setup')
  .description('Scaffold Grove Claude skill and safe permissions')
  .option('--dry-run', 'Show what would be created without writing')
  .option('--force', 'Overwrite skill file if it already exists')
  .option('--no-settings', 'Do not create .claude/settings.local.json')
  .action(claudeSetup);

program
  .command('merge <sourceTree> <target>')
  .description('Create a temporary integration worktree to merge or rebase a tree onto a target branch/tree')
  .option('-r, --rebase', 'Use rebase instead of merge')
  .option('-s, --strategy <strategy>', 'Integration strategy (merge or rebase)')
  .option('--apply', 'Apply the clean result back to the source tree')
  .option('--keep-temp', 'Keep the staging worktree even on success')
  .option('--no-fetch', 'Skip fetching the target branch before integrating')
  .action((sourceTree, target, opts) => {
    const strategy = opts.rebase ? 'rebase' : opts.strategy;
    mergeAssist(sourceTree, target, {
      strategy,
      apply: opts.apply,
      keepTemp: opts.keepTemp,
      fetch: opts.fetch,
    });
  });

// Preview & Status
program
  .command('preview <action> [names...]')
  .description('Start/stop preview server (action: tree name(s), "all", or "stop")')
  .option('-d, --dev', 'Run in development mode (default)')
  .option('-b, --build', 'Build and serve in production mode')
  .option('--port <port>', 'Use a specific port (single-tree only)', (v) => parseInt(v, 10))
  .option('--all', 'Start previews for all trees')
  .action(preview);

program
  .command('status')
  .description('Show grove status and running previews')
  .action(status);

// Add some helpful examples
program.addHelpText('after', `

Examples:
  $ grove init                    Initialize grove in current repo
  $ grove plant feature-x         Create worktree for existing branch
  $ grove plant -n my-feature     Create worktree with new branch

  AI Coding Workflows:
  $ grove open feature-x          Open in Cursor (or VS Code)
  $ grove spawn feature-x         Start Claude Code in worktree
  $ cd $(grove path feature-x)    Navigate to worktree in shell

  Management:
  $ grove list                    List all trees
  $ grove tend feature-x          Switch current symlink
  $ grove preview feature-x       Start dev server
  $ grove uproot feature-x        Remove worktree

The 'current' symlink always points to the active tree.

Shell Integration:
  Add to your .zshrc or .bashrc:

  # Quick cd to grove tree
  gcd() { cd "$(grove path "$1")"; }
`);

program.parse();
