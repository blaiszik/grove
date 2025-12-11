# Grove - Project Context

This is **grove**, a git worktree manager CLI built with TypeScript/Node.js.

## Project Structure

```
src/
├── index.ts           # CLI entry point (commander.js)
├── types.ts           # TypeScript interfaces and constants
├── commands/          # Command implementations
│   ├── init.ts        # grove init
│   ├── plant.ts       # grove plant
│   ├── tend.ts        # grove tend
│   ├── list.ts        # grove list
│   ├── uproot.ts      # grove uproot
│   ├── open.ts        # grove open
│   ├── spawn.ts       # grove spawn
│   ├── path.ts        # grove path
│   ├── preview.ts     # grove preview
│   └── status.ts      # grove status
└── lib/               # Shared utilities
    ├── config.ts      # Config management (.grove/config.json)
    ├── git.ts         # Git operations wrapper
    ├── deps.ts        # Dependency management (pnpm/npm/yarn)
    ├── symlink.ts     # Symlink management
    ├── editor.ts      # Editor integration (Cursor, VS Code, Claude)
    ├── framework.ts   # Framework detection (Next.js, Vite, etc.)
    └── preview.ts     # Preview server management
```

## Key Concepts

- **Tree**: A git worktree managed by grove, stored in `.grove/trees/`
- **Grove**: The collection of worktrees for a repository
- **Current**: A symlink pointing to the active worktree

## Build & Test

```bash
npm install          # Install dependencies
npm run build        # Build with tsup
npm run dev          # Watch mode
npm link             # Install globally for testing
```

## Dependencies

- `commander` - CLI framework
- `execa` - Shell command execution
- `fs-extra` - Enhanced file operations
- `chalk` - Terminal colors
- `ora` - Spinners
- `detect-port` - Find available ports
- `tree-kill` - Kill process trees

## Design Decisions

1. **ESM-only**: Uses ES modules throughout
2. **No runtime deps in worktrees**: Grove itself doesn't need to be installed in managed repos
3. **Config in .grove/**: All grove data is in one gitignored directory
4. **Symlink-based switching**: `grove tend` updates symlink, no file copying
5. **pnpm-first**: Optimized for pnpm's shared store, falls back for npm/yarn

## Common Development Tasks

When adding a new command:
1. Create `src/commands/newcommand.ts`
2. Export the handler function
3. Register in `src/index.ts` with commander
4. Rebuild with `npm run build`

When modifying config schema:
1. Update `GroveConfig` interface in `src/types.ts`
2. Handle migration if needed in `src/lib/config.ts`
