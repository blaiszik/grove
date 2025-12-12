# grove

A git worktree manager with smart dependency handling, designed for AI-assisted development workflows.

## The Problem

Modern development often requires working on multiple branches simultaneously—reviewing a PR while fixing a bug, comparing two implementations side-by-side, or running parallel AI coding sessions on different features. Git worktrees solve this by letting you check out multiple branches at once, each in its own directory.

**But for JavaScript/TypeScript projects, worktrees are painful.** Each worktree needs its own `node_modules`, which means:
- Running `npm install` in every worktree (slow, especially with large dependency trees)
- Duplicating gigabytes of packages across worktrees
- Waiting for installs before you can start working
- Managing preview servers on different ports manually
- Losing your editor/AI tool configurations when switching contexts

**grove eliminates this friction.** It wraps git worktrees with intelligent dependency handling and first-class support for modern AI coding tools.

## Key Features

- **Smart dependency sharing** — Uses pnpm's shared store or symlinks `node_modules` when lockfiles match, avoiding duplicate installs
- **AI tool integration** — First-class support for Claude Code, Codex CLI, Cursor, VS Code, and Zed
- **Preview servers** — Run multiple branches simultaneously on different ports with automatic port allocation
- **Config preservation** — Automatically copies `.claude/`, `.cursor/`, `.vscode/`, `CLAUDE.md` and other tool configs to new worktrees
- **Run from anywhere** — Commands work from any subdirectory; grove auto-detects the grove root
- **Machine-readable output** — All commands support `--json` for scripting and automation

## Installation

```bash
# Install the published prototype from npm
npm install -g grove-cli@prototype

# Or clone and install from source
git clone https://github.com/blaiszik/grove.git
cd grove
npm install
npm run build
npm link
```

## Concepts

- **Tree**: A git worktree managed by grove. Each tree is a separate checkout of a branch stored in `.grove/trees/`.
- **Grove**: The collection of trees for a repository, managed by `.grove/config.json`.
- **Current**: A symlink (`current`) that points to your active tree. Use `grove tend` to switch it.
- **Main tree**: Your original repository directory, automatically registered as `main` when you run `grove init`.

## Quick Start

```bash
# Initialize grove in your repo
cd your-project
grove init

# Create a worktree for a feature branch
grove plant feature-auth

# List all your trees
grove list

# Open the worktree in your editor
grove open feature-auth

# Or start an AI coding session directly
grove ai claude feature-auth

# Switch the 'current' symlink to point to this tree
grove tend feature-auth

# Start a dev server for the worktree
grove preview feature-auth

# When you're done, remove the worktree
grove uproot feature-auth
```

## Commands

### Core Commands

| Command | Description |
|---------|-------------|
| `grove init` | Initialize grove in current git repository |
| `grove plant <branch> [name]` | Create a new worktree |
| `grove tend <name>` | Switch the `current` symlink to a worktree |
| `grove merge <source> <target>` | Run Merge Assist to merge/rebase a tree onto a target branch/tree |
| `grove list` | List all worktrees |
| `grove uproot <name>` | Remove a worktree |
| `grove status` | Show grove status and running previews |
| `grove adopt <path> [name]` | Adopt an existing git worktree into grove |
| `grove prune` | Remove stale config entries |
| `grove doctor [--fix]` | Check grove health and optionally repair |
| `grove claude setup` | Scaffold Claude Code skill + safe permissions |

### Global Options

These flags can be used with any command:

- `--json` — Output machine-readable JSON (supported for non-interactive commands; interactive sessions will error).
- `-q, --quiet` — Suppress non-essential human output for scripting.

### AI Coding Integration

| Command | Description |
|---------|-------------|
| `grove open <name>` | Open worktree in Cursor, VS Code, or Zed |
| `grove spawn <name>` | Start interactive Claude Code session in worktree |
| `grove ai <tool> <name> [args...]` | Start AI session (claude, codex, run) in worktree |
| `grove path <name>` | Print worktree path (for shell integration) |

### Preview Servers

| Command | Description |
|---------|-------------|
| `grove preview <name>` | Start dev server for a worktree |
| `grove preview <name> --build` | Build and serve in production mode |
| `grove preview stop` | Stop all preview servers |
| `grove preview stop <name>` | Stop specific preview server |

## Options

### `grove plant`

```bash
grove plant <branch> [name]

Options:
  -n, --new              Create a new branch
  -b, --base <branch>    Base branch for new branch (with -n)
  -s, --switch           Switch to the new tree after creating
  --no-install           Skip dependency installation
```

Examples:
```bash
# Create worktree for existing branch
grove plant feature-auth

# Create worktree with new branch based on main
grove plant -n feature-auth -b main

# Create and immediately switch to it
grove plant -n hotfix-123 --switch
```

### `grove preview`

```bash
grove preview <name> [more-names...]
grove preview all
grove preview --all
grove preview stop [names...]

Options:
  -d, --dev        Run in development mode (default)
  -b, --build      Build and serve in production mode
  --port <port>    Use a specific port (errors if unavailable)
  --all            Start previews for all trees
```

Examples:
```bash
grove preview feature-auth           # Starts dev server on an available port
grove preview feature-auth feature-payments
grove preview all                    # Start previews for all trees
grove preview feature-auth --port 4000
grove preview feature-auth --build   # Build then serve
grove preview stop                   # Stop all previews
grove preview stop feature-auth feature-payments
```

## Grove Merge Assist

Keep your feature trees in sync with their targets without manual `git worktree` juggling:

```bash
grove merge <sourceTree> <target>
```

- `<sourceTree>` is the tree name from `grove list` (e.g. `feature-auth`).
- `<target>` can be another tree name or any branch/ref (`main`, `release/1.2`, `origin/main`, etc.).

Grove will:

1. Spin up a temporary integration worktree tracking the source branch.
2. Merge or rebase the target ref into it.
3. Show a concise conflict digest if things go sideways.
4. Optionally apply the clean result back to the source tree so your AI session keeps flowing.

Common options:

| Flag | Purpose |
|------|---------|
| `-r, --rebase` / `--strategy <merge|rebase>` | Choose rebase instead of merge. |
| `--apply` | Fast-forward the source tree to the integrated commit (requires a clean tree). |
| `--keep-temp` | Leave the staging worktree on disk even after success. |
| `--no-fetch` | Skip fetching the target ref before merging (default fetches). |

Examples:

```bash
# Merge latest main into the feature tree and keep staging around for inspection
grove merge feature-auth main --keep-temp

# Rebase the feature tree onto release branch and apply the result back to the tree
grove merge feature-payments release/1.2 --rebase --apply

# Use JSON output for scripting
grove merge feature-auth main --json --no-fetch
```

If conflicts occur, Grove preserves the staging worktree path so you (or your AI assistant) can finish the resolution and rerun the command or push manually.

> Note: `--apply` requires the source tree to have no uncommitted changes.

### `grove ai`

```bash
grove ai <tool> <name> [args...]

Tools:
  claude   Start Claude Code in the worktree
  codex    Start Codex CLI in the worktree
  run      Run an arbitrary command in the worktree
```

Examples:
```bash
grove ai claude feature-auth
grove ai codex feature-auth
grove ai run feature-auth -- npm test
```

### `grove adopt`

```bash
grove adopt <path> [name]

Options:
  -s, --switch   Switch to the adopted tree after adopting
```

Examples:
```bash
grove adopt ../my-existing-worktree
grove adopt ../detached-worktree hotfix-123 --switch
```

### `grove prune`

```bash
grove prune [--dry-run]
```

Removes stale config entries for worktrees that no longer exist. Does not delete files.

### `grove doctor`

```bash
grove doctor [--fix]
```

Checks grove health (missing trees, stale previews, current symlink mismatch). With `--fix`, prunes stale entries and repairs `current`.

### `grove claude setup`

```bash
grove claude setup [--dry-run] [--force] [--no-settings]
```

Creates `.claude/skills/grove.md` in your repo and, if missing, a minimal `.claude/settings.local.json` that allows `Bash(grove:*)`.  
If settings already exist, Grove will not modify them and will print what to add.

### `grove open`

```bash
grove open <name>

Options:
  -e, --editor <editor>  Specify editor (cursor, code, zed, claude)
```

Examples:
```bash
# Auto-detect editor (prefers Cursor)
grove open feature-auth

# Explicitly use VS Code
grove open feature-auth --editor code
```

## Directory Structure

After running `grove init`, your project looks like:

```
your-project/
├── .grove/                    # Grove configuration (gitignored)
│   ├── config.json            # Grove settings and tree registry
│   ├── trees/                 # All worktrees live here
│   │   ├── feature-auth/      # A worktree for feature-auth branch
│   │   └── bugfix-123/        # A worktree for bugfix-123 branch
│   └── shared/
│       └── pnpm-store/        # Shared pnpm store (if using pnpm)
├── current -> .               # Symlink to active tree (defaults to main repo)
└── (your normal repo files)
```

### The "main" Tree

When you run `grove init`, grove registers your current repository directory as a special tree called `main`. This isn't a worktree—it's your original repo. The `main` tree:
- Always exists and cannot be removed with `grove uproot`
- Points to your original repository directory (not `.grove/trees/`)
- Is set as the initial `current` tree

Other trees created with `grove plant` are actual git worktrees stored in `.grove/trees/`.

## Smart Dependency Handling

grove detects your package manager (by looking for lockfiles) and optimizes dependency installation accordingly:

### pnpm (Recommended)
- Creates a shared store in `.grove/shared/pnpm-store`
- All worktrees share the same packages via hard links
- `pnpm install` is extremely fast because packages are already downloaded
- This is the most efficient option—consider switching to pnpm if you haven't already

### npm / yarn
- Compares lockfile hashes (SHA-256) between worktrees
- If lockfiles match exactly, creates a symlink from the existing worktree's `node_modules`
- If lockfiles differ, runs a fresh install (with `--prefer-offline` to use cached packages)
- Symlinked `node_modules` means zero disk usage for identical dependencies

### Skipping Installation
Use `--no-install` with `grove plant` if you want to manage dependencies yourself:
```bash
grove plant feature-x --no-install
```

## AI Tool Integration

### Claude Code

grove is designed to work seamlessly with Claude Code:

```bash
# Start Claude Code in a specific worktree
grove ai claude feature-auth

# This opens an interactive Claude session with:
# - Working directory set to the worktree
# - All your .claude/ settings preserved
# - CLAUDE.md context file available
```

### Codex CLI

```bash
grove ai codex feature-auth
```

### Generic command runner

```bash
grove ai run feature-auth -- <command> [args...]
```

All AI sessions inherit helpful environment variables:
- `GROVE_TREE` — Name of the current tree
- `GROVE_TREE_PATH` — Absolute path to the worktree
- `GROVE_BRANCH` — Git branch of the worktree
- `GROVE_ROOT` — Path to the grove root directory
- `GROVE_REPO` — Path to the main repository

### Cursor / VS Code

```bash
# Open worktree in Cursor (auto-detected)
grove open feature-auth

# Open in VS Code explicitly
grove open feature-auth -e code
```

### Preserved Configurations

When you `grove plant` a new worktree, these files and directories are automatically copied from the main repo:

**Directories:**
- `.claude/` — Claude Code settings, commands, and skills
- `.cursor/` — Cursor settings and rules
- `.vscode/` — VS Code settings
- `.zed/` — Zed settings
- `.idea/` — JetBrains IDE settings

**Files:**
- `.cursorrules` — Cursor rules file
- `.clauderules` — Claude rules file
- `CLAUDE.md` — Claude Code / Codex context documentation
- `cursor.json` — Cursor configuration

This ensures your AI tools and editors have the same context in every worktree without manual copying.

## Shell Integration

Add to your `.zshrc` or `.bashrc`:

```bash
# Quick cd to grove tree
gcd() {
  local path=$(grove path "$1" 2>/dev/null)
  if [ -n "$path" ]; then
    cd "$path"
  else
    echo "Tree '$1' not found"
  fi
}

# Tab completion for gcd (zsh)
_gcd() {
  local trees=$(grove list 2>/dev/null | grep -E '^\s*▸?\s*\w' | awk '{print $NF}')
  _arguments "1:tree:($trees)"
}
compdef _gcd gcd
```

Then:
```bash
gcd feature-auth  # Navigate to worktree
```

## Workflow Examples

### Parallel AI Development

Run multiple Claude Code instances on different features:

```bash
# Terminal 1
grove ai claude feature-auth

# Terminal 2
grove ai claude feature-payments

# Terminal 3 - Preview both (ports auto-assigned)
grove preview feature-auth feature-payments
```

### Quick Branch Comparison

```bash
# Create a worktree for your feature
grove plant feature-x

# Preview both branches side-by-side (ports auto-assigned)
grove preview main feature-x

# Open browser tabs to compare the URLs printed by grove
```

### Hotfix Workflow

```bash
# Create hotfix branch from main
grove plant -n hotfix-critical -b main --switch

# Work on it
grove open hotfix-critical

# When done, clean up
grove uproot hotfix-critical
```

## Framework Support

grove automatically detects your framework and uses appropriate commands and ports:

| Framework | Dev Command | Build Command | Default Port | Cache Directory |
|-----------|-------------|---------------|--------------|-----------------|
| Next.js | `next dev` | `next build` | 3000 | `.next/` |
| Vite | `vite` | `vite build` | 5173 | `.vite/` |
| Create React App | `react-scripts start` | `react-scripts build` | 3000 | — |
| Generic | `npm run dev` | `npm run build` | 3000 | — |

If your `package.json` has `dev`, `start`, `build`, or `serve` scripts, grove will use those instead of framework defaults.

## Configuration

Grove stores its configuration in `.grove/config.json`:

```json
{
  "version": 1,
  "repo": "/path/to/your/repo",
  "packageManager": "pnpm",
  "framework": "nextjs",
  "trees": {
    "main": {
      "branch": "main",
      "path": "/path/to/your/repo",
      "created": "2024-01-15T10:30:00.000Z"
    }
  },
  "current": "main",
  "previews": {}
}
```

## Publishing (For Maintainers)

Grove is currently in prototype phase. To publish a new version:

1. Ensure you are logged into npm (`npm login`) and the working tree is clean
2. Bump the version: `npm version prerelease --preid prototype`
3. Run tests: `npm run test`
4. Publish: `npm run release:prototype`

The package is published to npm under the `prototype` dist-tag (configured in `package.json`'s `publishConfig`).

## Requirements

**Required:**
- Node.js 18+
- Git 2.17+ (for `git worktree` support)
- A package manager: pnpm (recommended), npm, or yarn

**Optional (for AI/editor integration):**
- [Claude Code](https://claude.ai/claude-code) — for `grove ai claude` and `grove spawn`
- [Codex CLI](https://github.com/openai/codex) — for `grove ai codex`
- [Cursor](https://cursor.com), [VS Code](https://code.visualstudio.com), or [Zed](https://zed.dev) — for `grove open`

## License

MIT

## Contributing

Contributions welcome! To get started:

```bash
git clone https://github.com/blaiszik/grove.git
cd grove
npm install
npm run dev      # Watch mode for development
npm run test     # Run tests
npm link         # Install globally for testing
```

Please open an issue to discuss significant changes before submitting a PR.
