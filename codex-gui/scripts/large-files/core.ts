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
    source: FileReportEntry[];
    test: FileReportEntry[];
  };
};

export type CliArgs = {
  limit: number;
};

export type BuildReportInput = {
  files: FileInput[];
  generatedAt: Date;
  limit: number;
  project: "codex-gui";
};

const DEFAULT_LIMIT = 10;
const SUPPORTED_EXTENSIONS = [".tsx", ".ts", ".css"] as const;

export function getSupportedFilePath(path: string): string | null {
  return SUPPORTED_EXTENSIONS.some((extension) => path.endsWith(extension)) ? path : null;
}

export function buildReport(input: BuildReportInput): LargeFilesReport {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error("--limit requires a positive integer");
  }

  const groups: LargeFilesReport["groups"] = {
    source: [],
    test: [],
  };

  for (const file of input.files) {
    const supportedPath = getSupportedFilePath(file.path);
    if (supportedPath === null) {
      continue;
    }

    const entry: FileReportEntry = {
      path: supportedPath,
      lines: countLines(file.content),
      bytes: file.bytes,
    };

    groups[getGroup(supportedPath)].push(entry);
  }

  return {
    project: input.project,
    generatedAt: input.generatedAt.toISOString(),
    limit: input.limit,
    groups: {
      source: sortEntries(groups.source).slice(0, input.limit),
      test: sortEntries(groups.test).slice(0, input.limit),
    },
  };
}

export function renderMarkdownReport(report: LargeFilesReport): string {
  return [
    "# Large Files Report",
    "",
    "- Project: codex-gui",
    `- Generated at: ${report.generatedAt}`,
    "- Scope: tracked .ts, .tsx, and .css files",
    `- Limit: ${String(report.limit)} per group`,
    "",
    renderGroup("Source", report.groups.source),
    "",
    renderGroup("Test", report.groups.test),
    "",
  ].join("\n");
}

export function parseCliArgs(args: string[]): CliArgs {
  let limit = DEFAULT_LIMIT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--" && index === 0) {
      continue;
    }

    if (arg !== "--limit") {
      throw new Error(`Unknown argument: ${arg}`);
    }

    if (index + 1 >= args.length) {
      throw new Error("--limit requires a positive integer");
    }

    const value = args[index + 1];
    limit = parseLimit(value);
    index += 1;
  }

  return { limit };
}

function getGroup(path: string): keyof LargeFilesReport["groups"] {
  if (
    path.includes("/__tests__/") ||
    path.startsWith("__tests__/") ||
    path.endsWith(".test.ts") ||
    path.endsWith(".test.tsx") ||
    path.endsWith(".browser.test.ts") ||
    path.endsWith(".browser.test.tsx") ||
    path.startsWith("e2e/")
  ) {
    return "test";
  }

  return "source";
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trailingNewlineAdjustment = normalized.endsWith("\n") ? 1 : 0;
  return normalized.split("\n").length - trailingNewlineAdjustment;
}

function sortEntries(entries: FileReportEntry[]): FileReportEntry[] {
  return [...entries].sort((left, right) => {
    if (right.lines !== left.lines) {
      return right.lines - left.lines;
    }

    if (right.bytes !== left.bytes) {
      return right.bytes - left.bytes;
    }

    return left.path.localeCompare(right.path);
  });
}

function renderGroup(title: string, entries: FileReportEntry[]): string {
  const rows = entries.map((entry, index) => {
    const rank = String(index + 1);
    const lines = String(entry.lines);
    const bytes = String(entry.bytes);
    return `| ${rank} | ${lines} | ${bytes} | ${entry.path} |`;
  });

  return [
    `## ${title}`,
    "",
    "| Rank | Lines | Bytes | Path |",
    "| ---: | ---: | ---: | --- |",
    ...rows,
  ].join("\n");
}

function parseLimit(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("--limit requires a positive integer");
  }

  return Number(value);
}
