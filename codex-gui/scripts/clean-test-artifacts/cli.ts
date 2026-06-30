import { cleanTestArtifacts } from "./core";

async function main(): Promise<void> {
  const result = await cleanTestArtifacts(process.cwd());

  if (result.removedCount === 0) {
    console.log("No test artifact directories found.");
    return;
  }

  console.log(`Removed ${String(result.removedCount)} test artifact directories:`);
  for (const removedPath of result.removedPaths) {
    console.log(removedPath);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
