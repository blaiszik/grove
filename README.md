# grove

A git worktree manager with smart dependency handling, designed for AI-assisted development workflows.

**grove** solves the friction of working with multiple git branches simultaneously—especially for JavaScript/TypeScript projects where `node_modules` makes switching expensive.

## Why grove?

Existing worktree tools require you to run `npm install` in every worktree, duplicating gigabytes of dependencies. grove fixes this:

- **Smart dependency sharing** — Uses pnpm's global store or symlinks `node_modules` when lockfiles match
- **AI tool integration** — First-class support for Claude Code, Codex CLI, Cursor, and VS Code
- **Preview servers** — Run multiple branches simultaneously on different ports
- **Config preservation** — Automatically copies `.claude/`, `.cursor/`, `CLAUDE.md` to new worktrees
- **Run from anywhere** — Commands work inside any worktree; grove auto-detects the grove root

## Screenshot

![Grove CLI in action](docs/screenshot.png)

## Installation

```bash
# Clone and install globally
git clone https://github.com/yourusername/grove.git
cd grove
npm install
npm run build
npm link

# Or install the published prototype tag (when available)
npm install -g grove-cli@prototype
```

## Quick Start

```bash
# Initialize grove in your repo
cd your-project
grove init

# Create a worktree for a feature branch
grove plant feature-auth

# Open it in Cursor
grove open feature-auth

# Start an AI session directly in the worktree
grove ai claude feature-auth
# or
grove ai codex feature-auth

# List all your trees
grove list
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
│   ├── config.json            # Grove settings
│   ├── trees/                 # All worktrees live here
│   │   ├── feature-auth/
│   │   └── bugfix-123/
│   └── shared/
│       └── pnpm-store/        # Shared pnpm store (if using pnpm)
├── current -> .                 # Symlink to active tree (defaults to main repo)
└── (your normal repo files)
```

## Smart Dependency Handling

grove detects your package manager and optimizes accordingly:

### pnpm (Recommended)
- Creates a shared store in `.grove/shared/pnpm-store`
- All worktrees share the same packages via hard links
- `pnpm install` is fast because packages are already cached

### npm / yarn
- Compares lockfile hashes between worktrees
- If lockfiles match, symlinks `node_modules` from existing worktree
- If lockfiles differ, runs fresh install

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

All AI sessions inherit helpful environment variables like `GROVE_TREE`, `GROVE_TREE_PATH`, and `GROVE_REPO`.

### Cursor / VS Code

```bash
# Open worktree in Cursor (auto-detected)
grove open feature-auth

# Open in VS Code explicitly
grove open feature-auth -e code
```

### Preserved Configurations

When you `grove plant` a new worktree, these files are automatically copied:

- `.claude/` — Claude Code settings and commands
- `.cursor/` — Cursor settings
- `.vscode/` — VS Code settings
- `.zed/` — Zed settings
- `.idea/` — JetBrains settings
- `.cursorrules` — Cursor rules file
- `.clauderules` — Claude rules file (if present)
- `CLAUDE.md` — Claude/Codex context documentation
- `cursor.json` — Cursor config file

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

# Terminal 3 - Preview both
grove preview feature-auth      # Runs on :3000
grove preview feature-payments  # Runs on :3001
```

### Quick Branch Comparison

```bash
# Create a worktree for your feature
grove plant feature-x

# Preview both
grove preview main        # :3000
grove preview feature-x   # :3001

# Open browser tabs to compare
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

grove detects and handles framework-specific needs:

| Framework | Dev Command | Cache Directory |
|-----------|-------------|-----------------|
| Next.js | `next dev` | `.next/` |
| Vite | `vite` | `.vite/` |
| Create React App | `react-scripts start` | — |
| Generic | `npm run dev` | — |

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

## Publishing (Prototype Tag)

Until Grove reaches a stable release, publish builds to npm under the `prototype` dist-tag. Steps:

1. Ensure you are logged into npm (`npm login`) and the working tree is clean.
2. Bump the version if needed (`npm version prerelease --preid prototype` or similar).
3. Run the full test suite: `npm run test`.
4. Publish with the helper script: `npm run release:prototype`.

The script runs tests again for safety and then executes `npm publish --tag prototype`. Because `package.json` includes `publishConfig.tag = "prototype"`, publishing without the script also defaults to that tag. Consumers can install via `npm install -g grove-cli@prototype`.

## Requirements

- Node.js 18+
- Git 2.17+ (for worktree support)
- One of: pnpm, npm, or yarn
- Optional AI tools for `grove ai`: `claude`, `codex`, or Cursor/VS Code for `grove open`

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
