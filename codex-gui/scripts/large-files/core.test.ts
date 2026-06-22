import { describe, expect, test } from "vitest";

import {
  buildReport,
  getSupportedFilePath,
  parseCliArgs,
  renderMarkdownReport,
  type FileInput,
} from "./core";

const GENERATED_AT = new Date("2026-06-22T00:00:00.000Z");
const GENERATED_AT_ISO = "2026-06-22T00:00:00.000Z";

function file(path: string, content: string, bytes = Buffer.byteLength(content)): FileInput {
  return { path, content, bytes };
}

describe("getSupportedFilePath", () => {
  test("keeps supported tracked source file extensions", () => {
    expect(getSupportedFilePath("src/App.ts")).toBe("src/App.ts");
    expect(getSupportedFilePath("src/App.tsx")).toBe("src/App.tsx");
    expect(getSupportedFilePath("src/App.css")).toBe("src/App.css");
    expect(getSupportedFilePath("src/App.d.ts")).toBe("src/App.d.ts");
  });

  test("filters unsupported file extensions", () => {
    expect(getSupportedFilePath("src/App.js")).toBeNull();
    expect(getSupportedFilePath("README.md")).toBeNull();
  });
});

describe("buildReport", () => {
  test("classifies test paths by directory and suffix", () => {
    const report = buildReport({
      files: [
        file("src/__tests__/helper.ts", "one"),
        file("src/App.test.ts", "one"),
        file("src/App.test.tsx", "one"),
        file("src/App.browser.test.ts", "one"),
        file("src/App.browser.test.tsx", "one"),
        file("e2e/app.ts", "one"),
        file("src/App.ts", "one"),
        file("src/App.d.ts", "one"),
        file("src/e2e/helper.ts", "one"),
      ],
      generatedAt: GENERATED_AT,
      limit: 10,
      project: "codex-gui",
    });

    expect(report.groups.test.map((entry) => entry.path).sort()).toEqual([
      "e2e/app.ts",
      "src/App.browser.test.ts",
      "src/App.browser.test.tsx",
      "src/App.test.ts",
      "src/App.test.tsx",
      "src/__tests__/helper.ts",
    ]);
    expect(report.groups.source.map((entry) => entry.path).sort()).toEqual([
      "src/App.d.ts",
      "src/App.ts",
      "src/e2e/helper.ts",
    ]);
  });

  test("counts lines and bytes from file content and stat size", () => {
    const report = buildReport({
      files: [file("src/App.ts", "alpha\nbeta\n", 42)],
      generatedAt: GENERATED_AT,
      limit: 10,
      project: "codex-gui",
    });

    expect(report.groups.source).toEqual([
      {
        path: "src/App.ts",
        lines: 2,
        bytes: 42,
      },
    ]);
  });

  test("sorts by lines, bytes, then path and applies each group limit", () => {
    const report = buildReport({
      files: [
        file("src/c.ts", "1\n2\n3", 10),
        file("src/b.ts", "1\n2\n3", 20),
        file("src/a.ts", "1\n2\n3", 20),
        file("src/long.test.ts", "1\n2\n3\n4", 1),
        file("src/short.test.ts", "1", 99),
      ],
      generatedAt: GENERATED_AT,
      limit: 2,
      project: "codex-gui",
    });

    expect(report.groups.source.map((entry) => entry.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(report.groups.test.map((entry) => entry.path)).toEqual([
      "src/long.test.ts",
      "src/short.test.ts",
    ]);
  });

  test("returns the exact JSON-ready output shape for empty input", () => {
    const report = buildReport({
      files: [],
      generatedAt: GENERATED_AT,
      limit: 10,
      project: "codex-gui",
    });

    expect(report).toEqual({
      project: "codex-gui",
      generatedAt: GENERATED_AT_ISO,
      limit: 10,
      groups: {
        source: [],
        test: [],
      },
    });
  });

  test("returns entries with only path, lines, and bytes", () => {
    const report = buildReport({
      files: [file("src/App.ts", "alpha", 5), file("src/App.test.ts", "beta", 4)],
      generatedAt: GENERATED_AT,
      limit: 10,
      project: "codex-gui",
    });

    expect(report).toEqual({
      project: "codex-gui",
      generatedAt: GENERATED_AT_ISO,
      limit: 10,
      groups: {
        source: [{ path: "src/App.ts", lines: 1, bytes: 5 }],
        test: [{ path: "src/App.test.ts", lines: 1, bytes: 4 }],
      },
    });
  });
});

describe("renderMarkdownReport", () => {
  test("renders the exact required summary and group tables", () => {
    const markdown = renderMarkdownReport(
      buildReport({
        files: [file("src/App.tsx", "one\ntwo", 21), file("src/App.test.tsx", "one", 11)],
        generatedAt: GENERATED_AT,
        limit: 10,
        project: "codex-gui",
      }),
    );

    expect(markdown).toBe(`# Large Files Report

- Project: codex-gui
- Generated at: ${GENERATED_AT_ISO}
- Scope: tracked .ts, .tsx, and .css files
- Limit: 10 per group

## Source

| Rank | Lines | Bytes | Path |
| ---: | ---: | ---: | --- |
| 1 | 2 | 21 | src/App.tsx |

## Test

| Rank | Lines | Bytes | Path |
| ---: | ---: | ---: | --- |
| 1 | 1 | 11 | src/App.test.tsx |
`);
  });

  test("renders empty groups as empty tables", () => {
    const markdown = renderMarkdownReport(
      buildReport({
        files: [],
        generatedAt: GENERATED_AT,
        limit: 10,
        project: "codex-gui",
      }),
    );

    expect(markdown).toBe(`# Large Files Report

- Project: codex-gui
- Generated at: ${GENERATED_AT_ISO}
- Scope: tracked .ts, .tsx, and .css files
- Limit: 10 per group

## Source

| Rank | Lines | Bytes | Path |
| ---: | ---: | ---: | --- |

## Test

| Rank | Lines | Bytes | Path |
| ---: | ---: | ---: | --- |
`);
  });
});

describe("parseCliArgs", () => {
  test("uses the default limit when no args are provided", () => {
    expect(parseCliArgs([])).toEqual({ limit: 10 });
  });

  test("parses a positive integer limit", () => {
    expect(parseCliArgs(["--limit", "3"])).toEqual({ limit: 3 });
  });

  test("ignores the pnpm argument separator", () => {
    expect(parseCliArgs(["--", "--limit", "3"])).toEqual({ limit: 3 });
  });

  test("rejects invalid arguments", () => {
    expect(() => parseCliArgs(["--limit", "0"])).toThrow("--limit requires a positive integer");
    expect(() => parseCliArgs(["--limit", "1.5"])).toThrow("--limit requires a positive integer");
    expect(() => parseCliArgs(["--limit"])).toThrow("--limit requires a positive integer");
    expect(() => parseCliArgs(["--unknown"])).toThrow("Unknown argument: --unknown");
  });
});
