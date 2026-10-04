import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getCatalogs, type AllCatalogsType, type CatalogType } from "@lingui/cli/api";
import type * as CatalogModule from "../../node_modules/@lingui/cli/dist/api/catalog.js";
import type * as LinguiConfigModule from "../../node_modules/.pnpm/node_modules/@lingui/conf/dist/index.mjs";

export async function loadMessageConfig(cwd: string): Promise<Parameters<typeof getCatalogs>[0]> {
  // Resolve the official loader from the CLI's own installed dependency graph.
  const cliRequire = createRequire(import.meta.resolve("@lingui/cli"));
  const { getConfig } = (await import(
    pathToFileURL(cliRequire.resolve("@lingui/conf")).href
  )) as typeof LinguiConfigModule;
  return getConfig({ cwd });
}

export async function extractMessages({ cwd = process.cwd(), clean = false } = {}) {
  const config = await loadMessageConfig(cwd);
  // Keep the CLI's configured ordering, using the same helper as Catalog.make.
  const { order } = (await import(
    new URL("./catalog.js", import.meta.resolve("@lingui/cli/api")).href
  )) as typeof CatalogModule;
  const catalogs = await getCatalogs(config);
  const [product, preview] = catalogs;
  if (catalogs.length !== 2) {
    throw new Error("Message extraction requires the product and storybook catalogs.");
  }
  const [productSource, demoSource, previousProduct, previousPreview] = await Promise.all([
    product.collect(),
    preview.collect(),
    product.readAll(),
    preview.readAll(),
  ]);
  if (!productSource || !demoSource) {
    throw new Error("Lingui extraction failed; catalogs were not written.");
  }
  const demoOnly = Object.fromEntries(
    Object.entries(demoSource).filter(([id]) => !(id in productSource)),
  );
  const productSeed: AllCatalogsType = {};
  const previewSeed: AllCatalogsType = {};
  for (const locale of config.locales) {
    const oldProduct = { ...previousProduct[locale] };
    const oldPreview = { ...previousPreview[locale] };
    productSeed[locale] = Object.fromEntries([
      ...Object.entries(oldPreview).filter(([id]) => id in productSource),
      ...Object.entries(oldProduct).filter(([id]) => !(id in demoOnly)),
    ]);
    previewSeed[locale] = Object.fromEntries([
      ...Object.entries(oldProduct).filter(([id]) => id in demoOnly),
      ...Object.entries(oldPreview).filter(([id]) => !(id in productSource)),
    ]);
  }
  const productMessages = product.merge(productSeed, productSource, {});
  const previewMessages = preview.merge(previewSeed, demoOnly, {});
  for (const [catalog, messages] of [
    [product, productMessages],
    [preview, previewMessages],
  ] as const) {
    for (const locale of config.locales) {
      const catalogMessages = messages[locale];
      const retained = clean
        ? Object.fromEntries(
            Object.entries(catalogMessages).filter(([, message]) => !message.obsolete),
          )
        : catalogMessages;
      const output: CatalogType = order(config.orderBy, retained);
      const [created] = await catalog.write(locale, output);
      // The PO formatter completes standard headers when reading an existing
      // catalog. Finish that native normalization for newly created files now.
      if (created) await catalog.write(locale, output);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--clean")) {
    throw new Error(`Unsupported message extraction arguments: ${args.join(" ")}`);
  }
  await extractMessages({ clean: args.includes("--clean") });
}
