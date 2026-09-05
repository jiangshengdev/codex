import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeProject } from "./analyze";
import type { BoundaryPolicy } from "./contracts";
import { boundaryPolicy } from "./policy";

export function runCli({
  projectRoot,
  policy,
  write,
}: {
  projectRoot: string;
  policy: BoundaryPolicy;
  write: (text: string) => void;
}): number {
  try {
    const result = analyzeProject({ projectRoot, policy });
    for (const diagnostic of result.diagnostics)
      write(
        `${diagnostic.file}:${String(diagnostic.line)}:${String(diagnostic.column)} [${diagnostic.code}] ${diagnostic.message}\n`,
      );
    if (result.diagnostics.length > 0) return 1;
    write(`Feature boundaries passed (${String(result.files.length)} source files).\n`);
    return 0;
  } catch (error) {
    write(
      `Feature boundary analysis failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runCli({
    projectRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    policy: boundaryPolicy,
    write: (text) => process.stdout.write(text),
  });
}
