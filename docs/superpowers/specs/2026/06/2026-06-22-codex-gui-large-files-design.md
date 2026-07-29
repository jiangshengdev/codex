# codex-gui Large Files Report Design

## Goal

Add a local reporting tool for `codex-gui` that identifies the largest frontend source and test files by line count. The first version is a local analysis aid only: it generates Markdown and JSON reports, does not enforce thresholds, and is not added to the `pnpm run ci` chain.

## Decisions

- The tool is scoped to `codex-gui`.
- The npm script is `analyze:large-files`.
- The script uses `tsx` and TypeScript files.
- File discovery uses `git ls-files`, so only tracked files are included.
- The default file scope is `.ts`, `.tsx`, and `.css`.
- Files are split into `source` and `test` groups.
- Test files are detected by path convention:
  - paths under `__tests__/`
  - files ending in `.test.ts` or `.test.tsx`
  - files ending in `.browser.test.ts` or `.browser.test.tsx`
  - paths under `e2e/`
- All other tracked `.ts`, `.tsx`, and `.css` files are treated as `source`.
- Sorting is by descending line count, with byte count as a secondary value in the report.
- The default limit is Top 10 per group.
- `--limit` can override the default and must be a positive integer.
- Invalid CLI arguments exit non-zero, write errors to stderr, and do not generate reports.
- Empty results are valid and still produce report files with empty groups/tables.

## Files

Create:

- `codex-gui/scripts/large-files/cli.ts`
- `codex-gui/scripts/large-files/core.ts`
- `codex-gui/scripts/large-files/core.test.ts`

Modify:

- `codex-gui/package.json`
- `codex-gui/tsconfig.node.json`
- `codex-gui/.gitignore`

Generated at runtime:

- `codex-gui/.reports/large-files.md`
- `codex-gui/.reports/large-files.json`

The `.reports/` directory is a local analysis output directory and should be ignored by git.

## Architecture

The implementation is split into a CLI wrapper and a pure core module.

`cli.ts` owns process-facing behavior:

- parse `--limit`
- run `git ls-files`
- read file contents and sizes
- create `.reports/`
- write Markdown and JSON files
- print a short stdout summary
- print argument or runtime errors to stderr

`core.ts` owns deterministic logic:

- classify paths into `source` or `test`
- filter supported extensions
- count lines and bytes from file data
- sort entries
- apply the Top N limit
- build the JSON payload
- render the Markdown report

`core.test.ts` covers the pure logic without writing `.reports/`.

This keeps filesystem and process behavior small while making the report shape and grouping rules easy to test.

## Output

The command:

```sh
pnpm run analyze:large-files
```

generates both report files and prints only a short summary:

```text
Wrote .reports/large-files.md
Wrote .reports/large-files.json
```

The command:

```sh
pnpm run analyze:large-files -- --limit 30
```

generates the same files with Top 30 per group.

### Markdown

Path:

```text
codex-gui/.reports/large-files.md
```

Shape:

```md
# Large Files Report

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
```

The Markdown report keeps a short summary but does not include detailed total statistics.

### JSON

Path:

```text
codex-gui/.reports/large-files.json
```

Shape:

```json
{
  "project": "codex-gui",
  "generatedAt": "2026-06-22T00:00:00.000Z",
  "limit": 10,
  "groups": {
    "source": [
      {
        "path": "src/App.tsx",
        "lines": 134,
        "bytes": 4373
      }
    ],
    "test": [
      {
        "path": "src/__tests__/App.browser.test.tsx",
        "lines": 396,
        "bytes": 15087
      }
    ]
  }
}
```

JSON contains only the Top N entries per group. It does not include summary totals or absolute local paths.

## Type Checking and Tests

`scripts/**/*.ts` should be included in `tsconfig.node.json`, which is already referenced by the root `tsconfig.json`. This makes `pnpm run type-check` cover the script.

The default Vitest config should pick up `scripts/large-files/core.test.ts`, so `pnpm run test` covers the core report logic.

The first implementation should verify:

- supported extension filtering
- `source` versus `test` classification
- line and byte counting
- descending line sorting
- Top N limiting
- Markdown output shape
- JSON output shape
- empty input behavior
- invalid `--limit` behavior through the CLI parsing boundary, if parsing is exposed from `core.ts`

## Validation Plan

After implementation, run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test -- scripts/large-files/core.test.ts
pnpm run analyze:large-files
pnpm run type-check
pnpm run lint
pnpm run format
```

Do not add `analyze:large-files` to `pnpm run ci` in the first version.

## Out of Scope

- CI gatekeeping
- line or byte thresholds
- scanning untracked files
- committing generated reports
- full repository analysis outside `codex-gui`
- detailed summary statistics in JSON
- file categories beyond `source` and `test`
