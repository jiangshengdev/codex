import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  buildReport,
  getSupportedFilePath,
  parseCliArgs,
  renderMarkdownReport,
  type FileInput,
} from "./core";

const execFileAsync = promisify(execFile);
const REPORT_DIR = ".reports";
const MARKDOWN_REPORT_PATH = `${REPORT_DIR}/large-files.md`;
const JSON_REPORT_PATH = `${REPORT_DIR}/large-files.json`;

async function main(): Promise<void> {
  const { limit } = parseCliArgs(process.argv.slice(2));
  const files = await readTrackedFiles();
  const report = buildReport({
    files,
    generatedAt: new Date(),
    limit,
    project: "codex-gui",
  });

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(MARKDOWN_REPORT_PATH, renderMarkdownReport(report), "utf8");
  await writeFile(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(path.resolve(MARKDOWN_REPORT_PATH));
  console.log(path.resolve(JSON_REPORT_PATH));
}

async function readTrackedFiles(): Promise<FileInput[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 64,
  });

  const paths = stdout
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0)
    .filter((path) => getSupportedFilePath(path) !== null);

  return Promise.all(
    paths.map(async (path) => {
      const [content, metadata] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      return {
        path,
        content,
        bytes: metadata.size,
      };
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
