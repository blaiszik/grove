import { readConfig, assertValidTreeName } from '../lib/config.js';
import { getOutputOptions, printJson } from '../lib/output.js';

export async function getPath(name: string): Promise<void> {
  const cwd = process.cwd();
  const out = getOutputOptions();

  try {
    assertValidTreeName(name);
    const config = await readConfig(cwd);

    // Validate tree exists
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

    // Output just the path - useful for shell integration
    // e.g., cd $(grove path feature-x)
    console.log(treePath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
