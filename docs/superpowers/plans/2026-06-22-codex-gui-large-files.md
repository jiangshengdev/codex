# codex-gui Large Files Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `codex-gui` 增加本地大文件分析脚本，生成 Markdown 和 JSON 报告，默认只报告 tracked `.ts`、`.tsx`、`.css` 文件中的 source/test Top 10。

**Architecture:** 使用 `scripts/large-files/cli.ts` 处理命令行、文件系统和 `git ls-files`，使用 `scripts/large-files/core.ts` 承载可测试的纯逻辑。`core.test.ts` 先覆盖分类、过滤、排序、输出结构和参数解析，再实现最小代码。

**Tech Stack:** Node.js、TypeScript、tsx、Vitest、pnpm scripts。

---

## 文件结构

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.test.ts`
  - 负责纯逻辑测试，不写 `.reports/`。
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.ts`
  - 负责类型、过滤、分类、统计、排序、Top N、Markdown/JSON 渲染、`--limit` 解析。
- Create: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/cli.ts`
  - 负责运行 `git ls-files`、读取文件、创建 `.reports/`、写报告、stdout/stderr 和退出码。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/package.json`
  - 增加 `analyze:large-files` 脚本。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/tsconfig.node.json`
  - 将 `scripts/**/*.ts` 纳入 `pnpm run type-check`。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/.gitignore`
  - 忽略 `.reports/`。

---

### Task 1: 写核心逻辑失败测试

**Files:**

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.test.ts`
- Depends on: `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-large-files-design.md`

- [ ] **Step 1: 创建测试文件**

在 `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.test.ts` 写入：

```ts
import { describe, expect, it } from "vitest";
import {
  buildReport,
  getSupportedFilePath,
  parseCliArgs,
  renderMarkdownReport,
  type FileInput,
} from "./core";

const generatedAt = new Date("2026-06-22T00:00:00.000Z");

describe("large files report core", () => {
  it("filters supported frontend source extensions", () => {
    expect(getSupportedFilePath("src/App.ts")).toBe("src/App.ts");
    expect(getSupportedFilePath("src/App.tsx")).toBe("src/App.tsx");
    expect(getSupportedFilePath("src/index.css")).toBe("src/index.css");
    expect(getSupportedFilePath("src/locales/en.po")).toBeNull();
    expect(getSupportedFilePath("package.json")).toBeNull();
  });

  it("groups source and test files, sorts by line count, and applies the limit", () => {
    const files: Array<FileInput> = [
      { path: "src/App.tsx", content: "one\ntwo\nthree\n", bytes: 14 },
      { path: "src/features/a.ts", content: "one\n", bytes: 4 },
      { path: "src/features/b.ts", content: "one\ntwo\n", bytes: 8 },
      { path: "src/__tests__/App.test.tsx", content: "1\n2\n3\n4\n", bytes: 8 },
      { path: "src/features/model.test.ts", content: "1\n2\n3\n", bytes: 6 },
      { path: "src/features/model.browser.test.tsx", content: "1\n2\n", bytes: 4 },
      { path: "e2e/app.spec.ts", content: "1\n2\n3\n4\n5\n", bytes: 10 },
      { path: "src/locales/en.po", content: "ignored\n", bytes: 8 },
    ];

    const report = buildReport({
      files,
      generatedAt,
      limit: 2,
      project: "codex-gui",
    });

    expect(report).toEqual({
      project: "codex-gui",
      generatedAt: "2026-06-22T00:00:00.000Z",
      limit: 2,
      groups: {
        source: [
          { path: "src/App.tsx", lines: 3, bytes: 14 },
          { path: "src/features/b.ts", lines: 2, bytes: 8 },
        ],
        test: [
          { path: "e2e/app.spec.ts", lines: 5, bytes: 10 },
          { path: "src/__tests__/App.test.tsx", lines: 4, bytes: 8 },
        ],
      },
    });
  });

  it("keeps empty groups when no files match", () => {
    const report = buildReport({
      files: [{ path: "README.md", content: "# ignored\n", bytes: 10 }],
      generatedAt,
      limit: 10,
      project: "codex-gui",
    });

    expect(report.groups).toEqual({ source: [], test: [] });
  });

  it("renders markdown with summary and stable tables", () => {
    const markdown = renderMarkdownReport({
      project: "codex-gui",
      generatedAt: "2026-06-22T00:00:00.000Z",
      limit: 10,
      groups: {
        source: [{ path: "src/App.tsx", lines: 134, bytes: 4373 }],
        test: [{ path: "src/__tests__/App.browser.test.tsx", lines: 396, bytes: 15087 }],
      },
    });

    expect(markdown).toBe(`# Large Files Report

- Project: codex-gui
- Generated at: 2026-06-22T00:00:00.000Z
- Scope: tracked .ts, .tsx, and .css files
- Limit: 10 per group

## Source

| Rank | Lines | Bytes | Path |
| ---: | ---: | ---: | --- |
| 1 | 134 | 4373 | src/App.tsx |

## Test

| Rank | Lines | Bytes | Path |
| ---: | ---: | ---: | --- |
| 1 | 396 | 15087 | src/__tests__/App.browser.test.tsx |
`);
  });

  it("parses a positive integer limit and rejects invalid values", () => {
    expect(parseCliArgs([])).toEqual({ limit: 10 });
    expect(parseCliArgs(["--limit", "30"])).toEqual({ limit: 30 });
    expect(() => parseCliArgs(["--limit"])).toThrow("--limit requires a positive integer");
    expect(() => parseCliArgs(["--limit", "0"])).toThrow("--limit requires a positive integer");
    expect(() => parseCliArgs(["--limit", "abc"])).toThrow("--limit requires a positive integer");
    expect(() => parseCliArgs(["--unknown"])).toThrow("Unknown argument: --unknown");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test -- scripts/large-files/core.test.ts
```

Expected:

```text
FAIL  scripts/large-files/core.test.ts
Cannot find module './core'
```

如果失败信息因 Vitest 版本不同而措辞不同，只要失败原因是 `core.ts` 尚不存在即可继续。

---

### Task 2: 实现可测试核心模块

**Files:**

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.ts`
- Test: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.test.ts`

- [ ] **Step 1: 写最小核心实现**

在 `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.ts` 写入：

```ts
export type FileInput = {
  path: string;
  content: string;
  bytes: number;
};

export type FileReportEntry = {
  path: string;
  lines: number;
  bytes: number;
};

export type LargeFilesReport = {
  project: "codex-gui";
  generatedAt: string;
  limit: number;
  groups: {
    source: Array<FileReportEntry>;
    test: Array<FileReportEntry>;
  };
};

type BuildReportOptions = {
  files: Array<FileInput>;
  generatedAt: Date;
  limit: number;
  project: "codex-gui";
};

type CliOptions = {
  limit: number;
};

const defaultLimit = 10;
const supportedExtensions = [".ts", ".tsx", ".css"];

export function getSupportedFilePath(path: string): string | null {
  return supportedExtensions.some((extension) => path.endsWith(extension)) ? path : null;
}

function isTestPath(path: string): boolean {
  return (
    path.startsWith("e2e/") ||
    path.includes("/__tests__/") ||
    path.endsWith(".test.ts") ||
    path.endsWith(".test.tsx") ||
    path.endsWith(".browser.test.ts") ||
    path.endsWith(".browser.test.tsx")
  );
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  return content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
}

function compareEntries(left: FileReportEntry, right: FileReportEntry): number {
  if (left.lines !== right.lines) {
    return right.lines - left.lines;
  }

  if (left.bytes !== right.bytes) {
    return right.bytes - left.bytes;
  }

  return left.path.localeCompare(right.path);
}

export function buildReport(options: BuildReportOptions): LargeFilesReport {
  const source: Array<FileReportEntry> = [];
  const test: Array<FileReportEntry> = [];

  for (const file of options.files) {
    const supportedPath = getSupportedFilePath(file.path);
    if (supportedPath == null) {
      continue;
    }

    const entry = {
      path: supportedPath,
      lines: countLines(file.content),
      bytes: file.bytes,
    };

    if (isTestPath(supportedPath)) {
      test.push(entry);
    } else {
      source.push(entry);
    }
  }

  return {
    project: options.project,
    generatedAt: options.generatedAt.toISOString(),
    limit: options.limit,
    groups: {
      source: source.sort(compareEntries).slice(0, options.limit),
      test: test.sort(compareEntries).slice(0, options.limit),
    },
  };
}

function renderTable(entries: Array<FileReportEntry>): string {
  const rows = entries.map(
    (entry, index) => `| ${index + 1} | ${entry.lines} | ${entry.bytes} | ${entry.path} |`,
  );

  return ["| Rank | Lines | Bytes | Path |", "| ---: | ---: | ---: | --- |", ...rows].join("\n");
}

export function renderMarkdownReport(report: LargeFilesReport): string {
  return `# Large Files Report

- Project: ${report.project}
- Generated at: ${report.generatedAt}
- Scope: tracked .ts, .tsx, and .css files
- Limit: ${report.limit} per group

## Source

${renderTable(report.groups.source)}

## Test

${renderTable(report.groups.test)}
`;
}

export function parseCliArgs(args: Array<string>): CliOptions {
  if (args.length === 0) {
    return { limit: defaultLimit };
  }

  if (args.length === 2 && args[0] === "--limit") {
    const limit = Number(args[1]);
    if (Number.isInteger(limit) && limit > 0) {
      return { limit };
    }

    throw new Error("--limit requires a positive integer");
  }

  if (args[0] === "--limit") {
    throw new Error("--limit requires a positive integer");
  }

  throw new Error(`Unknown argument: ${args[0]}`);
}
```

- [ ] **Step 2: 运行核心测试确认通过**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test -- scripts/large-files/core.test.ts
```

Expected:

```text
PASS  scripts/large-files/core.test.ts
```

---

### Task 3: 实现 CLI 和 package script

**Files:**

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/cli.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/package.json`

- [ ] **Step 1: 写 CLI 入口**

在 `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/cli.ts` 写入：

```ts
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildReport, parseCliArgs, renderMarkdownReport, type FileInput } from "./core";

const execFileAsync = promisify(execFile);
const project = "codex-gui";
const reportsDir = ".reports";
const markdownReportPath = path.join(reportsDir, "large-files.md");
const jsonReportPath = path.join(reportsDir, "large-files.json");
const rootDir = path.join(import.meta.dirname, "..", "..");

async function listTrackedFiles(rootDir: string): Promise<Array<string>> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  return stdout.split("\0").filter((filePath) => filePath.length > 0);
}

async function readFileInput(filePath: string): Promise<FileInput> {
  const absolutePath = path.join(rootDir, filePath);
  const [content, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);

  return {
    path: filePath,
    content,
    bytes: fileStat.size,
  };
}

async function main(): Promise<void> {
  const { limit } = parseCliArgs(process.argv.slice(2));
  const trackedFiles = await listTrackedFiles(rootDir);
  const files = await Promise.all(trackedFiles.map(readFileInput));
  const report = buildReport({
    files,
    generatedAt: new Date(),
    limit,
    project,
  });

  await mkdir(path.join(rootDir, reportsDir), { recursive: true });
  await Promise.all([
    writeFile(path.join(rootDir, markdownReportPath), renderMarkdownReport(report), "utf8"),
    writeFile(path.join(rootDir, jsonReportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  ]);

  console.log(`Wrote ${markdownReportPath}`);
  console.log(`Wrote ${jsonReportPath}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
```

- [ ] **Step 2: 增加 npm script**

在 `/Users/jiangsheng/cnb/codex/codex-gui/package.json` 的 `scripts` 中，在 `test:e2e` 后加入：

```json
"analyze:large-files": "tsx scripts/large-files/cli.ts",
```

保持 JSON 有效，并不要改动 `ci` 脚本。

- [ ] **Step 3: 运行脚本确认生成报告**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run analyze:large-files
```

Expected stdout:

```text
Wrote .reports/large-files.md
Wrote .reports/large-files.json
```

Expected files:

```text
/Users/jiangsheng/cnb/codex/codex-gui/.reports/large-files.md
/Users/jiangsheng/cnb/codex/codex-gui/.reports/large-files.json
```

- [ ] **Step 4: 验证 limit 参数**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run analyze:large-files -- --limit 3
```

Expected:

```text
Wrote .reports/large-files.md
Wrote .reports/large-files.json
```

检查 `.reports/large-files.json` 中 `limit` 为 `3`，且 `groups.source` 和 `groups.test` 每组最多 3 项。

---

### Task 4: 接入 type-check、ignore 和错误路径验证

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/tsconfig.node.json`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/.gitignore`
- Test: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.test.ts`

- [ ] **Step 1: 将脚本纳入 Node tsconfig**

在 `/Users/jiangsheng/cnb/codex/codex-gui/tsconfig.node.json` 的 `include` 数组末尾加入：

```json
"scripts/**/*.ts"
```

最终 `include` 应为：

```json
"include": [
  "vite.config.*",
  "vitest.config.*",
  "vitest.*.config.*",
  "playwright.config.*",
  "lingui.config.*",
  "eslint.config.*",
  "scripts/**/*.ts"
]
```

- [ ] **Step 2: 忽略本地报告目录**

在 `/Users/jiangsheng/cnb/codex/codex-gui/.gitignore` 的测试或本地产物区域加入：

```gitignore
.reports/
```

- [ ] **Step 3: 验证非法参数失败且不生成新报告**

先删除本地报告，避免误判旧文件：

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
rm -rf .reports
pnpm run analyze:large-files -- --limit 0
```

Expected:

```text
--limit requires a positive integer
```

Expected exit code: non-zero.

Expected:

```text
.reports/large-files.md does not exist
.reports/large-files.json does not exist
```

- [ ] **Step 4: 重新生成报告供人工查看**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run analyze:large-files
```

Expected:

```text
Wrote .reports/large-files.md
Wrote .reports/large-files.json
```

---

### Task 5: 运行验证命令并处理格式问题

**Files:**

- Test: `/Users/jiangsheng/cnb/codex/codex-gui/scripts/large-files/core.test.ts`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/package.json`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/tsconfig.node.json`
- Verify: `/Users/jiangsheng/cnb/codex/codex-gui/.gitignore`

- [ ] **Step 1: 跑核心测试**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test -- scripts/large-files/core.test.ts
```

Expected:

```text
PASS  scripts/large-files/core.test.ts
```

- [ ] **Step 2: 跑脚本**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run analyze:large-files
```

Expected:

```text
Wrote .reports/large-files.md
Wrote .reports/large-files.json
```

- [ ] **Step 3: 跑 type-check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected:

```text
tsc -b --noEmit
```

命令退出码为 0。

- [ ] **Step 4: 跑 lint**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
```

Expected:

```text
pnpm eslint .
```

命令退出码为 0。

- [ ] **Step 5: 跑 format 检查**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format
```

Expected:

```text
prettier --check .
```

命令退出码为 0。

如果 format 失败，运行：

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:fix
pnpm run format
```

然后不要因为 format fix 重新跑全部测试，除非 format 修改了非格式内容。

---

### Task 6: 最终人工检查

**Files:**

- Review: `/Users/jiangsheng/cnb/codex/codex-gui/.reports/large-files.md`
- Review: `/Users/jiangsheng/cnb/codex/codex-gui/.reports/large-files.json`
- Review: `/Users/jiangsheng/cnb/codex/codex-gui/package.json`

- [ ] **Step 1: 检查 Markdown 报告**

Run:

```sh
sed -n '1,120p' /Users/jiangsheng/cnb/codex/codex-gui/.reports/large-files.md
```

Expected:

```text
# Large Files Report
```

并确认包含：

```text
## Source
## Test
```

- [ ] **Step 2: 检查 JSON 报告**

Run:

```sh
node -e 'const report = require("/Users/jiangsheng/cnb/codex/codex-gui/.reports/large-files.json"); console.log(report.project, report.limit, Array.isArray(report.groups.source), Array.isArray(report.groups.test));'
```

Expected:

```text
codex-gui 10 true true
```

- [ ] **Step 3: 检查 package script 未接入 CI**

Run:

```sh
node -e 'const packageJson = require("/Users/jiangsheng/cnb/codex/codex-gui/package.json"); console.log(packageJson.scripts["analyze:large-files"]); console.log(packageJson.scripts.ci);'
```

Expected:

```text
tsx scripts/large-files/cli.ts
pnpm run format && pnpm run lint && pnpm run type-check && pnpm run test
```

- [ ] **Step 4: 检查 git 状态**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git status --short
```

Expected tracked/untracked implementation files:

```text
 M codex-gui/.gitignore
 M codex-gui/package.json
 M codex-gui/tsconfig.node.json
?? codex-gui/scripts/large-files/
?? docs/superpowers/
```

不要 stage，不要 commit，除非用户明确要求。
