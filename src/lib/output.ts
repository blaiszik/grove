export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

export function getOutputOptions(argv: string[] = process.argv): OutputOptions {
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet') || argv.includes('-q');
  return { json, quiet };
}

export function shouldUseSpinner(opts: OutputOptions): boolean {
  return !opts.json && !opts.quiet;
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

