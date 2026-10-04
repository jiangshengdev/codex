import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inspectButtonCss, inspectButtons } from "./core";

async function inspectDirectory(directory: string): Promise<string[]> {
  const errors: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["__tests__", "storybook"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) errors.push(...(await inspectDirectory(file)));
    else if (/\.(tsx|css)$/.test(entry.name) && !/\.(?:stories|test)\./.test(entry.name)) {
      const source = await readFile(file, "utf8");
      const report = entry.name.endsWith(".css")
        ? inspectButtonCss(file, source)
        : inspectButtons(file, source);
      errors.push(...report.errors);
    }
  }
  return errors;
}

const errors = await inspectDirectory("src");
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Button sizing scenario and CSS checks passed; rendered geometry remains covered by browser tests.",
  );
}
