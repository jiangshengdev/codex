import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { extractMessages, loadMessageConfig } from "./messages";
import { getCatalogs } from "@lingui/cli/api";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

test("extraction moves demo translations while keeping shared product messages and unrelated history", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "storybook-messages-"));
  directories.push(cwd);
  await mkdir(path.join(cwd, "src/storybook"), { recursive: true });
  await writeFile(
    path.join(cwd, "lingui.config.mjs"),
    `export default {
    locales: ["en", "zh-CN"], sourceLocale: "en",
    catalogs: [
      {path: "<rootDir>/src/locales/{locale}", include: ["<rootDir>/src"], exclude: ["<rootDir>/src/storybook/**"]},
      {path: "<rootDir>/src/storybook/locales/{locale}", include: ["<rootDir>/src/storybook"]}
    ]
  }`,
  );
  await writeFile(
    path.join(cwd, "src/product.ts"),
    `import { msg } from "@lingui/core/macro";
    export const theme = msg({id: "theme", message: "Theme preference"});
    export const shared = msg({id: "shared", message: "Shared"});`,
  );
  await writeFile(
    path.join(cwd, "src/storybook/demo.ts"),
    `import { msg } from "@lingui/core/macro";
    export const shared = msg({id: "shared", message: "Shared"});
    export const demo = msg({id: "demo", message: "Demo {count}", comment: "Demo count"});`,
  );
  const config = await loadMessageConfig(cwd);
  const [product, preview] = await getCatalogs(config);
  for (const catalog of [product, preview]) {
    for (const locale of config.locales) {
      expect(catalog.getFilename(locale).startsWith(`${cwd}/`)).toBe(true);
    }
  }
  for (const locale of config.locales) {
    await product.write(locale, {
      theme: {
        message: "Theme preference",
        translation: locale === "en" ? "Theme preference" : "主题偏好",
      },
      shared: { message: "Shared", translation: locale === "en" ? "Shared" : "共享" },
      demo: {
        message: "Demo {count}",
        translation: locale === "en" ? "Demo {count}" : "演示 {count}",
      },
      historical: { message: "Old", translation: "历史", obsolete: true },
    });
  }
  await extractMessages({ cwd });
  const productMessages = await product.read("zh-CN");
  const previewMessages = await preview.read("zh-CN");
  expect(Object.keys(productMessages ?? {})).toEqual(["historical", "shared", "theme"]);
  expect(productMessages).toMatchObject({
    theme: { translation: "主题偏好" },
    shared: { translation: "共享" },
    historical: { obsolete: true },
  });
  expect(productMessages).not.toHaveProperty("demo");
  expect(Object.keys(previewMessages ?? {})).toEqual(["demo"]);
  expect(previewMessages?.demo.translation).toBe("演示 {count}");
  expect(previewMessages?.demo.comments).toEqual(["Demo count"]);
  const filenames = [product, preview].flatMap((catalog) =>
    config.locales.map((locale) => catalog.getFilename(locale)),
  );
  const first = await Promise.all(filenames.map((filename) => readFile(filename, "utf8")));
  await extractMessages({ cwd });
  expect(await Promise.all(filenames.map((filename) => readFile(filename, "utf8")))).toEqual(first);

  // A newly shared message gains a single product translation owner.
  const productFilename = path.join(cwd, "src/product.ts");
  const originalProduct = await readFile(productFilename, "utf8");
  await writeFile(
    productFilename,
    `${originalProduct}\nexport const demo = msg({id: "demo", message: "Demo {count}"});`,
  );
  await extractMessages({ cwd });
  expect(await product.read("zh-CN")).toHaveProperty("demo.translation", "演示 {count}");
  expect(await preview.read("zh-CN")).not.toHaveProperty("demo");

  // Moving back to demo-only preserves the translation, including with --clean.
  await writeFile(productFilename, originalProduct);
  await extractMessages({ cwd, clean: true });
  const cleanedProduct = await product.read("zh-CN");
  expect(cleanedProduct).not.toHaveProperty("demo");
  expect(cleanedProduct).not.toHaveProperty("historical");
  expect(cleanedProduct).toMatchObject({
    theme: { translation: "主题偏好" },
    shared: { translation: "共享" },
  });
  expect(await preview.read("zh-CN")).toHaveProperty("demo.translation", "演示 {count}");
});
