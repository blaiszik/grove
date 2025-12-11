export type PackageManager = 'pnpm' | 'npm' | 'yarn';
export type Framework = 'nextjs' | 'vite' | 'cra' | 'generic';

export interface TreeInfo {
  branch: string;
  path: string;
  created: string;
}

export interface PreviewInfo {
  pid: number;
  port: number;
  mode: 'dev' | 'build';
  startedAt: string;
}

export interface GroveConfig {
  version: 1;
  repo: string;
  packageManager: PackageManager;
  framework: Framework;
  trees: Record<string, TreeInfo>;
  current: string | null;
  previews: Record<string, PreviewInfo>;
}

export interface DetectedProject {
  packageManager: PackageManager;
  framework: Framework;
  hasPackageJson: boolean;
  lockfile: string | null;
}

export const GROVE_DIR = '.grove';
export const GROVE_CONFIG = 'config.json';
export const GROVE_TREES = 'trees';
export const GROVE_SHARED = 'shared';
export const CURRENT_LINK = 'current';
