import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function createTestTempRoots(prefix: string) {
  const roots: string[] = [];

  return {
    async create(): Promise<string> {
      const root = await mkdtemp(path.join(os.tmpdir(), prefix));
      roots.push(root);
      return root;
    },
    async cleanup(): Promise<void> {
      await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
    },
  };
}
