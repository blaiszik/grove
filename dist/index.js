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
import { execa } from "execa";

// src/types.ts
var GROVE_DIR = ".grove";
var GROVE_CONFIG = "config.json";
var GROVE_TREES = "trees";
var GROVE_SHARED = "shared";
var CURRENT_LINK = "current";

// src/lib/config.ts
async function findGroveRoot(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  while (true) {
    const candidate = path.join(dir, GROVE_DIR, GROVE_CONFIG);
    if (await fs.pathExists(candidate)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  try {
    const { stdout } = await execa("git", ["rev-parse", "--git-common-dir"], { cwd });
    const commonDir = stdout.trim();
    const commonAbs = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    const commonParent = path.dirname(commonAbs);
    const candidate = path.join(commonParent, GROVE_DIR, GROVE_CONFIG);
    if (await fs.pathExists(candidate)) {
      return commonParent;
    }
  } catch {
  }
  return null;
}
async function resolveGroveRoot(cwd = process.cwd()) {
  const root = await findGroveRoot(cwd);
  if (!root) {
    throw new Error("Grove not initialized. Run `grove init` first.");
  }
  return root;
}
function assertValidTreeName(name) {
  if (!name || name.trim() !== name) {
    throw new Error(`Invalid tree name '${name}'.`);
  }
  if (name === "." || name === "..") {
    throw new Error(`Invalid tree name '${name}'.`);
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new Error(`Invalid tree name '${name}': path separators are not allowed.`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(
      `Invalid tree name '${name}': only letters, numbers, '.', '_' and '-' are allowed.`
    );
  }
}
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
  const root = await findGroveRoot(cwd);
  return root ? fs.pathExists(getConfigPath(root)) : false;
}
async function readConfig(cwd = process.cwd()) {
  const root = await resolveGroveRoot(cwd);
  const configPath = getConfigPath(root);
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
  const root = await resolveGroveRoot(cwd);
  const config = await readConfig(root);
  const updated = await updater(config);
  await writeConfig(updated, root);
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
import { execa as execa2 } from "execa";
async function isGitRepo(cwd = process.cwd()) {
  try {
    await execa2("git", ["rev-parse", "--git-dir"], { cwd });
    return true;
  } catch {
    return false;
  }
}
async function getRepoRoot(cwd = process.cwd()) {
  const { stdout } = await execa2("git", ["rev-parse", "--show-toplevel"], { cwd });
  return stdout.trim();
}
async function getCurrentBranch(cwd = process.cwd()) {
  const { stdout } = await execa2("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return stdout.trim();
}
async function branchExists(branch, cwd = process.cwd()) {
  try {
    await execa2("git", ["rev-parse", "--verify", branch], { cwd });
    return true;
  } catch {
    return false;
  }
}
async function remoteBranchExists(branch, cwd = process.cwd()) {
  try {
    await execa2("git", ["rev-parse", "--verify", `origin/${branch}`], { cwd });
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
  await execa2("git", args, { cwd });
}
async function removeWorktree(targetPath, options = {}, cwd = process.cwd()) {
  const args = ["worktree", "remove"];
  if (options.force) {
    args.push("--force");
  }
  args.push(targetPath);
  await execa2("git", args, { cwd });
}
async function listWorktrees(cwd = process.cwd()) {
  const { stdout } = await execa2("git", ["worktree", "list", "--porcelain"], { cwd });
  const worktrees = [];
  let current = {};
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      current.path = line.slice(9);
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).replace("refs/heads/", "");
    } else if (line === "detached") {
      current.branch = null;
    } else if (line === "") {
      if (current.path && current.head !== void 0) {
        worktrees.push(current);
      }
      current = {};
    }
  }
  if (current.path && current.head !== void 0) {
    worktrees.push(current);
  }
  return worktrees;
}
async function fetchBranch(branch, cwd = process.cwd()) {
  await execa2("git", ["fetch", "origin", branch], { cwd });
}

// src/lib/deps.ts
import fs2 from "fs-extra";
import path2 from "path";
import { execa as execa3 } from "execa";
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
  await execa3(manager, args, {
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
function runScript(manager, script) {
  if (manager === "npm") {
    return `npm run ${script}`;
  }
  return `${manager} ${script}`;
}
async function getDevCommand(cwd = process.cwd(), manager = "npm") {
  const packageJsonPath = path3.join(cwd, "package.json");
  if (await fs3.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs3.readJson(packageJsonPath);
      if (pkg.scripts?.dev) {
        return runScript(manager, "dev");
      }
      if (pkg.scripts?.start) {
        return runScript(manager, "start");
      }
    } catch {
    }
  }
  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].devCommand;
}
async function getBuildCommand(cwd = process.cwd(), manager = "npm") {
  const packageJsonPath = path3.join(cwd, "package.json");
  if (await fs3.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs3.readJson(packageJsonPath);
      if (pkg.scripts?.build) {
        return runScript(manager, "build");
      }
    } catch {
    }
  }
  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].buildCommand;
}
async function getServeCommand(cwd = process.cwd(), manager = "npm") {
  const packageJsonPath = path3.join(cwd, "package.json");
  if (await fs3.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs3.readJson(packageJsonPath);
      if (pkg.scripts?.start) {
        return runScript(manager, "start");
      }
      if (pkg.scripts?.serve) {
        return runScript(manager, "serve");
      }
    } catch {
    }
  }
  const framework = await detectFramework(cwd);
  return FRAMEWORK_CONFIGS[framework].serveCommand;
}

// src/lib/output.ts
function getOutputOptions(argv = process.argv) {
  const json = argv.includes("--json");
  const quiet = argv.includes("--quiet") || argv.includes("-q");
  return { json, quiet };
}
function shouldUseSpinner(opts) {
  return !opts.json && !opts.quiet;
}
function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

// src/commands/init.ts
async function init() {
  const cwd = process.cwd();
  const out = getOutputOptions();
  if (await groveExists(cwd)) {
    if (out.json) {
      printJson({ ok: true, alreadyInitialized: true });
      return;
    }
    if (!out.quiet) {
      console.log(chalk.yellow("Grove is already initialized in this directory."));
    }
    return;
  }
  if (!await isGitRepo(cwd)) {
    if (out.json) {
      printJson({ ok: false, error: "Not a git repository." });
    } else {
      console.log(chalk.red("Error: Not a git repository."));
      console.log(chalk.gray("Run this command from within a git repository."));
    }
    process.exit(1);
  }
  const spinner = shouldUseSpinner(out) ? ora("Initializing grove...").start() : null;
  try {
    const repoRoot = await getRepoRoot(cwd);
    const currentBranch = await getCurrentBranch(cwd);
    const groveRoot = repoRoot;
    const groveDir = getGroveDir(groveRoot);
    const treesDir = getTreesDir(groveRoot);
    const sharedDir = getSharedDir(groveRoot);
    await fs4.ensureDir(groveDir);
    await fs4.ensureDir(treesDir);
    await fs4.ensureDir(sharedDir);
    if (spinner) spinner.text = "Detecting project configuration...";
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
    await writeConfig(config, groveRoot);
    const currentLinkPath = path4.join(groveRoot, "current");
    if (await fs4.pathExists(currentLinkPath)) {
      await fs4.remove(currentLinkPath);
    }
    await fs4.symlink(".", currentLinkPath);
    const gitignorePath = path4.join(groveRoot, ".gitignore");
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
    if (spinner) spinner.succeed("Grove initialized!");
    if (out.json) {
      printJson({
        ok: true,
        repo: repoRoot,
        groveDir,
        treesDir,
        sharedDir,
        packageManager,
        framework,
        current: mainTreeName
      });
      return;
    }
    if (!out.quiet) {
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
    }
  } catch (error) {
    if (spinner) spinner.fail("Failed to initialize grove");
    if (out.json) {
      printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
    } else {
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    }
    process.exit(1);
  }
}

// src/commands/plant.ts
import chalk2 from "chalk";
import ora2 from "ora";

// src/lib/symlink.ts
import fs5 from "fs-extra";
import path5 from "path";
async function getGroveRootOrCwd(cwd) {
  const root = await findGroveRoot(cwd);
  return root ?? path5.resolve(cwd);
}
function getCurrentLinkPath(cwd = process.cwd()) {
  return path5.join(cwd, CURRENT_LINK);
}
async function createCurrentLink(treeName, cwd = process.cwd()) {
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);
  let targetPath = getTreePath(treeName, groveRoot);
  try {
    const config = await readConfig(groveRoot);
    const tree = config.trees[treeName];
    if (tree) {
      targetPath = tree.path;
    }
  } catch {
  }
  if (await fs5.pathExists(linkPath)) {
    await fs5.remove(linkPath);
  }
  const relativePathRaw = path5.relative(groveRoot, targetPath);
  const relativePath = relativePathRaw || ".";
  await fs5.symlink(relativePath, linkPath);
}
async function removeCurrentLink(cwd = process.cwd()) {
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);
  if (await fs5.pathExists(linkPath)) {
    await fs5.remove(linkPath);
  }
}
async function getCurrentTreeName(cwd = process.cwd()) {
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);
  try {
    const target = await fs5.readlink(linkPath);
    if (target === ".") {
      try {
        const config = await readConfig(groveRoot);
        for (const [name, tree] of Object.entries(config.trees)) {
          const normalizedTreePath = path5.resolve(tree.path);
          const normalizedCwd = path5.resolve(groveRoot);
          if (normalizedTreePath === normalizedCwd) {
            return name;
          }
        }
      } catch {
      }
      return null;
    }
    const parts = target.split(path5.sep);
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}
async function isSymlinkValid(cwd = process.cwd()) {
  const groveRoot = await getGroveRootOrCwd(cwd);
  const linkPath = getCurrentLinkPath(groveRoot);
  try {
    const stat = await fs5.lstat(linkPath);
    if (!stat.isSymbolicLink()) {
      return false;
    }
    await fs5.stat(linkPath);
    return true;
  } catch {
    return false;
  }
}

// src/lib/editor.ts
import { execa as execa4 } from "execa";
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
      await execa4("which", [config.command]);
      available.push(name);
    } catch {
    }
  }
  return available;
}
async function openInEditor(treeName, editor, cwd = process.cwd()) {
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
  if (!await fs6.pathExists(treePath)) {
    throw new Error(`Tree path does not exist: ${treePath}`);
  }
  await execa4(config.command, config.args, {
    cwd: treePath,
    detached: true,
    stdio: "ignore"
  });
}
async function spawnClaudeCode(treeName, cwd = process.cwd()) {
  const groveRoot = await resolveGroveRoot(cwd);
  const configFile = await readConfig(groveRoot);
  const tree = configFile.trees[treeName];
  if (!tree) {
    throw new Error(`Tree '${treeName}' not found`);
  }
  const treePath = tree.path;
  if (!await fs6.pathExists(treePath)) {
    throw new Error(`Tree path does not exist: ${treePath}`);
  }
  const child = execa4("claude", [], {
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
  const out = getOutputOptions();
  const treeName = name || branch.replace(/\//g, "-");
  const spinner = shouldUseSpinner(out) ? ora2(`Planting tree '${treeName}'...`).start() : null;
  try {
    assertValidTreeName(treeName);
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);
    if (config.trees[treeName]) {
      if (spinner) spinner.fail(`Tree '${treeName}' already exists`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${treeName}' already exists`, name: treeName });
      } else if (!out.quiet) {
        console.log(chalk2.gray(`Use 'grove tend ${treeName}' to switch to it.`));
      }
      process.exit(1);
    }
    const localExists = await branchExists(branch, config.repo);
    const remoteExists = await remoteBranchExists(branch, config.repo);
    const shouldCreate = options.new || !localExists && !remoteExists;
    if (!localExists && remoteExists && !options.new) {
      if (spinner) spinner.text = `Fetching branch '${branch}' from origin...`;
      await fetchBranch(branch, config.repo);
    }
    if (spinner) spinner.text = `Creating worktree for '${branch}'...`;
    const treePath = getTreePath(treeName, groveRoot);
    await createWorktree(
      treePath,
      branch,
      {
        createBranch: shouldCreate,
        baseBranch: options.base
      },
      config.repo
    );
    if (spinner) spinner.text = "Copying editor configurations...";
    const copiedConfigs = await copyEditorConfigs(config.repo, treePath);
    if (copiedConfigs.length > 0) {
      if (spinner) spinner.text = `Copied: ${copiedConfigs.join(", ")}`;
    }
    const shouldInstall = options.install !== false;
    if (shouldInstall) {
      if (spinner) spinner.text = "Setting up dependencies...";
      let sourceTree = null;
      for (const [existingName, tree] of Object.entries(config.trees)) {
        if (await hasNodeModules(tree.path)) {
          sourceTree = existingName;
          break;
        }
      }
      const manager = await detectPackageManager(treePath);
      if (manager === "pnpm") {
        if (spinner) spinner.text = "Installing dependencies with shared pnpm store...";
        await installDependencies(manager, treePath, {
          useSharedStore: true,
          groveDir: groveRoot
        });
      } else if (sourceTree) {
        const sourceTreePath = config.trees[sourceTree].path;
        const canSymlink = await canSymlinkNodeModules(sourceTreePath, treePath);
        if (canSymlink) {
          if (spinner) spinner.text = `Symlinking node_modules from '${sourceTree}'...`;
          await symlinkNodeModules(sourceTreePath, treePath);
        } else {
          if (spinner) spinner.text = "Installing dependencies...";
          await installDependencies(manager, treePath);
        }
      } else {
        if (spinner) spinner.text = "Installing dependencies...";
        await installDependencies(manager, treePath);
      }
    }
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    await updateConfig((c) => ({
      ...c,
      trees: {
        ...c.trees,
        [treeName]: {
          branch,
          path: treePath,
          created: createdAt
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
    if (spinner) spinner.succeed(`Planted tree '${treeName}'`);
    if (out.json) {
      printJson({
        ok: true,
        tree: {
          name: treeName,
          branch,
          path: treePath,
          created: createdAt
        },
        copiedConfigs,
        switched: !!options.switch
      });
      return;
    }
    if (out.quiet) {
      return;
    }
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
    if (spinner) spinner.fail("Failed to plant tree");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk2.red(message));
    }
    process.exit(1);
  }
}

// src/commands/list.ts
import chalk3 from "chalk";

// src/lib/preview.ts
import { execaCommand } from "execa";
import detectPort from "detect-port";
import treeKill from "tree-kill";
var runningProcesses = /* @__PURE__ */ new Map();
async function findAvailablePort(startPort = 3e3) {
  return detectPort(startPort);
}
function injectPortIntoCommand(baseCmd, framework, port) {
  const env = {};
  const trimmed = baseCmd.trim();
  const alreadyHasPort = /\b--port\b/.test(trimmed) || /\s-p\s/.test(trimmed) || /\s-l\s/.test(trimmed) || /\b--listen\b/.test(trimmed);
  if (!alreadyHasPort && (trimmed === "serve" || trimmed.startsWith("serve "))) {
    return { cmd: `${baseCmd} -l ${port}`, env };
  }
  if (framework === "cra") {
    env.PORT = String(port);
    return { cmd: baseCmd, env };
  }
  if (alreadyHasPort) {
    return { cmd: baseCmd, env };
  }
  const portArg = `--port ${port}`;
  const isScript = /^(npm\s+run\b|pnpm\b|yarn\b)/.test(trimmed);
  if (isScript) {
    if (trimmed.includes(" -- ")) {
      return { cmd: `${baseCmd} ${portArg}`, env };
    }
    return { cmd: `${baseCmd} -- ${portArg}`, env };
  }
  return { cmd: `${baseCmd} ${portArg}`, env };
}
async function startPreview(treeName, mode, cwd = process.cwd(), options = {}) {
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
  const treePath = tree.path;
  const defaultPort = FRAMEWORK_CONFIGS[config.framework].defaultPort;
  const desiredPort = options.port ?? options.portHint ?? defaultPort;
  const port = await findAvailablePort(desiredPort);
  if (options.port && port !== desiredPort) {
    throw new Error(`Port ${desiredPort} is not available`);
  }
  let cmdString;
  let extraEnv = {};
  if (mode === "dev") {
    const devCmd = await getDevCommand(treePath, config.packageManager);
    const injected = injectPortIntoCommand(devCmd, config.framework, port);
    cmdString = injected.cmd;
    extraEnv = injected.env;
  } else {
    const buildCmd = await getBuildCommand(treePath, config.packageManager);
    await execaCommand(buildCmd, {
      cwd: treePath,
      stdio: "inherit"
    });
    const serveCmd = await getServeCommand(treePath, config.packageManager);
    const injected = injectPortIntoCommand(serveCmd, config.framework, port);
    cmdString = injected.cmd;
    extraEnv = injected.env;
  }
  const child = execaCommand(cmdString, {
    cwd: treePath,
    stdio: "inherit",
    detached: true,
    env: {
      ...process.env,
      ...extraEnv
    }
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
  const out = getOutputOptions();
  try {
    const config = await readConfig(cwd);
    const currentTree = await getCurrentTreeName(cwd);
    const previews = await getRunningPreviews(cwd);
    const trees = Object.entries(config.trees);
    if (trees.length === 0) {
      if (out.json) {
        printJson({
          repo: config.repo,
          packageManager: config.packageManager,
          framework: config.framework,
          current: currentTree,
          trees: []
        });
        return;
      }
      if (!out.quiet) {
        console.log(chalk3.yellow("No trees in the grove."));
        console.log(chalk3.gray("Run `grove plant <branch>` to create one."));
      }
      return;
    }
    if (out.json) {
      const treesOut = await Promise.all(
        trees.map(async ([name, info]) => {
          const preview2 = previews[name];
          const running = preview2 ? await isPreviewRunning(name, cwd) : false;
          return {
            name,
            branch: info.branch,
            path: info.path,
            created: info.created,
            current: name === currentTree,
            preview: running && preview2 ? preview2 : null
          };
        })
      );
      printJson({
        repo: config.repo,
        packageManager: config.packageManager,
        framework: config.framework,
        current: currentTree,
        trees: treesOut
      });
      return;
    }
    if (out.quiet) {
      console.log(trees.map(([name]) => name).join("\n"));
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
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora3(`Switching to '${name}'...`).start() : null;
  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      if (spinner) spinner.fail(`Tree '${name}' not found`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      } else if (!out.quiet) {
        console.log("");
        console.log(chalk4.gray("Available trees:"));
        for (const treeName of Object.keys(config.trees)) {
          console.log(chalk4.gray(`  - ${treeName}`));
        }
      }
      process.exit(1);
    }
    const currentTree = await getCurrentTreeName(cwd);
    if (currentTree === name) {
      if (spinner) spinner.info(`Already on '${name}'`);
      if (out.json) {
        printJson({ ok: true, alreadyCurrent: true, current: name });
      }
      return;
    }
    await createCurrentLink(name, cwd);
    await updateConfig((c) => ({
      ...c,
      current: name
    }), cwd);
    const tree = config.trees[name];
    if (spinner) spinner.succeed(`Now tending '${name}'`);
    if (out.json) {
      printJson({ ok: true, current: name, tree });
      return;
    }
    if (out.quiet) {
      return;
    }
    console.log("");
    console.log(chalk4.gray(`  Branch: ${tree.branch}`));
    console.log(chalk4.gray(`  Path:   ${tree.path}`));
    console.log("");
    console.log(chalk4.cyan("The `current` symlink now points to this tree."));
  } catch (error) {
    if (spinner) spinner.fail("Failed to switch tree");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk4.red(message));
    }
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
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora4(`Uprooting '${name}'...`).start() : null;
  try {
    assertValidTreeName(name);
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);
    let switchedTo = null;
    if (!config.trees[name]) {
      if (spinner) spinner.fail(`Tree '${name}' not found`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      }
      process.exit(1);
    }
    const tree = config.trees[name];
    const treesDir = getTreesDir(groveRoot);
    const rel = path7.relative(treesDir, tree.path);
    const isRealWorktree = !!rel && !rel.startsWith("..") && !path7.isAbsolute(rel);
    if (!isRealWorktree) {
      if (spinner) spinner.fail(`Cannot uproot '${name}' - it's the main repository`);
      if (out.json) {
        printJson({ ok: false, error: `Cannot uproot '${name}' - it's the main repository` });
      } else if (!out.quiet) {
        console.log(chalk5.gray("The main tree represents your original repository."));
        console.log(chalk5.gray("You can only uproot worktrees created with `grove plant`."));
      }
      process.exit(1);
    }
    const currentTree = await getCurrentTreeName(groveRoot);
    const isCurrent = currentTree === name;
    if (isCurrent && Object.keys(config.trees).length === 1) {
      if (spinner) spinner.fail("Cannot uproot the last tree in the grove");
      if (out.json) {
        printJson({ ok: false, error: "Cannot uproot the last tree in the grove" });
      } else if (!out.quiet) {
        console.log(chalk5.gray("At least one tree must remain."));
      }
      process.exit(1);
    }
    if (await isPreviewRunning(name, groveRoot)) {
      if (spinner) spinner.text = "Stopping preview server...";
      await stopPreview(name, groveRoot);
    }
    if (spinner) spinner.text = "Removing worktree...";
    await removeWorktree(tree.path, { force: options.force }, config.repo);
    await updateConfig((c) => {
      const { [name]: _, ...remainingTrees } = c.trees;
      return {
        ...c,
        trees: remainingTrees,
        current: c.current === name ? null : c.current
      };
    }, groveRoot);
    if (isCurrent) {
      const remainingTrees = Object.keys(config.trees).filter((t) => t !== name);
      if (remainingTrees.length > 0) {
        const newCurrent = remainingTrees[0];
        const newTreePath = config.trees[newCurrent].path;
        switchedTo = newCurrent;
        const currentLinkPath = path7.join(groveRoot, "current");
        try {
          await fs7.lstat(currentLinkPath);
          await fs7.unlink(currentLinkPath);
        } catch {
        }
        const relativePath = path7.relative(groveRoot, newTreePath) || ".";
        await fs7.symlink(relativePath, currentLinkPath);
        await updateConfig((c) => ({
          ...c,
          current: newCurrent
        }), groveRoot);
        if (spinner) spinner.succeed(`Uprooted '${name}', switched to '${newCurrent}'`);
      } else {
        switchedTo = null;
        await removeCurrentLink(groveRoot);
        if (spinner) spinner.succeed(`Uprooted '${name}'`);
      }
    } else {
      if (spinner) spinner.succeed(`Uprooted '${name}'`);
    }
    if (out.json) {
      printJson({
        ok: true,
        removed: { name, ...tree },
        switchedTo
      });
      return;
    }
    if (out.quiet) {
      return;
    }
    console.log("");
    console.log(chalk5.gray(`  Branch: ${tree.branch}`));
    console.log(chalk5.gray(`  Path:   ${tree.path} (removed)`));
  } catch (error) {
    if (spinner) spinner.fail("Failed to uproot tree");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk5.red(message));
      if (!options.force && !out.quiet) {
        console.log("");
        console.log(chalk5.yellow("Tip: Use --force to force removal"));
      }
    }
    process.exit(1);
  }
}

// src/commands/preview.ts
import chalk6 from "chalk";
import ora5 from "ora";
async function preview(action, names, options) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  let config;
  try {
    config = await readConfig(cwd);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk6.red(message));
    }
    process.exit(1);
  }
  if (action === "stop") {
    const targets2 = names ?? [];
    if (targets2.length === 0) {
      await stopAll(cwd, out, config);
      return;
    }
    for (const t of targets2) {
      assertValidTreeName(t);
    }
    await stopMany(targets2, cwd, out);
    return;
  }
  const isAll = options.all || action === "all";
  const targets = isAll ? Object.keys(config.trees) : [action, ...names ?? []];
  for (const t of targets) {
    assertValidTreeName(t);
  }
  if (targets.length > 1 && options.port) {
    if (!out.quiet) {
      console.log(chalk6.yellow("Note: --port is only supported for a single tree; ignoring it."));
    }
    options = { ...options, port: void 0 };
  }
  await startMany(targets, options, cwd, out, config);
}
async function startMany(targets, options, cwd, out, config) {
  const mode = options.build ? "build" : "dev";
  const results = [];
  let nextPortHint = 3e3;
  for (const name of targets) {
    if (!config.trees[name]) {
      results.push({ name, error: `Tree '${name}' not found` });
      continue;
    }
    try {
      if (await isPreviewRunning(name, cwd)) {
        const preview2 = config.previews[name];
        results.push({
          name,
          alreadyRunning: true,
          url: `http://localhost:${preview2.port}`
        });
        continue;
      }
      const spinner = shouldUseSpinner(out) ? ora5(`Starting preview for '${name}'...`).start() : null;
      if (spinner) spinner.text = mode === "build" ? "Building and starting server..." : "Starting dev server...";
      const previewInfo = await startPreview(name, mode, cwd, {
        port: options.port,
        portHint: nextPortHint
      });
      const url = `http://localhost:${previewInfo.port}`;
      results.push({ name, url });
      nextPortHint = previewInfo.port + 1;
      if (spinner) spinner.succeed(`Preview started for '${name}'`);
    } catch (err) {
      results.push({
        name,
        error: err instanceof Error ? err.message : String(err)
      });
      if (!out.quiet && !out.json) {
        console.error(chalk6.red(`Failed to start preview for '${name}': ${results[results.length - 1].error}`));
      }
    }
  }
  if (out.json) {
    printJson({ ok: results.every((r) => !r.error), mode, results });
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }
  if (out.quiet) {
    for (const r of results) {
      if (r.url) console.log(r.url);
    }
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }
  if (results.length > 1) {
    console.log("");
    console.log(chalk6.green("Previews:"));
    for (const r of results) {
      if (r.error) {
        console.log(chalk6.red(`  ${r.name}: ${r.error}`));
      } else if (r.url) {
        const label = r.alreadyRunning ? "running" : "started";
        console.log(chalk6.cyan(`  ${r.name} (${label}) \u2192 ${r.url}`));
      }
    }
  }
  if (results.some((r) => r.error)) {
    process.exit(1);
  }
}
async function stopMany(targets, cwd, out) {
  const results = [];
  for (const name of targets) {
    try {
      if (!await isPreviewRunning(name, cwd)) {
        results.push({ name, stopped: false });
        continue;
      }
      await stopPreview(name, cwd);
      results.push({ name, stopped: true });
    } catch (err) {
      results.push({ name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (out.json) {
    printJson({ ok: results.every((r) => !r.error), results });
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }
  if (out.quiet) {
    if (results.some((r) => r.error)) process.exit(1);
    return;
  }
  console.log("");
  console.log(chalk6.green("Stopped previews:"));
  for (const r of results) {
    if (r.error) {
      console.log(chalk6.red(`  ${r.name}: ${r.error}`));
    } else {
      const label = r.stopped ? "stopped" : "not running";
      console.log(chalk6.gray(`  ${r.name}: ${label}`));
    }
  }
  if (results.some((r) => r.error)) {
    process.exit(1);
  }
}
async function stopAll(cwd, out, config) {
  const spinner = shouldUseSpinner(out) ? ora5("Stopping all previews...").start() : null;
  try {
    const cfg = config ?? await readConfig(cwd);
    const runningCount = Object.keys(cfg.previews).length;
    if (runningCount === 0) {
      if (spinner) spinner.info("No previews running");
      if (out.json) {
        printJson({ ok: true, stopped: 0 });
      }
      return;
    }
    await stopAllPreviews(cwd);
    if (spinner) spinner.succeed(`Stopped ${runningCount} preview(s)`);
    if (out.json) {
      printJson({ ok: true, stopped: runningCount });
    }
  } catch (error) {
    if (spinner) spinner.fail("Failed to stop previews");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk6.red(message));
    }
    process.exit(1);
  }
}

// src/commands/status.ts
import chalk7 from "chalk";
async function status() {
  const cwd = process.cwd();
  const out = getOutputOptions();
  try {
    const config = await readConfig(cwd);
    const currentTree = await getCurrentTreeName(cwd);
    const previews = await getRunningPreviews(cwd);
    const previewEntries = Object.entries(previews);
    const runningFlags = await Promise.all(
      previewEntries.map(([name]) => isPreviewRunning(name, cwd))
    );
    const runningPreviews = previewEntries.filter((_, i) => runningFlags[i]).reduce((acc, [name, preview2]) => {
      acc[name] = preview2;
      return acc;
    }, {});
    const treeCount = Object.keys(config.trees).length;
    const runningCount = runningFlags.filter(Boolean).length;
    if (out.json) {
      const current = currentTree && config.trees[currentTree] ? { name: currentTree, ...config.trees[currentTree] } : null;
      printJson({
        current,
        previews: runningPreviews,
        summary: {
          trees: treeCount,
          previewsRunning: runningCount,
          packageManager: config.packageManager,
          framework: config.framework
        }
      });
      return;
    }
    if (out.quiet) {
      if (currentTree) {
        console.log(currentTree);
      }
      return;
    }
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
    if (previewEntries.length === 0) {
      console.log(chalk7.gray("  No previews running"));
    } else {
      for (const [name, preview2] of Object.entries(runningPreviews)) {
        console.log(
          chalk7.cyan(`  ${name}`) + chalk7.gray(` \u2192 http://localhost:${preview2.port}`) + chalk7.gray(` (${preview2.mode})`)
        );
      }
    }
    console.log("");
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
  const out = getOutputOptions();
  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      } else if (!out.quiet) {
        console.log(chalk8.red(`Tree '${name}' not found`));
        console.log("");
        console.log(chalk8.gray("Available trees:"));
        for (const treeName of Object.keys(config.trees)) {
          console.log(chalk8.gray(`  - ${treeName}`));
        }
      }
      process.exit(1);
    }
    let editor;
    if (options.editor) {
      const supported = getSupportedEditors();
      if (!supported.includes(options.editor)) {
        if (out.json) {
          printJson({ ok: false, error: `Unknown editor: ${options.editor}` });
        } else if (!out.quiet) {
          console.log(chalk8.red(`Unknown editor: ${options.editor}`));
          console.log(chalk8.gray(`Supported: ${supported.join(", ")}`));
        }
        process.exit(1);
      }
      editor = options.editor;
    } else {
      const available = await detectAvailableEditors();
      if (available.length === 0) {
        if (out.json) {
          printJson({ ok: false, error: "No supported editors found" });
        } else if (!out.quiet) {
          console.log(chalk8.red("No supported editors found"));
          console.log(chalk8.gray("Install one of: cursor, code (VS Code), claude, zed"));
        }
        process.exit(1);
      }
      const preferenceOrder = ["cursor", "claude", "code", "zed"];
      editor = preferenceOrder.find((e) => available.includes(e)) || available[0];
    }
    const spinner = shouldUseSpinner(out) ? ora6(`Opening '${name}' in ${getEditorName(editor)}...`).start() : null;
    await openInEditor(name, editor, cwd);
    const treePath = config.trees[name].path;
    if (spinner) spinner.succeed(`Opened '${name}' in ${getEditorName(editor)}`);
    if (out.json) {
      printJson({
        ok: true,
        opened: { name, path: treePath, branch: config.trees[name].branch },
        editor
      });
      return;
    }
    if (out.quiet) {
      return;
    }
    console.log("");
    console.log(chalk8.gray(`  Path: ${treePath}`));
    console.log(chalk8.gray(`  Branch: ${config.trees[name].branch}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk8.red(message));
    }
    process.exit(1);
  }
}

// src/commands/spawn.ts
import chalk9 from "chalk";
async function spawn(name) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      if (out.json) {
        printJson({ ok: false, error: `Tree '${name}' not found` });
      } else if (!out.quiet) {
        console.log(chalk9.red(`Tree '${name}' not found`));
        console.log("");
        console.log(chalk9.gray("Available trees:"));
        for (const treeName of Object.keys(config.trees)) {
          console.log(chalk9.gray(`  - ${treeName}`));
        }
      }
      process.exit(1);
    }
    const tree = config.trees[name];
    const treePath = tree.path;
    if (out.json) {
      printJson({ ok: false, error: "--json is not supported for interactive spawn sessions" });
      process.exit(1);
    }
    if (!out.quiet) {
      console.log(chalk9.cyan(`Spawning Claude Code in '${name}'...`));
      console.log(chalk9.gray(`  Path: ${treePath}`));
      console.log(chalk9.gray(`  Branch: ${tree.branch}`));
      console.log("");
    }
    await spawnClaudeCode(name, cwd);
    if (!out.quiet) {
      console.log("");
      console.log(chalk9.gray("Claude Code session ended."));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else {
      console.error(chalk9.red(message));
    }
    process.exit(1);
  }
}

// src/commands/path.ts
async function getPath(name) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);
    if (!config.trees[name]) {
      console.error(`Tree '${name}' not found`);
      process.exit(1);
    }
    const tree = config.trees[name];
    const treePath = tree.path;
    if (out.json) {
      printJson({ name, path: treePath, branch: tree.branch });
      return;
    }
    console.log(treePath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// src/commands/ai.ts
import chalk10 from "chalk";
import { execa as execa6 } from "execa";
var SUPPORTED_TOOLS = ["claude", "codex", "run"];
function isSupportedTool(tool) {
  return SUPPORTED_TOOLS.includes(tool);
}
async function ai(tool, name, args = []) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  if (out.json) {
    printJson({ ok: false, error: "--json is not supported for interactive AI sessions" });
    process.exit(1);
  }
  try {
    assertValidTreeName(name);
    if (!isSupportedTool(tool)) {
      if (!out.quiet) {
        console.error(chalk10.red(`Unknown AI tool: ${tool}`));
        console.error(chalk10.gray(`Supported: ${SUPPORTED_TOOLS.join(", ")}`));
      }
      process.exit(1);
    }
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);
    if (!config.trees[name]) {
      if (!out.quiet) {
        console.error(chalk10.red(`Tree '${name}' not found`));
      }
      process.exit(1);
    }
    const tree = config.trees[name];
    const treePath = tree.path;
    let command;
    let commandArgs;
    if (tool === "run") {
      if (args.length === 0) {
        if (!out.quiet) {
          console.error(chalk10.red("No command provided for `grove ai run`"));
          console.error(chalk10.gray("Usage: grove ai run <name> -- <command> [args...]"));
        }
        process.exit(1);
      }
      command = args[0];
      commandArgs = args.slice(1);
    } else {
      command = tool;
      commandArgs = args;
    }
    if (!out.quiet) {
      const label = tool === "run" ? command : tool;
      console.log(chalk10.cyan(`Starting ${label} in '${name}'...`));
      console.log(chalk10.gray(`  Path: ${treePath}`));
      console.log(chalk10.gray(`  Branch: ${tree.branch}`));
      console.log("");
    }
    const env = {
      ...process.env,
      GROVE_TREE: name,
      GROVE_TREE_PATH: treePath,
      GROVE_BRANCH: tree.branch,
      GROVE_ROOT: groveRoot,
      GROVE_REPO: config.repo
    };
    await execa6(command, commandArgs, {
      cwd: treePath,
      stdio: "inherit",
      env
    });
  } catch (error) {
    if (!out.quiet) {
      console.error(chalk10.red(error instanceof Error ? error.message : String(error)));
    }
    process.exit(1);
  }
}

// src/commands/adopt.ts
import chalk11 from "chalk";
import ora7 from "ora";
import path8 from "path";
async function adopt(worktreePath, name, options) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora7(`Adopting worktree...`).start() : null;
  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);
    const targetAbs = path8.resolve(cwd, worktreePath);
    const worktrees = await listWorktrees(config.repo);
    const match = worktrees.find((wt) => path8.resolve(wt.path) === targetAbs);
    if (!match) {
      if (spinner) spinner.fail("Worktree not found");
      if (out.json) {
        printJson({ ok: false, error: `No git worktree found at ${targetAbs}` });
      } else if (!out.quiet) {
        console.error(chalk11.red(`No git worktree found at ${targetAbs}`));
      }
      process.exit(1);
    }
    const derivedName = match.branch ? match.branch.replace(/\//g, "-") : void 0;
    const treeName = name || derivedName;
    if (!treeName) {
      if (spinner) spinner.fail("Name required");
      if (out.json) {
        printJson({ ok: false, error: "Detached worktree requires an explicit name" });
      } else if (!out.quiet) {
        console.error(chalk11.red("Detached worktree requires an explicit name."));
      }
      process.exit(1);
    }
    assertValidTreeName(treeName);
    if (config.trees[treeName]) {
      if (spinner) spinner.fail(`Tree '${treeName}' already exists`);
      if (out.json) {
        printJson({ ok: false, error: `Tree '${treeName}' already exists` });
      }
      process.exit(1);
    }
    const duplicatePath = Object.values(config.trees).some(
      (t) => path8.resolve(t.path) === targetAbs
    );
    if (duplicatePath) {
      if (spinner) spinner.fail("Worktree already adopted");
      if (out.json) {
        printJson({ ok: false, error: `Worktree at ${targetAbs} is already adopted` });
      }
      process.exit(1);
    }
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const storedBranch = match.branch ?? match.head;
    await updateConfig((c) => ({
      ...c,
      trees: {
        ...c.trees,
        [treeName]: {
          branch: storedBranch,
          path: targetAbs,
          created: createdAt
        }
      }
    }), groveRoot);
    if (options.switch) {
      await createCurrentLink(treeName, groveRoot);
      await updateConfig((c) => ({ ...c, current: treeName }), groveRoot);
    }
    if (spinner) spinner.succeed(`Adopted '${treeName}'`);
    if (out.json) {
      printJson({
        ok: true,
        adopted: { name: treeName, branch: storedBranch, path: targetAbs, created: createdAt },
        switched: !!options.switch
      });
      return;
    }
    if (out.quiet) return;
    console.log("");
    console.log(chalk11.green("Adopted tree:"));
    console.log(chalk11.gray(`  Name:   ${treeName}`));
    console.log(chalk11.gray(`  Branch: ${storedBranch}`));
    console.log(chalk11.gray(`  Path:   ${targetAbs}`));
    if (options.switch) {
      console.log("");
      console.log(chalk11.cyan(`Switched to '${treeName}'`));
    }
  } catch (error) {
    if (spinner) spinner.fail("Failed to adopt worktree");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk11.red(message));
    }
    process.exit(1);
  }
}

// src/commands/prune.ts
import chalk12 from "chalk";
import ora8 from "ora";
import path9 from "path";
async function prune(options) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora8("Pruning stale trees...").start() : null;
  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);
    const worktrees = await listWorktrees(config.repo);
    const actualPaths = new Set(worktrees.map((wt) => path9.resolve(wt.path)));
    const staleTrees = Object.entries(config.trees).filter(([name]) => name !== "main").filter(([, tree]) => !actualPaths.has(path9.resolve(tree.path))).map(([name]) => name);
    const stalePreviews = Object.keys(config.previews).filter(
      (name) => staleTrees.includes(name)
    );
    if (!options.dryRun && (staleTrees.length > 0 || stalePreviews.length > 0)) {
      await updateConfig((c) => {
        const remainingTrees = { ...c.trees };
        for (const name of staleTrees) {
          delete remainingTrees[name];
        }
        const remainingPreviews = { ...c.previews };
        for (const name of stalePreviews) {
          delete remainingPreviews[name];
        }
        const currentIsStale = c.current && staleTrees.includes(c.current);
        const current = currentIsStale ? Object.keys(remainingTrees)[0] ?? null : c.current;
        return {
          ...c,
          trees: remainingTrees,
          previews: remainingPreviews,
          current
        };
      }, groveRoot);
    }
    if (spinner) spinner.succeed("Prune complete");
    if (out.json) {
      printJson({
        ok: true,
        dryRun: !!options.dryRun,
        prunedTrees: staleTrees,
        prunedPreviews: stalePreviews
      });
      return;
    }
    if (out.quiet) {
      if (staleTrees.length > 0) {
        console.log(staleTrees.join("\n"));
      }
      return;
    }
    if (staleTrees.length === 0 && stalePreviews.length === 0) {
      console.log(chalk12.gray("No stale trees or previews found."));
      return;
    }
    console.log("");
    if (staleTrees.length > 0) {
      console.log(chalk12.green(`Pruned trees: ${staleTrees.join(", ")}`));
    }
    if (stalePreviews.length > 0) {
      console.log(chalk12.green(`Pruned previews: ${stalePreviews.join(", ")}`));
    }
    if (options.dryRun) {
      console.log(chalk12.yellow("(dry run; no changes made)"));
    }
  } catch (error) {
    if (spinner) spinner.fail("Failed to prune trees");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk12.red(message));
    }
    process.exit(1);
  }
}

// src/commands/doctor.ts
import chalk13 from "chalk";
import ora9 from "ora";
import path10 from "path";
async function doctor(options) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora9("Checking grove health...").start() : null;
  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const config = await readConfig(groveRoot);
    const worktrees = await listWorktrees(config.repo);
    const actualPaths = new Set(worktrees.map((wt) => path10.resolve(wt.path)));
    const missingTrees = Object.entries(config.trees).filter(([name]) => name !== "main").filter(([, tree]) => !actualPaths.has(path10.resolve(tree.path))).map(([name, tree]) => ({ name, path: tree.path }));
    const previewEntries = Object.entries(config.previews);
    const stalePreviews = previewEntries.filter(([, preview2]) => {
      try {
        process.kill(preview2.pid, 0);
        return false;
      } catch {
        return true;
      }
    }).map(([name, preview2]) => ({ name, pid: preview2.pid, port: preview2.port }));
    const symlinkOk = await isSymlinkValid(groveRoot);
    const symlinkCurrent = await getCurrentTreeName(groveRoot);
    const configCurrent = config.current;
    const issues = [];
    if (missingTrees.length > 0) {
      issues.push({ type: "missing_trees", trees: missingTrees });
    }
    if (stalePreviews.length > 0) {
      issues.push({ type: "stale_previews", previews: stalePreviews });
    }
    if (!symlinkOk) {
      issues.push({ type: "invalid_current_symlink" });
    }
    if (configCurrent && symlinkCurrent && configCurrent !== symlinkCurrent) {
      issues.push({ type: "current_mismatch", configCurrent, symlinkCurrent });
    }
    if (configCurrent && !config.trees[configCurrent]) {
      issues.push({ type: "current_missing", current: configCurrent });
    }
    if (options.fix) {
      const missingNames = missingTrees.map((t) => t.name);
      const remainingTrees = { ...config.trees };
      for (const name of missingNames) {
        delete remainingTrees[name];
      }
      const remainingPreviews = { ...config.previews };
      for (const name of missingNames) {
        delete remainingPreviews[name];
      }
      for (const { name } of stalePreviews) {
        delete remainingPreviews[name];
      }
      const candidates = [
        configCurrent,
        symlinkCurrent,
        remainingTrees["main"] ? "main" : null,
        Object.keys(remainingTrees)[0] ?? null
      ].filter((c) => !!c && !!remainingTrees[c]);
      const newCurrent = candidates[0] ?? null;
      await updateConfig((c) => ({
        ...c,
        trees: remainingTrees,
        previews: remainingPreviews,
        current: newCurrent
      }), groveRoot);
      if (newCurrent) {
        await createCurrentLink(newCurrent, groveRoot);
      } else {
        await removeCurrentLink(groveRoot);
      }
      if (spinner) spinner.succeed("Grove repaired");
      if (out.json) {
        printJson({
          ok: true,
          fixed: true,
          prunedTrees: missingNames,
          prunedPreviews: stalePreviews.map((p) => p.name),
          current: newCurrent
        });
        return;
      }
      if (out.quiet) return;
      console.log(chalk13.green("Grove repaired."));
      if (missingNames.length > 0) {
        console.log(chalk13.gray(`Pruned trees: ${missingNames.join(", ")}`));
      }
      if (stalePreviews.length > 0) {
        console.log(chalk13.gray(`Pruned previews: ${stalePreviews.map((p) => p.name).join(", ")}`));
      }
      if (newCurrent) {
        console.log(chalk13.gray(`Current tree: ${newCurrent}`));
      }
      return;
    }
    if (spinner) spinner.succeed("Doctor complete");
    if (out.json) {
      printJson({ ok: issues.length === 0, issues });
      return;
    }
    if (out.quiet) {
      if (issues.length > 0) process.exit(1);
      return;
    }
    if (issues.length === 0) {
      console.log(chalk13.green("All good. No issues found."));
      return;
    }
    console.log(chalk13.yellow("Issues found:"));
    for (const issue of issues) {
      console.log(chalk13.gray(`- ${issue.type}`));
    }
    console.log("");
    console.log(chalk13.gray("Run `grove doctor --fix` to repair."));
    process.exit(1);
  } catch (error) {
    if (spinner) spinner.fail("Doctor failed");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk13.red(message));
    }
    process.exit(1);
  }
}

// src/commands/claude.ts
import chalk14 from "chalk";
import ora10 from "ora";
import path11 from "path";
import fs8 from "fs-extra";
var DEFAULT_GROVE_SKILL_MD = `---
name: grove
description: Use this skill when the user wants to work with git worktrees, manage multiple branches simultaneously, or run parallel AI development environments.
---

# Grove - Git Worktree Manager

Use this skill when the user wants to work with git worktrees, manage multiple branches simultaneously, or run parallel AI development environments.

## What is Grove?

Grove is a CLI tool that manages git worktrees with smart dependency handling. It's designed for AI-assisted development workflows where you need to:

- Work on multiple branches simultaneously
- Run preview servers for different branches
- Avoid reinstalling node_modules for every branch
- Open different branches in separate editor windows

## Key Commands

- Initialize in a repo: \`grove init\`
- Create a new tree: \`grove plant <branch> [name]\`
- Switch current tree: \`grove tend <name>\`
- List trees: \`grove list\`
- Remove a tree: \`grove uproot <name> [--force]\`
- Adopt existing worktree: \`grove adopt <path> [name]\`
- Health / cleanup: \`grove doctor [--fix]\`, \`grove prune [--dry-run]\`

## AI Sessions

Start AI tools inside a tree:

- Claude Code: \`grove ai claude <name>\`
- Codex CLI: \`grove ai codex <name>\`
- Any command: \`grove ai run <name> -- <command> [args...]\`

AI sessions inherit helpful environment variables like \`GROVE_TREE\`, \`GROVE_TREE_PATH\`, and \`GROVE_REPO\`.

## Preview Servers

- Start a preview: \`grove preview <name>\`
- Start multiple previews: \`grove preview <name-a> <name-b>\`
- Start all previews: \`grove preview all\` or \`grove preview --all\`
- Stop previews: \`grove preview stop [names...]\`
- Specific port (single tree): \`grove preview <name> --port 4000\`

## Single-Session Multi-Variant Workflow

When the user wants two different implementations/designs:

1. Create two worktrees:
   - \`grove plant -n <variant-a> -b main --no-install\`
   - \`grove plant -n <variant-b> -b main --no-install\`
2. Get their paths:
   - \`grove path <variant-a>\`
   - \`grove path <variant-b>\`
3. Edit each variant by targeting files under each path separately.
4. Preview side-by-side:
   - \`grove preview <variant-a> <variant-b>\`
5. Summarize the differences and recommend a winner.

## Tips

- You can run Grove commands from any subdirectory; it finds the grove root automatically.
- The \`current\` symlink points to the active tree.
`;
async function claudeSetup(options = {}) {
  const cwd = process.cwd();
  const out = getOutputOptions();
  const spinner = shouldUseSpinner(out) ? ora10("Setting up Claude integration...").start() : null;
  try {
    const groveRoot = await resolveGroveRoot(cwd);
    const claudeDir = path11.join(groveRoot, ".claude");
    const skillsDir = path11.join(claudeDir, "skills");
    const groveSkillDir = path11.join(skillsDir, "grove");
    const skillPath = path11.join(groveSkillDir, "SKILL.md");
    const settingsPath = path11.join(claudeDir, "settings.local.json");
    const createSettings = options.settings !== false;
    const dryRun = !!options.dryRun;
    const force = !!options.force;
    const skillExists = await fs8.pathExists(skillPath);
    const settingsExists = await fs8.pathExists(settingsPath);
    const actions = [];
    if (!skillExists) {
      actions.push(`create ${path11.relative(groveRoot, skillPath)}`);
    } else if (force) {
      actions.push(`overwrite ${path11.relative(groveRoot, skillPath)}`);
    } else {
      actions.push(`skip existing ${path11.relative(groveRoot, skillPath)}`);
    }
    if (createSettings) {
      if (!settingsExists) {
        actions.push(`create ${path11.relative(groveRoot, settingsPath)}`);
      } else {
        actions.push(`skip existing ${path11.relative(groveRoot, settingsPath)}`);
      }
    } else {
      actions.push("skip settings.local.json (disabled)");
    }
    if (dryRun) {
      if (spinner) spinner.succeed("Dry run complete");
      if (out.json) {
        printJson({ ok: true, dryRun: true, actions });
        return;
      }
      if (out.quiet) return;
      console.log(chalk14.gray("Dry run; no files written. Planned actions:"));
      for (const a of actions) console.log(chalk14.gray(`  - ${a}`));
      return;
    }
    if (!skillExists || force) {
      await fs8.ensureDir(groveSkillDir);
      await fs8.writeFile(skillPath, DEFAULT_GROVE_SKILL_MD, "utf-8");
    }
    if (createSettings && !settingsExists) {
      await fs8.ensureDir(claudeDir);
      await fs8.writeJson(
        settingsPath,
        { permissions: { allow: ["Bash(grove:*)"] } },
        { spaces: 2 }
      );
    }
    if (spinner) spinner.succeed("Claude integration ready");
    if (out.json) {
      printJson({ ok: true, dryRun: false, actions });
      return;
    }
    if (out.quiet) return;
    console.log("");
    console.log(chalk14.green("Claude integration created:"));
    console.log(chalk14.gray(`  Skill:     ${path11.relative(groveRoot, skillPath)}`));
    if (createSettings) {
      if (!settingsExists) {
        console.log(chalk14.gray(`  Settings:  ${path11.relative(groveRoot, settingsPath)}`));
        console.log(chalk14.gray(`            (allows Bash(grove:*))`));
      } else {
        console.log(chalk14.yellow("  Settings:  already exists; not modified."));
        console.log(chalk14.gray("            To allow Grove commands, add:"));
        console.log(chalk14.gray('            "Bash(grove:*)" to .claude/settings.local.json permissions.allow'));
      }
    }
  } catch (error) {
    if (spinner) spinner.fail("Failed to set up Claude integration");
    const message = error instanceof Error ? error.message : String(error);
    if (out.json) {
      printJson({ ok: false, error: message });
    } else if (!out.quiet) {
      console.error(chalk14.red(message));
    }
    process.exit(1);
  }
}

// src/index.ts
program.name("grove").description("Git worktree manager with smart dependency handling").version("1.0.0").option("--json", "Output machine-readable JSON").option("-q, --quiet", "Suppress non-essential output");
program.command("init").description("Initialize grove in current repository").action(init);
program.command("plant <branch> [name]").description("Create a new worktree (plant a tree)").option("-n, --new", "Create a new branch").option("-b, --base <branch>", "Base branch for new branch").option("--no-install", "Skip dependency installation").option("-s, --switch", "Switch to the new tree after creating").action(plant);
program.command("tend <name>").description("Switch to a worktree (tend to a tree)").action(tend);
program.command("list").alias("ls").description("List all trees in the grove").action(list);
program.command("uproot <name>").description("Remove a worktree").option("-f, --force", "Force removal even with uncommitted changes").action(uproot);
program.command("open <name>").description("Open a worktree in Cursor, VS Code, or other editor").option("-e, --editor <editor>", "Specify editor (cursor, code, zed)").action(open);
program.command("spawn <name>").description("Start an interactive Claude Code session in a worktree").action(spawn);
program.command("ai <tool> <name> [args...]").description("Start an AI coding session in a worktree (tool: claude, codex, run)").allowUnknownOption(true).action(ai);
program.command("path <name>").description("Print the path to a worktree (for shell integration)").action(getPath);
program.command("adopt <path> [name]").description("Adopt an existing git worktree into grove").option("-s, --switch", "Switch to the adopted tree after adopting").action(adopt);
program.command("prune").description("Remove stale grove config entries for missing worktrees").option("--dry-run", "Show what would be pruned without changing config").action(prune);
program.command("doctor").description("Check grove health and optionally repair").option("--fix", "Attempt to repair common issues").action(doctor);
program.command("claude").description("Claude Code integration helpers").command("setup").description("Scaffold Grove Claude skill and safe permissions").option("--dry-run", "Show what would be created without writing").option("--force", "Overwrite skill file if it already exists").option("--no-settings", "Do not create .claude/settings.local.json").action(claudeSetup);
program.command("preview <action> [names...]").description('Start/stop preview server (action: tree name(s), "all", or "stop")').option("-d, --dev", "Run in development mode (default)").option("-b, --build", "Build and serve in production mode").option("--port <port>", "Use a specific port (single-tree only)", (v) => parseInt(v, 10)).option("--all", "Start previews for all trees").action(preview);
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