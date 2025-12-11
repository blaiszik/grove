#!/usr/bin/env node

// src/index.ts
import { program } from "commander";

// src/commands/init.ts
import fs4 from "fs-extra";
import path4 from "path";
import chalk from "chalk";
import ora from "ora";

// src/lib/config.ts
import fs from "fs-extra";
import path from "path";

// src/types.ts
var GROVE_DIR = ".grove";
var GROVE_CONFIG = "config.json";
var GROVE_TREES = "trees";
var GROVE_SHARED = "shared";
var CURRENT_LINK = "current";

// src/lib/config.ts
function getGroveDir(cwd = process.cwd()) {
  return path.join(cwd, GROVE_DIR);
}
function getConfigPath(cwd = process.cwd()) {
  return path.join(getGroveDir(cwd), GROVE_CONFIG);
}
function getTreesDir(cwd = process.cwd()) {
  return path.join(getGroveDir(cwd), GROVE_TREES);
}
function getSharedDir(cwd = process.cwd()) {
  return path.join(getGroveDir(cwd), GROVE_SHARED);
}
function getTreePath(name, cwd = process.cwd()) {
  return path.join(getTreesDir(cwd), name);
}
async function groveExists(cwd = process.cwd()) {
  return fs.pathExists(getConfigPath(cwd));
}
async function readConfig(cwd = process.cwd()) {
  const configPath = getConfigPath(cwd);
  if (!await fs.pathExists(configPath)) {
    throw new Error("Grove not initialized. Run `grove init` first.");
  }
  return fs.readJson(configPath);
}
async function writeConfig(config, cwd = process.cwd()) {
  const configPath = getConfigPath(cwd);
  await fs.writeJson(configPath, config, { spaces: 2 });
}
async function updateConfig(updater, cwd = process.cwd()) {
  const config = await readConfig(cwd);
  const updated = await updater(config);
  await writeConfig(updated, cwd);
  return updated;
}
function createDefaultConfig(repo) {
  return {
    version: 1,
    repo,
    packageManager: "npm",
    framework: "generic",
    trees: {},
    current: null,
    previews: {}
  };
}

// src/lib/git.ts
import { execa } from "execa";
async function isGitRepo(cwd = process.cwd()) {
  try {
    await execa("git", ["rev-parse", "--git-dir"], { cwd });
    return true;
  } catch {
    return false;
  }
}
async function getRepoRoot(cwd = process.cwd()) {
  const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"], { cwd });
  return stdout.trim();
}
async function getCurrentBranch(cwd = process.cwd()) {
  const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return stdout.trim();
}
async function branchExists(branch, cwd = process.cwd()) {
  try {
    await execa("git", ["rev-parse", "--verify", branch], { cwd });
    return true;
  } catch {
    return false;
  }
}
async function remoteBranchExists(branch, cwd = process.cwd()) {
  try {
    await execa("git", ["rev-parse", "--verify", `origin/${branch}`], { cwd });
    return true;
  } catch {
    return false;
  }
}
async function createWorktree(targetPath, branch, options = {}, cwd = process.cwd()) {
  const args = ["worktree", "add"];
  if (options.createBranch) {
    args.push("-b", branch);
    args.push(targetPath);
    if (options.baseBranch) {
      args.push(options.baseBranch);
    }
  } else {
    args.push(targetPath, branch);
  }
  await execa("git", args, { cwd });
}
async function removeWorktree(targetPath, options = {}, cwd = process.cwd()) {
  const args = ["worktree", "remove"];
  if (options.force) {
    args.push("--force");
  }
  args.push(targetPath);
  await execa("git", args, { cwd });
}
async function fetchBranch(branch, cwd = process.cwd()) {
  await execa("git", ["fetch", "origin", branch], { cwd });
}

// src/lib/deps.ts
import fs2 from "fs-extra";
import path2 from "path";
import { execa as execa2 } from "execa";
import crypto from "crypto";
var LOCKFILES = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm"
};
async function detectPackageManager(cwd = process.cwd()) {
  for (const [filename, manager] of Object.entries(LOCKFILES)) {
    if (await fs2.pathExists(path2.join(cwd, filename))) {
      return manager;
    }
  }
  return "npm";
}
async function getLockfileInfo(cwd = process.cwd()) {
  for (const [filename, manager] of Object.entries(LOCKFILES)) {
    const lockfilePath = path2.join(cwd, filename);
    if (await fs2.pathExists(lockfilePath)) {
      const content = await fs2.readFile(lockfilePath);
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      return { type: manager, path: lockfilePath, hash };
    }
  }
  return null;
}
async function installDependencies(manager, targetDir, options = {}) {
  const args = ["install"];
  if (manager === "pnpm" && options.useSharedStore && options.groveDir) {
    const storePath = path2.join(getSharedDir(options.groveDir), "pnpm-store");
    await fs2.ensureDir(storePath);
    args.push("--store-dir", storePath);
  }
  if (manager === "npm") {
    args.push("--prefer-offline");
  } else if (manager === "yarn") {
    args.push("--prefer-offline");
  } else if (manager === "pnpm") {
    args.push("--prefer-offline");
  }
  await execa2(manager, args, {
    cwd: targetDir,
    stdio: "inherit"
  });
}
async function canSymlinkNodeModules(sourceDir, targetDir) {
  const sourceLockfile = await getLockfileInfo(sourceDir);
  const targetLockfile = await getLockfileInfo(targetDir);
  if (!sourceLockfile || !targetLockfile) {
    return false;
  }
  return sourceLockfile.type === targetLockfile.type && sourceLockfile.hash === targetLockfile.hash;
}
async function symlinkNodeModules(sourceDir, targetDir) {
  const sourceModules = path2.join(sourceDir, "node_modules");
  const targetModules = path2.join(targetDir, "node_modules");
  if (!await fs2.pathExists(sourceModules)) {
    throw new Error(`Source node_modules not found: ${sourceModules}`);
  }
  if (await fs2.pathExists(targetModules)) {
    await fs2.remove(targetModules);
  }
  const relativePath = path2.relative(targetDir, sourceModules);
  await fs2.symlink(relativePath, targetModules);
}
async function hasNodeModules(dir) {
  return fs2.pathExists(path2.join(dir, "node_modules"));
}

// src/lib/framework.ts
import fs3 from "fs-extra";
import path3 from "path";
var FRAMEWORK_CONFIGS = {
  nextjs: {
    devCommand: "next dev",
    buildCommand: "next build",
    serveCommand: "next start",
    defaultPort: 3e3,
    cacheDir: ".next"
  },
  vite: {
    devCommand: "vite",
    buildCommand: "vite build",
    serveCommand: "vite preview",
    defaultPort: 5173,
    cacheDir: ".vite"
  },
  cra: {
    devCommand: "react-scripts start",
    buildCommand: "react-scripts build",
    serveCommand: "serve -s build",
    defaultPort: 3e3,
    cacheDir: null
  },
  generic: {
    devCommand: "npm run dev",
    buildCommand: "npm run build",
    serveCommand: "npm run start",
    defaultPort: 3e3,
    cacheDir: null
  }
};
async function detectFramework(cwd = process.cwd()) {
  const packageJsonPath = path3.join(cwd, "package.json");
  if (!await fs3.pathExists(packageJsonPath)) {
    return "generic";
  }
  try {
    const pkg = await fs3.readJson(packageJsonPath);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies
    };
    if (deps.next) {
      return "nextjs";
    }
    if (deps.vite) {
      return "vite";
    }
    if (deps["react-scripts"]) {
      return "cra";
    }
    return "generic";
  } catch {
    return "generic";
  }
}
async function getDevCommand(cwd = process.cwd()) {
  const packageJsonPath = path3.join(cwd, "package.json");
  if (await fs3.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs3.readJson(packageJsonPath);
      if (pkg.scripts?.dev) {
        return "npm run dev";
      }
      if (pkg.scripts?.start) {
        return "npm run start";
      }
    } catch {
    }
  }
  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].devCommand;
}
async function getBuildCommand(cwd = process.cwd()) {
  const packageJsonPath = path3.join(cwd, "package.json");
  if (await fs3.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs3.readJson(packageJsonPath);
      if (pkg.scripts?.build) {
        return "npm run build";
      }
    } catch {
    }
  }
  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].buildCommand;
}
async function getServeCommand(cwd = process.cwd()) {
  const packageJsonPath = path3.join(cwd, "package.json");
  if (await fs3.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs3.readJson(packageJsonPath);
      if (pkg.scripts?.start) {
        return "npm run start";
      }
      if (pkg.scripts?.serve) {
        return "npm run serve";
      }
    } catch {
    }
  }
  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].serveCommand;
}

// src/commands/init.ts
async function init() {
  const cwd = process.cwd();
  if (await groveExists(cwd)) {
    console.log(chalk.yellow("Grove is already initialized in this directory."));
    return;
  }
  if (!await isGitRepo(cwd)) {
    console.log(chalk.red("Error: Not a git repository."));
    console.log(chalk.gray("Run this command from within a git repository."));
    process.exit(1);
  }
  const spinner = ora("Initializing grove...").start();
  try {
    const repoRoot = await getRepoRoot(cwd);
    const currentBranch = await getCurrentBranch(cwd);
    const groveDir = getGroveDir(cwd);
    const treesDir = getTreesDir(cwd);
    const sharedDir = getSharedDir(cwd);
    await fs4.ensureDir(groveDir);
    await fs4.ensureDir(treesDir);
    await fs4.ensureDir(sharedDir);
    spinner.text = "Detecting project configuration...";
    const packageManager = await detectPackageManager(cwd);
    const framework = await detectFramework(cwd);
    const config = createDefaultConfig(repoRoot);
    config.packageManager = packageManager;
    config.framework = framework;
    const mainTreeName = "main";
    config.trees[mainTreeName] = {
      branch: currentBranch,
      path: repoRoot,
      // Point to the actual repo, not a worktree
      created: (/* @__PURE__ */ new Date()).toISOString()
    };
    config.current = mainTreeName;
    await writeConfig(config, cwd);
    const currentLinkPath = path4.join(cwd, "current");
    if (await fs4.pathExists(currentLinkPath)) {
      await fs4.remove(currentLinkPath);
    }
    await fs4.symlink(".", currentLinkPath);
    const gitignorePath = path4.join(cwd, ".gitignore");
    if (await fs4.pathExists(gitignorePath)) {
      const gitignore = await fs4.readFile(gitignorePath, "utf-8");
      if (!gitignore.includes(GROVE_DIR)) {
        await fs4.appendFile(gitignorePath, `
# Grove worktree manager
${GROVE_DIR}/
current
`);
      }
    } else {
      await fs4.writeFile(gitignorePath, `# Grove worktree manager
${GROVE_DIR}/
current
`);
    }
    spinner.succeed("Grove initialized!");
    console.log("");
    console.log(chalk.green("Created:"));
    console.log(chalk.gray(`  ${GROVE_DIR}/              Configuration directory`));
    console.log(chalk.gray(`  ${GROVE_DIR}/trees/        Worktree storage`));
    console.log(chalk.gray(`  current              Symlink to active tree`));
    console.log("");
    console.log(chalk.blue("Detected:"));
    console.log(chalk.gray(`  Package manager: ${packageManager}`));
    console.log(chalk.gray(`  Framework: ${framework}`));
    console.log("");
    console.log(chalk.cyan("Next steps:"));
    console.log(chalk.gray(`  grove plant <branch>     Create a new worktree`));
    console.log(chalk.gray(`  grove list               List all trees`));
    console.log(chalk.gray(`  grove tend <name>        Switch to a tree`));
  } catch (error) {
    spinner.fail("Failed to initialize grove");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/plant.ts
import chalk2 from "chalk";
import ora2 from "ora";

// src/lib/symlink.ts
import fs5 from "fs-extra";
import path5 from "path";
function getCurrentLinkPath(cwd = process.cwd()) {
  return path5.join(cwd, CURRENT_LINK);
}
async function createCurrentLink(treeName, cwd = process.cwd()) {
  const linkPath = getCurrentLinkPath(cwd);
  const targetPath = getTreePath(treeName, cwd);
  if (await fs5.pathExists(linkPath)) {
    await fs5.remove(linkPath);
  }
  const relativePath = path5.relative(cwd, targetPath);
  await fs5.symlink(relativePath, linkPath);
}
async function removeCurrentLink(cwd = process.cwd()) {
  const linkPath = getCurrentLinkPath(cwd);
  if (await fs5.pathExists(linkPath)) {
    await fs5.remove(linkPath);
  }
}
async function getCurrentTreeName(cwd = process.cwd()) {
  const linkPath = getCurrentLinkPath(cwd);
  try {
    const target = await fs5.readlink(linkPath);
    if (target === ".") {
      const config = await readConfig(cwd);
      for (const [name, tree] of Object.entries(config.trees)) {
        const normalizedTreePath = path5.resolve(tree.path);
        const normalizedCwd = path5.resolve(cwd);
        if (normalizedTreePath === normalizedCwd) {
          return name;
        }
      }
      return null;
    }
    const parts = target.split(path5.sep);
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

// src/lib/editor.ts
import { execa as execa3 } from "execa";
import fs6 from "fs-extra";
import path6 from "path";
var EDITORS = {
  cursor: {
    command: "cursor",
    args: ["."],
    name: "Cursor"
  },
  code: {
    command: "code",
    args: ["."],
    name: "VS Code"
  },
  claude: {
    command: "claude",
    args: [],
    name: "Claude Code"
  },
  zed: {
    command: "zed",
    args: ["."],
    name: "Zed"
  }
};
async function detectAvailableEditors() {
  const available = [];
  for (const [name, config] of Object.entries(EDITORS)) {
    try {
      await execa3("which", [config.command]);
      available.push(name);
    } catch {
    }
  }
  return available;
}
async function openInEditor(treeName, editor, cwd = process.cwd()) {
  const treePath = getTreePath(treeName, cwd);
  const config = EDITORS[editor];
  if (!config) {
    throw new Error(`Unknown editor: ${editor}`);
  }
  if (!await fs6.pathExists(treePath)) {
    throw new Error(`Tree path does not exist: ${treePath}`);
  }
  await execa3(config.command, config.args, {
    cwd: treePath,
    detached: true,
    stdio: "ignore"
  });
}
async function spawnClaudeCode(treeName, cwd = process.cwd()) {
  const treePath = getTreePath(treeName, cwd);
  if (!await fs6.pathExists(treePath)) {
    throw new Error(`Tree path does not exist: ${treePath}`);
  }
  const child = execa3("claude", [], {
    cwd: treePath,
    stdio: "inherit"
  });
  await child;
}
var CONFIG_DIRS_TO_COPY = [
  ".claude",
  // Claude Code settings
  ".cursor",
  // Cursor settings
  ".vscode",
  // VS Code settings
  ".zed",
  // Zed settings
  ".idea"
  // JetBrains settings
];
var CONFIG_FILES_TO_COPY = [
  ".cursorrules",
  // Cursor rules
  ".clauderules",
  // Claude rules (if exists)
  "CLAUDE.md",
  // Claude context file
  "cursor.json"
  // Cursor config
];
async function copyEditorConfigs(sourceDir, targetDir) {
  const copied = [];
  for (const dir of CONFIG_DIRS_TO_COPY) {
    const sourcePath = path6.join(sourceDir, dir);
    const targetPath = path6.join(targetDir, dir);
    if (await fs6.pathExists(sourcePath)) {
      await fs6.copy(sourcePath, targetPath, { overwrite: false });
      copied.push(dir);
    }
  }
  for (const file of CONFIG_FILES_TO_COPY) {
    const sourcePath = path6.join(sourceDir, file);
    const targetPath = path6.join(targetDir, file);
    if (await fs6.pathExists(sourcePath)) {
      await fs6.copy(sourcePath, targetPath, { overwrite: false });
      copied.push(file);
    }
  }
  return copied;
}
function getEditorName(editor) {
  return EDITORS[editor]?.name || editor;
}
function getSupportedEditors() {
  return Object.keys(EDITORS);
}

// src/commands/plant.ts
async function plant(branch, name, options) {
  const cwd = process.cwd();
  const treeName = name || branch.replace(/\//g, "-");
  const spinner = ora2(`Planting tree '${treeName}'...`).start();
  try {
    const config = await readConfig(cwd);
    if (config.trees[treeName]) {
      spinner.fail(`Tree '${treeName}' already exists`);
      console.log(chalk2.gray(`Use 'grove tend ${treeName}' to switch to it.`));
      process.exit(1);
    }
    const localExists = await branchExists(branch, config.repo);
    const remoteExists = await remoteBranchExists(branch, config.repo);
    const shouldCreate = options.new || !localExists && !remoteExists;
    if (!localExists && remoteExists && !options.new) {
      spinner.text = `Fetching branch '${branch}' from origin...`;
      await fetchBranch(branch, config.repo);
    }
    spinner.text = `Creating worktree for '${branch}'...`;
    const treePath = getTreePath(treeName, cwd);
    await createWorktree(
      treePath,
      branch,
      {
        createBranch: shouldCreate,
        baseBranch: options.base
      },
      config.repo
    );
    spinner.text = "Copying editor configurations...";
    const copiedConfigs = await copyEditorConfigs(config.repo, treePath);
    if (copiedConfigs.length > 0) {
      spinner.text = `Copied: ${copiedConfigs.join(", ")}`;
    }
    const shouldInstall = options.install !== false;
    if (shouldInstall) {
      spinner.text = "Setting up dependencies...";
      let sourceTree = null;
      for (const [existingName, tree] of Object.entries(config.trees)) {
        if (await hasNodeModules(tree.path)) {
          sourceTree = existingName;
          break;
        }
      }
      const manager = await detectPackageManager(treePath);
      if (manager === "pnpm") {
        spinner.text = "Installing dependencies with shared pnpm store...";
        await installDependencies(manager, treePath, {
          useSharedStore: true,
          groveDir: cwd
        });
      } else if (sourceTree) {
        const sourceTreePath = config.trees[sourceTree].path;
        const canSymlink = await canSymlinkNodeModules(sourceTreePath, treePath);
        if (canSymlink) {
          spinner.text = `Symlinking node_modules from '${sourceTree}'...`;
          await symlinkNodeModules(sourceTreePath, treePath);
        } else {
          spinner.text = "Installing dependencies...";
          await installDependencies(manager, treePath);
        }
      } else {
        spinner.text = "Installing dependencies...";
        await installDependencies(manager, treePath);
      }
    }
    await updateConfig((c) => ({
      ...c,
      trees: {
        ...c.trees,
        [treeName]: {
          branch,
          path: treePath,
          created: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    }), cwd);
    if (options.switch) {
      await createCurrentLink(treeName, cwd);
      await updateConfig((c) => ({
        ...c,
        current: treeName
      }), cwd);
    }
    spinner.succeed(`Planted tree '${treeName}'`);
    console.log("");
    console.log(chalk2.green("Tree details:"));
    console.log(chalk2.gray(`  Name:   ${treeName}`));
    console.log(chalk2.gray(`  Branch: ${branch}`));
    console.log(chalk2.gray(`  Path:   ${treePath}`));
    console.log("");
    if (copiedConfigs.length > 0) {
      console.log(chalk2.blue("Copied configs:"));
      console.log(chalk2.gray(`  ${copiedConfigs.join(", ")}`));
      console.log("");
    }
    if (options.switch) {
      console.log(chalk2.cyan(`Switched to '${treeName}'`));
    } else {
      console.log(chalk2.cyan("Next steps:"));
      console.log(chalk2.gray(`  grove open ${treeName}        Open in Cursor/VS Code`));
      console.log(chalk2.gray(`  grove spawn ${treeName}       Start Claude Code session`));
      console.log(chalk2.gray(`  grove tend ${treeName}        Switch current symlink`));
    }
  } catch (error) {
    spinner.fail("Failed to plant tree");
    console.error(chalk2.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/list.ts
import chalk3 from "chalk";

// src/lib/preview.ts
import { execa as execa4 } from "execa";
import detectPort from "detect-port";
import treeKill from "tree-kill";
var runningProcesses = /* @__PURE__ */ new Map();
async function findAvailablePort(startPort = 3e3) {
  return detectPort(startPort);
}
async function startPreview(treeName, mode, cwd = process.cwd()) {
  const config = await readConfig(cwd);
  const tree = config.trees[treeName];
  if (!tree) {
    throw new Error(`Tree '${treeName}' not found`);
  }
  if (config.previews[treeName]) {
    throw new Error(
      `Preview for '${treeName}' is already running on port ${config.previews[treeName].port}`
    );
  }
  const treePath = getTreePath(treeName, cwd);
  const defaultPort = FRAMEWORK_CONFIGS[config.framework].defaultPort;
  const port = await findAvailablePort(defaultPort);
  let command;
  let args;
  if (mode === "dev") {
    const devCmd = await getDevCommand(treePath);
    const parts = devCmd.split(" ");
    command = parts[0];
    args = [...parts.slice(1), "--port", String(port)];
  } else {
    const buildCmd = await getBuildCommand(treePath);
    const buildParts = buildCmd.split(" ");
    await execa4(buildParts[0], buildParts.slice(1), {
      cwd: treePath,
      stdio: "inherit"
    });
    const serveCmd = await getServeCommand(treePath);
    const serveParts = serveCmd.split(" ");
    command = serveParts[0];
    args = [...serveParts.slice(1), "--port", String(port)];
  }
  const child = execa4(command, args, {
    cwd: treePath,
    stdio: "inherit",
    detached: true
  });
  child.catch(() => {
    cleanupPreview(treeName, cwd).catch(() => {
    });
  });
  const pid = child.pid;
  runningProcesses.set(treeName, child);
  const previewInfo = {
    pid,
    port,
    mode,
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await updateConfig((c) => ({
    ...c,
    previews: {
      ...c.previews,
      [treeName]: previewInfo
    }
  }), cwd);
  return previewInfo;
}
async function stopPreview(treeName, cwd = process.cwd()) {
  const config = await readConfig(cwd);
  const preview2 = config.previews[treeName];
  if (!preview2) {
    throw new Error(`No preview running for '${treeName}'`);
  }
  await new Promise((resolve, reject) => {
    treeKill(preview2.pid, "SIGTERM", (err) => {
      if (err) {
        resolve();
      } else {
        resolve();
      }
    });
  });
  await cleanupPreview(treeName, cwd);
}
async function stopAllPreviews(cwd = process.cwd()) {
  const config = await readConfig(cwd);
  for (const treeName of Object.keys(config.previews)) {
    try {
      await stopPreview(treeName, cwd);
    } catch {
    }
  }
}
async function cleanupPreview(treeName, cwd = process.cwd()) {
  runningProcesses.delete(treeName);
  await updateConfig((c) => {
    const { [treeName]: _, ...remainingPreviews } = c.previews;
    return {
      ...c,
      previews: remainingPreviews
    };
  }, cwd);
}
async function getRunningPreviews(cwd = process.cwd()) {
  const config = await readConfig(cwd);
  return config.previews;
}
async function isPreviewRunning(treeName, cwd = process.cwd()) {
  const config = await readConfig(cwd);
  const preview2 = config.previews[treeName];
  if (!preview2) {
    return false;
  }
  try {
    process.kill(preview2.pid, 0);
    return true;
  } catch {
    await cleanupPreview(treeName, cwd);
    return false;
  }
}

// src/commands/list.ts
async function list() {
  const cwd = process.cwd();
  try {
    const config = await readConfig(cwd);
    const currentTree = await getCurrentTreeName(cwd);
    const previews = await getRunningPreviews(cwd);
    const trees = Object.entries(config.trees);
    if (trees.length === 0) {
      console.log(chalk3.yellow("No trees in the grove."));
      console.log(chalk3.gray("Run `grove plant <branch>` to create one."));
      return;
    }
    console.log(chalk3.bold("\nGrove Trees:\n"));
    const maxNameLen = Math.max(...trees.map(([name]) => name.length));
    const maxBranchLen = Math.max(...trees.map(([, info]) => info.branch.length));
    for (const [name, info] of trees) {
      const isCurrent = name === currentTree;
      const preview2 = previews[name];
      const isRunning = preview2 ? await isPreviewRunning(name, cwd) : false;
      const marker = isCurrent ? chalk3.green("\u25B8 ") : "  ";
      const nameStr = isCurrent ? chalk3.green(name.padEnd(maxNameLen)) : chalk3.white(name.padEnd(maxNameLen));
      const branchStr = chalk3.gray(info.branch.padEnd(maxBranchLen));
      let statusStr = "";
      if (isRunning && preview2) {
        statusStr = chalk3.cyan(` [preview :${preview2.port}]`);
      }
      console.log(`${marker}${nameStr}  ${branchStr}${statusStr}`);
    }
    console.log("");
    console.log(chalk3.gray(`Package manager: ${config.packageManager}`));
    console.log(chalk3.gray(`Framework: ${config.framework}`));
    console.log("");
  } catch (error) {
    console.error(chalk3.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/tend.ts
import chalk4 from "chalk";
import ora3 from "ora";
async function tend(name) {
  const cwd = process.cwd();
  const spinner = ora3(`Switching to '${name}'...`).start();
  try {
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      spinner.fail(`Tree '${name}' not found`);
      console.log("");
      console.log(chalk4.gray("Available trees:"));
      for (const treeName of Object.keys(config.trees)) {
        console.log(chalk4.gray(`  - ${treeName}`));
      }
      process.exit(1);
    }
    const currentTree = await getCurrentTreeName(cwd);
    if (currentTree === name) {
      spinner.info(`Already on '${name}'`);
      return;
    }
    await createCurrentLink(name, cwd);
    await updateConfig((c) => ({
      ...c,
      current: name
    }), cwd);
    const tree = config.trees[name];
    spinner.succeed(`Now tending '${name}'`);
    console.log("");
    console.log(chalk4.gray(`  Branch: ${tree.branch}`));
    console.log(chalk4.gray(`  Path:   ${tree.path}`));
    console.log("");
    console.log(chalk4.cyan("The `current` symlink now points to this tree."));
  } catch (error) {
    spinner.fail("Failed to switch tree");
    console.error(chalk4.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/uproot.ts
import chalk5 from "chalk";
import ora4 from "ora";
import path7 from "path";
import fs7 from "fs-extra";
async function uproot(name, options) {
  const cwd = process.cwd();
  const spinner = ora4(`Uprooting '${name}'...`).start();
  try {
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      spinner.fail(`Tree '${name}' not found`);
      process.exit(1);
    }
    const tree = config.trees[name];
    const treesDir = getTreesDir(cwd);
    const isRealWorktree = tree.path.startsWith(treesDir);
    if (!isRealWorktree) {
      spinner.fail(`Cannot uproot '${name}' - it's the main repository`);
      console.log(chalk5.gray("The main tree represents your original repository."));
      console.log(chalk5.gray("You can only uproot worktrees created with `grove plant`."));
      process.exit(1);
    }
    const currentTree = await getCurrentTreeName(cwd);
    const isCurrent = currentTree === name;
    if (isCurrent && Object.keys(config.trees).length === 1) {
      spinner.fail("Cannot uproot the last tree in the grove");
      console.log(chalk5.gray("At least one tree must remain."));
      process.exit(1);
    }
    if (await isPreviewRunning(name, cwd)) {
      spinner.text = "Stopping preview server...";
      await stopPreview(name, cwd);
    }
    spinner.text = "Removing worktree...";
    await removeWorktree(tree.path, { force: options.force }, config.repo);
    await updateConfig((c) => {
      const { [name]: _, ...remainingTrees } = c.trees;
      return {
        ...c,
        trees: remainingTrees,
        current: c.current === name ? null : c.current
      };
    }, cwd);
    if (isCurrent) {
      const remainingTrees = Object.keys(config.trees).filter((t) => t !== name);
      if (remainingTrees.length > 0) {
        const newCurrent = remainingTrees[0];
        const newTreePath = config.trees[newCurrent].path;
        const currentLinkPath = path7.join(cwd, "current");
        try {
          await fs7.lstat(currentLinkPath);
          await fs7.unlink(currentLinkPath);
        } catch {
        }
        const relativePath = path7.relative(cwd, newTreePath) || ".";
        await fs7.symlink(relativePath, currentLinkPath);
        await updateConfig((c) => ({
          ...c,
          current: newCurrent
        }), cwd);
        spinner.succeed(`Uprooted '${name}', switched to '${newCurrent}'`);
      } else {
        await removeCurrentLink(cwd);
        spinner.succeed(`Uprooted '${name}'`);
      }
    } else {
      spinner.succeed(`Uprooted '${name}'`);
    }
    console.log("");
    console.log(chalk5.gray(`  Branch: ${tree.branch}`));
    console.log(chalk5.gray(`  Path:   ${tree.path} (removed)`));
  } catch (error) {
    spinner.fail("Failed to uproot tree");
    console.error(chalk5.red(error instanceof Error ? error.message : String(error)));
    if (!options.force) {
      console.log("");
      console.log(chalk5.yellow("Tip: Use --force to force removal"));
    }
    process.exit(1);
  }
}

// src/commands/preview.ts
import chalk6 from "chalk";
import ora5 from "ora";
async function preview(action, name, options) {
  const cwd = process.cwd();
  if (action === "stop") {
    if (name) {
      await stopTree(name, cwd);
    } else {
      await stopAll(cwd);
    }
    return;
  }
  const treeName = action;
  await startTree(treeName, options, cwd);
}
async function startTree(name, options, cwd) {
  const spinner = ora5(`Starting preview for '${name}'...`).start();
  try {
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      spinner.fail(`Tree '${name}' not found`);
      process.exit(1);
    }
    if (await isPreviewRunning(name, cwd)) {
      const preview2 = config.previews[name];
      spinner.info(`Preview for '${name}' is already running on port ${preview2.port}`);
      console.log("");
      console.log(chalk6.cyan(`  http://localhost:${preview2.port}`));
      return;
    }
    const mode = options.build ? "build" : "dev";
    spinner.text = mode === "build" ? "Building and starting server..." : "Starting dev server...";
    const previewInfo = await startPreview(name, mode, cwd);
    spinner.succeed(`Preview started for '${name}'`);
    console.log("");
    console.log(chalk6.green("Server running:"));
    console.log(chalk6.cyan(`  http://localhost:${previewInfo.port}`));
    console.log("");
    console.log(chalk6.gray(`Mode: ${mode}`));
    console.log(chalk6.gray(`PID: ${previewInfo.pid}`));
    console.log("");
    console.log(chalk6.yellow("Press Ctrl+C to stop the server"));
  } catch (error) {
    spinner.fail("Failed to start preview");
    console.error(chalk6.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
async function stopTree(name, cwd) {
  const spinner = ora5(`Stopping preview for '${name}'...`).start();
  try {
    if (!await isPreviewRunning(name, cwd)) {
      spinner.info(`No preview running for '${name}'`);
      return;
    }
    await stopPreview(name, cwd);
    spinner.succeed(`Stopped preview for '${name}'`);
  } catch (error) {
    spinner.fail("Failed to stop preview");
    console.error(chalk6.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
async function stopAll(cwd) {
  const spinner = ora5("Stopping all previews...").start();
  try {
    const config = await readConfig(cwd);
    const runningCount = Object.keys(config.previews).length;
    if (runningCount === 0) {
      spinner.info("No previews running");
      return;
    }
    await stopAllPreviews(cwd);
    spinner.succeed(`Stopped ${runningCount} preview(s)`);
  } catch (error) {
    spinner.fail("Failed to stop previews");
    console.error(chalk6.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/status.ts
import chalk7 from "chalk";
async function status() {
  const cwd = process.cwd();
  try {
    const config = await readConfig(cwd);
    const currentTree = await getCurrentTreeName(cwd);
    const previews = await getRunningPreviews(cwd);
    console.log(chalk7.bold("\nGrove Status\n"));
    console.log(chalk7.white("Current Tree:"));
    if (currentTree && config.trees[currentTree]) {
      const tree = config.trees[currentTree];
      console.log(chalk7.green(`  ${currentTree}`));
      console.log(chalk7.gray(`  Branch: ${tree.branch}`));
      console.log(chalk7.gray(`  Path: ./current`));
    } else {
      console.log(chalk7.yellow("  None selected"));
    }
    console.log("");
    console.log(chalk7.white("Running Previews:"));
    const previewEntries = Object.entries(previews);
    if (previewEntries.length === 0) {
      console.log(chalk7.gray("  No previews running"));
    } else {
      for (const [name, preview2] of previewEntries) {
        const running = await isPreviewRunning(name, cwd);
        if (running) {
          console.log(
            chalk7.cyan(`  ${name}`) + chalk7.gray(` \u2192 http://localhost:${preview2.port}`) + chalk7.gray(` (${preview2.mode})`)
          );
        }
      }
    }
    console.log("");
    const treeCount = Object.keys(config.trees).length;
    const runningCount = previewEntries.filter(
      async ([name]) => await isPreviewRunning(name, cwd)
    ).length;
    console.log(chalk7.white("Summary:"));
    console.log(chalk7.gray(`  Trees: ${treeCount}`));
    console.log(chalk7.gray(`  Previews running: ${runningCount}`));
    console.log(chalk7.gray(`  Package manager: ${config.packageManager}`));
    console.log(chalk7.gray(`  Framework: ${config.framework}`));
    console.log("");
  } catch (error) {
    console.error(chalk7.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/open.ts
import chalk8 from "chalk";
import ora6 from "ora";
async function open(name, options) {
  const cwd = process.cwd();
  try {
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      console.log(chalk8.red(`Tree '${name}' not found`));
      console.log("");
      console.log(chalk8.gray("Available trees:"));
      for (const treeName of Object.keys(config.trees)) {
        console.log(chalk8.gray(`  - ${treeName}`));
      }
      process.exit(1);
    }
    let editor;
    if (options.editor) {
      const supported = getSupportedEditors();
      if (!supported.includes(options.editor)) {
        console.log(chalk8.red(`Unknown editor: ${options.editor}`));
        console.log(chalk8.gray(`Supported: ${supported.join(", ")}`));
        process.exit(1);
      }
      editor = options.editor;
    } else {
      const available = await detectAvailableEditors();
      if (available.length === 0) {
        console.log(chalk8.red("No supported editors found"));
        console.log(chalk8.gray("Install one of: cursor, code (VS Code), claude, zed"));
        process.exit(1);
      }
      const preferenceOrder = ["cursor", "claude", "code", "zed"];
      editor = preferenceOrder.find((e) => available.includes(e)) || available[0];
    }
    const spinner = ora6(`Opening '${name}' in ${getEditorName(editor)}...`).start();
    await openInEditor(name, editor, cwd);
    const treePath = getTreePath(name, cwd);
    spinner.succeed(`Opened '${name}' in ${getEditorName(editor)}`);
    console.log("");
    console.log(chalk8.gray(`  Path: ${treePath}`));
    console.log(chalk8.gray(`  Branch: ${config.trees[name].branch}`));
  } catch (error) {
    console.error(chalk8.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/spawn.ts
import chalk9 from "chalk";
async function spawn(name) {
  const cwd = process.cwd();
  try {
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      console.log(chalk9.red(`Tree '${name}' not found`));
      console.log("");
      console.log(chalk9.gray("Available trees:"));
      for (const treeName of Object.keys(config.trees)) {
        console.log(chalk9.gray(`  - ${treeName}`));
      }
      process.exit(1);
    }
    const treePath = getTreePath(name, cwd);
    const tree = config.trees[name];
    console.log(chalk9.cyan(`Spawning Claude Code in '${name}'...`));
    console.log(chalk9.gray(`  Path: ${treePath}`));
    console.log(chalk9.gray(`  Branch: ${tree.branch}`));
    console.log("");
    await spawnClaudeCode(name, cwd);
    console.log("");
    console.log(chalk9.gray("Claude Code session ended."));
  } catch (error) {
    console.error(chalk9.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// src/commands/path.ts
async function getPath(name) {
  const cwd = process.cwd();
  try {
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      console.error(`Tree '${name}' not found`);
      process.exit(1);
    }
    const treePath = getTreePath(name, cwd);
    console.log(treePath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// src/index.ts
program.name("grove").description("Git worktree manager with smart dependency handling").version("1.0.0");
program.command("init").description("Initialize grove in current repository").action(init);
program.command("plant <branch> [name]").description("Create a new worktree (plant a tree)").option("-n, --new", "Create a new branch").option("-b, --base <branch>", "Base branch for new branch").option("--no-install", "Skip dependency installation").option("-s, --switch", "Switch to the new tree after creating").action(plant);
program.command("tend <name>").description("Switch to a worktree (tend to a tree)").action(tend);
program.command("list").alias("ls").description("List all trees in the grove").action(list);
program.command("uproot <name>").description("Remove a worktree").option("-f, --force", "Force removal even with uncommitted changes").action(uproot);
program.command("open <name>").description("Open a worktree in Cursor, VS Code, or other editor").option("-e, --editor <editor>", "Specify editor (cursor, code, zed)").action(open);
program.command("spawn <name>").description("Start an interactive Claude Code session in a worktree").action(spawn);
program.command("path <name>").description("Print the path to a worktree (for shell integration)").action(getPath);
program.command("preview <action> [name]").description('Start/stop preview server (action: tree name or "stop")').option("-d, --dev", "Run in development mode (default)").option("-b, --build", "Build and serve in production mode").action(preview);
program.command("status").description("Show grove status and running previews").action(status);
program.addHelpText("after", `

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
//# sourceMappingURL=index.js.map