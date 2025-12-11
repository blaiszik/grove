import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { readConfig, resolveGroveRoot } from './config.js';

export type Editor = 'cursor' | 'code' | 'claude' | 'zed';

interface EditorConfig {
  command: string;
  args: string[];
  name: string;
}

const EDITORS: Record<Editor, EditorConfig> = {
  cursor: {
    command: 'cursor',
    args: ['.'],
    name: 'Cursor',
  },
  code: {
    command: 'code',
    args: ['.'],
    name: 'VS Code',
  },
  claude: {
    command: 'claude',
    args: [],
    name: 'Claude Code',
  },
  zed: {
    command: 'zed',
    args: ['.'],
    name: 'Zed',
  },
};

export async function detectAvailableEditors(): Promise<Editor[]> {
  const available: Editor[] = [];

  for (const [name, config] of Object.entries(EDITORS)) {
    try {
      await execa('which', [config.command]);
      available.push(name as Editor);
    } catch {
      // Editor not available
    }
  }

  return available;
}

export async function openInEditor(
  treeName: string,
  editor: Editor,
  cwd: string = process.cwd()
): Promise<void> {
  const groveRoot = await resolveGroveRoot(cwd);
  const configFile = await readConfig(groveRoot);
  const tree = configFile.trees[treeName];
  if (!tree) {
    throw new Error(`Tree '${treeName}' not found`);
  }
  const treePath = tree.path;
  const config = EDITORS[editor];

  if (!config) {
    throw new Error(`Unknown editor: ${editor}`);
  }

  // Verify tree exists
  if (!(await fs.pathExists(treePath))) {
    throw new Error(`Tree path does not exist: ${treePath}`);
  }

  // Launch editor in the worktree directory
  await execa(config.command, config.args, {
    cwd: treePath,
    detached: true,
    stdio: 'ignore',
  });
}

export async function spawnClaudeCode(
  treeName: string,
  cwd: string = process.cwd()
): Promise<void> {
  const groveRoot = await resolveGroveRoot(cwd);
  const configFile = await readConfig(groveRoot);
  const tree = configFile.trees[treeName];
  if (!tree) {
    throw new Error(`Tree '${treeName}' not found`);
  }
  const treePath = tree.path;

  // Verify tree exists
  if (!(await fs.pathExists(treePath))) {
    throw new Error(`Tree path does not exist: ${treePath}`);
  }

  // Spawn Claude Code in a new session
  // Using --yes to auto-accept any prompts
  const child = execa('claude', [], {
    cwd: treePath,
    stdio: 'inherit',
  });

  // Wait for it to complete (interactive session)
  await child;
}

// Files/directories to copy from the source repo to new worktrees
// These are tool-specific configurations that should be preserved
const CONFIG_DIRS_TO_COPY = [
  '.claude',           // Claude Code settings
  '.cursor',           // Cursor settings
  '.vscode',           // VS Code settings
  '.zed',              // Zed settings
  '.idea',             // JetBrains settings
];

const CONFIG_FILES_TO_COPY = [
  '.cursorrules',      // Cursor rules
  '.clauderules',      // Claude rules (if exists)
  'CLAUDE.md',         // Claude context file
  'cursor.json',       // Cursor config
];

export async function copyEditorConfigs(
  sourceDir: string,
  targetDir: string
): Promise<string[]> {
  const copied: string[] = [];

  // Copy config directories
  for (const dir of CONFIG_DIRS_TO_COPY) {
    const sourcePath = path.join(sourceDir, dir);
    const targetPath = path.join(targetDir, dir);

    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath, { overwrite: false });
      copied.push(dir);
    }
  }

  // Copy config files
  for (const file of CONFIG_FILES_TO_COPY) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath, { overwrite: false });
      copied.push(file);
    }
  }

  return copied;
}

export function getEditorName(editor: Editor): string {
  return EDITORS[editor]?.name || editor;
}

export function getSupportedEditors(): Editor[] {
  return Object.keys(EDITORS) as Editor[];
}
