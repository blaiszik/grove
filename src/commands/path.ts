import { readConfig, getTreePath } from '../lib/config.js';

export async function getPath(name: string): Promise<void> {
  const cwd = process.cwd();

  try {
    const config = await readConfig(cwd);

    // Validate tree exists
    if (!config.trees[name]) {
      console.error(`Tree '${name}' not found`);
      process.exit(1);
    }

    const treePath = getTreePath(name, cwd);

    // Output just the path - useful for shell integration
    // e.g., cd $(grove path feature-x)
    console.log(treePath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
