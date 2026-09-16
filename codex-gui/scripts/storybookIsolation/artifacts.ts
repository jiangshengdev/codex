import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Messages } from "@lingui/core";
import { getCatalogs } from "@lingui/cli/api";
import type { BuildReport } from "./buildReport";
import { loadMessageConfig } from "./messages";

export function verifyProductModules(modules: string[]) {
  assert(
    modules.some((id) => id.endsWith("/src/main.tsx")),
    "missing production entry",
  );
  const demo = modules.filter((id) =>
    /\/(?:src\/storybook|\.storybook)\/|\.stories\.[cm]?[jt]sx?(?:\?|$)|\/@storybook\//.test(id),
  );
  assert.equal(demo.length, 0, `production includes demo modules: ${demo.join(", ")}`);
}

export async function verifyBuildFiles(root: string, files: BuildReport["files"]) {
  assert(files.length > 0, "empty build report");
  for (const file of files) {
    const bytes = await readFile(path.join(root, file.fileName));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.sha256,
      `stale build evidence: ${file.fileName}`,
    );
  }
}

async function readMessages(root: string, report: BuildReport, modulePath: string) {
  const chunks = report.chunks.filter((chunk) =>
    chunk.modules.some((id) => id.split("?")[0] === modulePath),
  );
  assert.equal(chunks.length, 1, `expected one compiled catalog for ${modulePath}`);
  const catalog = (await import(pathToFileURL(path.join(root, chunks[0].fileName)).href)) as {
    messages: Messages;
  };
  return catalog.messages;
}

async function readCss(root: string, report: BuildReport) {
  const files = report.files.filter((file) => file.fileName.endsWith(".css"));
  assert(files.length > 0, "missing CSS assets");
  return (
    await Promise.all(files.map((file) => readFile(path.join(root, file.fileName), "utf8")))
  ).join("\n");
}

export async function verifyArtifacts(cwd = process.cwd()) {
  const productRoot = path.join(cwd, "dist");
  const previewRoot = path.join(cwd, "storybook-static");
  const reports = await Promise.all(
    ["production", "preview"].map(
      async (name) =>
        JSON.parse(
          await readFile(
            path.join(cwd, `node_modules/.tmp/storybook-isolation-${name}.json`),
            "utf8",
          ),
        ) as BuildReport,
    ),
  );
  const [productReport, previewReport] = reports;
  await verifyBuildFiles(productRoot, productReport.files);
  await verifyBuildFiles(previewRoot, previewReport.files);
  verifyProductModules(productReport.modules);
  assert(
    previewReport.modules.some((id) => id.includes("/src/storybook/")),
    "missing preview modules",
  );

  const config = await loadMessageConfig(cwd);
  const [product, preview] = await getCatalogs(config);
  for (const locale of config.locales) {
    const p = await product.read(locale);
    const d = await preview.read(locale);
    assert(p && d, "missing source catalogs for " + String(locale));
    const ids = (catalog: NonNullable<typeof p>) =>
      Object.keys(catalog)
        .filter((id) => !catalog[id].obsolete)
        .sort();
    const productIds = ids(p);
    const demoIds = ids(d);
    // Match the same authoritative catalog resolution used by the Vite plugin,
    // including retained obsolete translations and configured fallbacks.
    const compilationOptions = {
      sourceLocale: config.sourceLocale,
      fallbackLocales: config.fallbackLocales,
    };
    const productCompiledIds = Object.keys(
      (await product.getTranslations(locale, compilationOptions)).messages,
    ).sort();
    const demoCompiledIds = Object.keys(
      (await preview.getTranslations(locale, compilationOptions)).messages,
    ).sort();
    const productCompiledSet = new Set(productCompiledIds);
    assert(
      demoCompiledIds.every((id) => !productCompiledSet.has(id)),
      "compiled preview translations overlap production",
    );
    assert(productIds.length > 0 && demoIds.length > 0, "empty catalog boundary");
    assert(
      demoIds.every((id) => !(id in p)),
      "shared translations duplicated in preview",
    );
    for (const message of ["Theme preference", "Light theme", "Dark theme", "System theme"]) {
      assert(
        productIds.some((id) => p[id].message === message),
        `product lost ${message}`,
      );
    }
    assert.deepEqual(
      Object.keys(
        await readMessages(productRoot, productReport, product.getFilename(locale)),
      ).sort(),
      productCompiledIds,
    );
    assert.deepEqual(
      Object.keys(
        await readMessages(previewRoot, previewReport, product.getFilename(locale)),
      ).sort(),
      productCompiledIds,
    );
    assert.deepEqual(
      Object.keys(
        await readMessages(previewRoot, previewReport, preview.getFilename(locale)),
      ).sort(),
      demoCompiledIds,
    );
    console.log(locale, { product: productIds.length, demo: demoIds.length, isolated: true });
  }

  const [productionCss, previewCss] = await Promise.all([
    readCss(productRoot, productReport),
    readCss(previewRoot, previewReport),
  ]);
  // Assemble selectors so this verification source cannot itself add Tailwind candidates.
  const selector = (parts: string[]) => new RegExp("\\." + parts.join("-") + "\\s*\\{");
  const demoWidth = selector(["max", "w", "2xl"]);
  assert.doesNotMatch(productionCss, demoWidth, "demo-only width leaked to production");
  assert.match(previewCss, demoWidth, "preview lost its demo width");
  assert.match(productionCss, selector(["self", "start"]), "product lost its shared utility");
  assert.match(
    productionCss,
    selector(["toggle", "button", "group"]),
    "product lost theme control styles",
  );
  console.log(
    "Production module graph, asset hashes, CSS isolation and product protections passed.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const cwd = process.cwd();
  for (const [script, report] of [
    ["build", "production"],
    ["build-storybook", "preview"],
  ]) {
    execFileSync("pnpm", ["run", script], {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        CODEX_GUI_STORYBOOK_ISOLATION_REPORT: path.join(
          cwd,
          `node_modules/.tmp/storybook-isolation-${report}.json`,
        ),
      },
    });
  }
  await verifyArtifacts();
}
