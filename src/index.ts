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

program
  .name('grove')
  .description('Git worktree manager with smart dependency handling')
  .version('1.0.0');

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
  .command('path <name>')
  .description('Print the path to a worktree (for shell integration)')
  .action(getPath);

// Preview & Status
program
  .command('preview <action> [name]')
  .description('Start/stop preview server (action: tree name or "stop")')
  .option('-d, --dev', 'Run in development mode (default)')
  .option('-b, --build', 'Build and serve in production mode')
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
