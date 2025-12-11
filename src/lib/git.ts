import { execa } from 'execa';
import path from 'path';

export interface GitWorktree {
  path: string;
  head: string;
  branch: string | null;
}

export async function isGitRepo(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--git-dir'], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function getRepoRoot(cwd: string = process.cwd()): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--show-toplevel'], { cwd });
  return stdout.trim();
}

export async function getCurrentBranch(cwd: string = process.cwd()): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  return stdout.trim();
}

export async function branchExists(branch: string, cwd: string = process.cwd()): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--verify', branch], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function remoteBranchExists(branch: string, cwd: string = process.cwd()): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--verify', `origin/${branch}`], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function createWorktree(
  targetPath: string,
  branch: string,
  options: { createBranch?: boolean; baseBranch?: string } = {},
  cwd: string = process.cwd()
): Promise<void> {
  const args = ['worktree', 'add'];

  if (options.createBranch) {
    args.push('-b', branch);
    args.push(targetPath);
    if (options.baseBranch) {
      args.push(options.baseBranch);
    }
  } else {
    args.push(targetPath, branch);
  }

  await execa('git', args, { cwd });
}

export async function removeWorktree(
  targetPath: string,
  options: { force?: boolean } = {},
  cwd: string = process.cwd()
): Promise<void> {
  const args = ['worktree', 'remove'];
  if (options.force) {
    args.push('--force');
  }
  args.push(targetPath);

  await execa('git', args, { cwd });
}

export async function listWorktrees(cwd: string = process.cwd()): Promise<GitWorktree[]> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd });
  const worktrees: GitWorktree[] = [];
  let current: Partial<GitWorktree> = {};

  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current.path = line.slice(9);
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace('refs/heads/', '');
    } else if (line === 'detached') {
      current.branch = null;
    } else if (line === '') {
      if (current.path && current.head !== undefined) {
        worktrees.push(current as GitWorktree);
      }
      current = {};
    }
  }

  // Handle last entry if no trailing newline
  if (current.path && current.head !== undefined) {
    worktrees.push(current as GitWorktree);
  }

  return worktrees;
}

export async function fetchBranch(branch: string, cwd: string = process.cwd()): Promise<void> {
  await execa('git', ['fetch', 'origin', branch], { cwd });
}

export async function getGitDir(cwd: string = process.cwd()): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--git-dir'], { cwd });
  const gitDir = stdout.trim();
  return path.isAbsolute(gitDir) ? gitDir : path.join(cwd, gitDir);
}
