import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { expect, test } from "vitest";
import { generatedArtifactWatchIgnored } from "./devServerWatch.ts";

test("the dev watcher observes source changes but excludes isolated run artifacts", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "gui-watch-")));
  const source = path.join(root, "source.ts");
  const artifacts = path.join(root, ".reports", "run-example", "artifacts");
  await mkdir(artifacts, { recursive: true });
  await writeFile(source, "export const value = 1;");
  await writeFile(path.join(artifacts, "result.json"), "{}");
  const server = await createServer({
    configFile: false,
    root,
    server: { watch: { ignored: generatedArtifactWatchIgnored } },
  });
  try {
    await expect.poll(() => server.watcher.getWatched()[root]).toContain("source.ts");
    expect(server.watcher.getWatched()[root]).not.toContain(".reports");
    expect(server.watcher.getWatched()[artifacts]).toBeUndefined();
    const changes: string[] = [];
    server.watcher.on("change", (file) => changes.push(file));
    await writeFile(path.join(artifacts, "result.json"), '{"code":0}');
    await writeFile(source, "export const value = 2;");
    await expect.poll(() => changes).toContain(source);
    expect(changes).toEqual([source]);
  } finally {
    await server.close();
    await rm(root, { recursive: true });
  }
});
