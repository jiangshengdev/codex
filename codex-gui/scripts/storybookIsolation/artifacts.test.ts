import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { verifyBuildFiles, verifyProductModules } from "./artifacts";

test("rejects a production build that includes demo implementation modules", () => {
  expect(() => {
    verifyProductModules(["/gui/src/main.tsx", "/gui/src/storybook/scenario.ts"]);
  }).toThrow("demo");
  expect(() => {
    verifyProductModules(["/gui/src/main.tsx", "/gui/src/app/ThemePreferenceControl.tsx"]);
  }).not.toThrow();
});

test("rejects stale build evidence after an emitted resource changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "storybook-artifacts-"));
  try {
    await writeFile(path.join(root, "app.js"), "export const value = 1;");
    const files = [
      {
        fileName: "app.js",
        sha256: createHash("sha256").update("export const value = 1;").digest("hex"),
      },
    ];
    await verifyBuildFiles(root, files);
    await writeFile(path.join(root, "app.js"), "export const value = 2;");
    await expect(verifyBuildFiles(root, files)).rejects.toThrow("stale");
  } finally {
    await rm(root, { recursive: true });
  }
});
