# Initial commit

# grove

A git worktree manager with smart dependency handling, designed for AI-assisted development workflows.

**grove** solves the friction of working with multiple git branches simultaneously—especially for JavaScript/TypeScript projects where `node_modules` makes switching expensive.

## Why grove?

Existing worktree tools require you to run `npm install` in every worktree, duplicating gigabytes of dependencies. grove fixes this:

- **Smart dependency sharing** — Uses pnpm's global store or symlinks `node_modules` when lockfiles match
- **AI tool integration** — First-class support for Claude Code, Cursor, and VS Code
- **Preview servers** — Run multiple branches simultaneously on different ports
- **Config preservation** — Automatically copies `.claude/`, `.cursor/`, `CLAUDE.md` to new worktrees

## Installation

```bash
# Clone and install globally
git clone https://github.com/yourusername/grove.git
cd grove
npm install
npm run build
npm link

# Or install from npm (when published)
npm install -g grove-cli
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

# Or start Claude Code directly in the worktree
grove spawn feature-auth

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
| `grove list` | List all worktrees |
| `grove uproot <name>` | Remove a worktree |
| `grove status` | Show grove status and running previews |

### AI Coding Integration

| Command | Description |
|---------|-------------|
| `grove open <name>` | Open worktree in Cursor, VS Code, or Zed |
| `grove spawn <name>` | Start interactive Claude Code session in worktree |
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
│   │   ├── main/
│   │   ├── feature-auth/
│   │   └── bugfix-123/
│   └── shared/
│       └── pnpm-store/        # Shared pnpm store (if using pnpm)
├── current -> .grove/trees/main  # Symlink to active worktree
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
grove spawn feature-auth

# This opens an interactive Claude session with:
# - Working directory set to the worktree
# - All your .claude/ settings preserved
# - CLAUDE.md context file available
```

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
- `.cursorrules` — Cursor rules file
- `CLAUDE.md` — Claude context documentation
- `.vscode/` — VS Code settings
- `.zed/` — Zed settings

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
grove spawn feature-auth

# Terminal 2
grove spawn feature-payments

# Terminal 3 - Preview both
grove preview feature-auth      # Runs on :3000
grove preview feature-payments  # Runs on :3001
```

### Quick Branch Comparison

```bash
# Create worktrees for comparison
grove plant main
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
      "path": "/path/to/repo/.grove/trees/main",
      "created": "2024-01-15T10:30:00.000Z"
    }
  },
  "current": "main",
  "previews": {}
}
```

## Requirements

- Node.js 18+
- Git 2.17+ (for worktree support)
- One of: pnpm, npm, or yarn

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
