import fs from 'fs-extra';
import path from 'path';
import { Framework } from '../types.js';

interface FrameworkConfig {
  devCommand: string;
  buildCommand: string;
  serveCommand: string;
  defaultPort: number;
  cacheDir: string | null;
}

export const FRAMEWORK_CONFIGS: Record<Framework, FrameworkConfig> = {
  nextjs: {
    devCommand: 'next dev',
    buildCommand: 'next build',
    serveCommand: 'next start',
    defaultPort: 3000,
    cacheDir: '.next',
  },
  vite: {
    devCommand: 'vite',
    buildCommand: 'vite build',
    serveCommand: 'vite preview',
    defaultPort: 5173,
    cacheDir: '.vite',
  },
  cra: {
    devCommand: 'react-scripts start',
    buildCommand: 'react-scripts build',
    serveCommand: 'serve -s build',
    defaultPort: 3000,
    cacheDir: null,
  },
  generic: {
    devCommand: 'npm run dev',
    buildCommand: 'npm run build',
    serveCommand: 'npm run start',
    defaultPort: 3000,
    cacheDir: null,
  },
};

export async function detectFramework(cwd: string = process.cwd()): Promise<Framework> {
  const packageJsonPath = path.join(cwd, 'package.json');

  if (!(await fs.pathExists(packageJsonPath))) {
    return 'generic';
  }

  try {
    const pkg = await fs.readJson(packageJsonPath);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    // Check for Next.js
    if (deps.next) {
      return 'nextjs';
    }

    // Check for Vite
    if (deps.vite) {
      return 'vite';
    }

    // Check for Create React App
    if (deps['react-scripts']) {
      return 'cra';
    }

    return 'generic';
  } catch {
    return 'generic';
  }
}

export function getFrameworkConfig(framework: Framework): FrameworkConfig {
  return FRAMEWORK_CONFIGS[framework];
}

export async function getDevCommand(cwd: string = process.cwd()): Promise<string> {
  const packageJsonPath = path.join(cwd, 'package.json');

  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.scripts?.dev) {
        return 'npm run dev';
      }
      if (pkg.scripts?.start) {
        return 'npm run start';
      }
    } catch {
      // Fall through to framework detection
    }
  }

  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].devCommand;
}

export async function getBuildCommand(cwd: string = process.cwd()): Promise<string> {
  const packageJsonPath = path.join(cwd, 'package.json');

  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.scripts?.build) {
        return 'npm run build';
      }
    } catch {
      // Fall through to framework detection
    }
  }

  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].buildCommand;
}

export async function getServeCommand(cwd: string = process.cwd()): Promise<string> {
  const packageJsonPath = path.join(cwd, 'package.json');

  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.scripts?.start) {
        return 'npm run start';
      }
      if (pkg.scripts?.serve) {
        return 'npm run serve';
      }
    } catch {
      // Fall through to framework detection
    }
  }

  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].serveCommand;
}

export async function clearFrameworkCache(
  cwd: string,
  framework: Framework
): Promise<void> {
  const config = FRAMEWORK_CONFIGS[framework];
  if (config.cacheDir) {
    const cachePath = path.join(cwd, config.cacheDir);
    if (await fs.pathExists(cachePath)) {
      await fs.remove(cachePath);
    }
  }
}
