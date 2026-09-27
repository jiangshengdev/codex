import { expect, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";

type Binding = { path: string; sha256: string };
type Entry = Binding & { screenshots: Binding[] };
type Cell = {
  story: string;
  browser: string;
  layout: string;
  route: string;
  entries: Record<string, Entry>;
};
type Manifest = {
  version: 1;
  // Evidence compatibility is an explicit reviewed input, never inferred from row counts.
  compatibility: null | { report: Binding; currentSourcesAndFixture: Binding[] };
  cells: Cell[];
};
type Trace = {
  state: string;
  mode: "capture" | "replay-with-inherited-images";
  source?: Binding;
  key: string | null;
  steps: { step: number; liveIdentity: number | null; repeated: boolean }[];
  matchedSteps: number[];
  terminalSnapshot?: string;
  completed: boolean;
  screenshotPaths?: { raw: string; canonical: string }[];
  manifestScreenshotPaths?: { raw: string; canonical: string }[];
  failure?: {
    phase: string;
    error: string;
    step?: number;
    expected?: unknown;
    live?: unknown;
    scope: "this-cell-and-direction-only";
  };
};
type Session = { manifest: Binding; cell: Cell; visited: Set<string>; traces: Trace[] };
const sessions = new WeakMap<TestInfo, Session>();

async function verifiedBytes(binding: Binding) {
  const bytes = await readFile(binding.path);
  expect(createHash("sha256").update(bytes).digest("hex"), binding.path).toBe(binding.sha256);
  return bytes;
}

export async function beginFocusEvidenceReplay(
  testInfo: TestInfo,
  identity: Omit<Cell, "entries" | "route"> & { route: "all" },
) {
  const path = process.env.STORYBOOK_FOCUS_REPLAY_MANIFEST;
  if (path == null) return;
  try {
    const sha256 = process.env.STORYBOOK_FOCUS_REPLAY_SHA256;
    if (sha256 == null) throw new Error("Focus replay requires the exact manifest SHA256");
    const binding = { path, sha256 };
    const manifest = JSON.parse((await verifiedBytes(binding)).toString()) as Manifest;
    expect(manifest.version).toBe(1);
    if (
      manifest.compatibility == null ||
      manifest.compatibility.currentSourcesAndFixture.length === 0
    )
      throw new Error("Focus replay requires reviewed producer and fixture compatibility bindings");
    await verifiedBytes(manifest.compatibility.report);
    for (const source of manifest.compatibility.currentSourcesAndFixture)
      await verifiedBytes(source);
    const candidates = manifest.cells.filter(
      (cell) =>
        cell.story === identity.story &&
        cell.browser === identity.browser &&
        cell.layout === identity.layout &&
        cell.route === identity.route,
    );
    expect(candidates).toHaveLength(1);
    const cell = candidates[0];
    if (cell == null) throw new Error("Focus replay cell was not found");
    sessions.set(testInfo, { manifest: binding, cell, visited: new Set(), traces: [] });
  } catch (error) {
    try {
      await writeFile(
        testInfo.outputPath(`${identity.story}-evidence-replay-initialization-error.json`),
        JSON.stringify(
          {
            cell: identity,
            state: "session-initialization",
            source: {
              path,
              sha256: process.env.STORYBOOK_FOCUS_REPLAY_SHA256 ?? null,
            },
            error: String(error),
            scope: "this-cell-initialization-only",
          },
          null,
          2,
        ),
      );
    } catch (persistError) {
      testInfo.annotations.push({
        type: "focus-replay-checkpoint-error",
        description: `${identity.story}: ${String(persistError)}; original: ${String(error)}`,
      });
    }
    throw error;
  }
}

async function persist(testInfo: TestInfo, session: Session) {
  const path = testInfo.outputPath(`${session.cell.story}-evidence-replay.json`);
  await writeFile(
    path,
    JSON.stringify(
      {
        manifest: session.manifest,
        cell: {
          story: session.cell.story,
          browser: session.cell.browser,
          layout: session.cell.layout,
        },
        traces: session.traces,
        inheritedCompleted: [...session.visited],
        failedDirections: session.traces
          .filter((trace) => trace.failure != null)
          .map((trace) => trace.state),
        notReached: Object.keys(session.cell.entries).filter(
          (state) => !session.traces.some((trace) => trace.state === state),
        ),
        scopeNote:
          "A failed direction needs local assessment. Not-reached prefixes remain prior evidence, not automatic recapture requests.",
      },
      null,
      2,
    ),
  );
}

// Diagnostic JSON comparison removes only React Aria ids and artifact bookkeeping.
// Owner order, geometry, styles, baseline, scroll offsets and original step remain exact.
function comparable(row: Record<string, unknown>) {
  const { screenshot: _screenshot, traversalCompleted: _completed, ...value } = row;
  if (value.ringOwner != null && typeof value.ringOwner === "object") {
    const owner = value.ringOwner as Record<string, unknown>;
    if (typeof owner.id === "string" && owner.id.startsWith("react-aria")) {
      const { id: _id, ...withoutGeneratedId } = owner;
      value.ringOwner = withoutGeneratedId;
    }
  }
  return value;
}

export async function beginFocusDirectionReplay(
  testInfo: TestInfo,
  state: string,
  key: "Tab" | "Shift+Tab" | null,
) {
  const session = sessions.get(testInfo);
  if (session == null) return undefined;
  const entry = session.cell.entries[state];
  const trace: Trace = {
    state,
    key,
    mode: entry == null ? "capture" : "replay-with-inherited-images",
    source: entry == null ? undefined : { path: entry.path, sha256: entry.sha256 },
    steps: [],
    matchedSteps: [],
    completed: false,
  };
  session.traces.push(trace);
  const fail = async (error: unknown, phase: string) => {
    trace.failure ??= { phase, error: String(error), scope: "this-cell-and-direction-only" };
    try {
      await persist(testInfo, session);
    } catch (persistError) {
      testInfo.annotations.push({
        type: "focus-replay-checkpoint-error",
        description: `${state}: ${String(persistError)}; original: ${String(error)}`,
      });
    }
  };
  let rows: Record<string, unknown>[] = [];
  let phase = "read-source-json";
  try {
    if (entry != null) {
      rows = JSON.parse((await verifiedBytes(entry)).toString()) as Record<string, unknown>[];
      phase = "validate-source-completion";
      expect(rows.length, "Empty evidence does not prove a completed direction").toBeGreaterThan(0);
      expect(
        rows.every((row) => row.traversalCompleted === true && Number.isInteger(row.step)),
      ).toBe(true);
      phase = "validate-screenshot-targets";
      trace.screenshotPaths = await Promise.all(
        [...new Set(rows.map((row) => row.screenshot))].map(async (raw) => {
          if (typeof raw !== "string") throw new Error("Evidence screenshot path must be a string");
          return { raw, canonical: await realpath(raw) };
        }),
      );
      trace.manifestScreenshotPaths = await Promise.all(
        entry.screenshots.map(async (file) => ({
          raw: file.path,
          canonical: await realpath(file.path),
        })),
      );
      expect(new Set(trace.screenshotPaths.map((file) => file.canonical))).toEqual(
        new Set(trace.manifestScreenshotPaths.map((file) => file.canonical)),
      );
      phase = "verify-screenshot-hashes";
      for (const screenshot of entry.screenshots) await verifiedBytes(screenshot);
    }
  } catch (error) {
    await fail(error, phase);
    throw error;
  }
  return {
    inherited: entry != null,
    fail,
    stop(step: number, liveIdentity: number | null, repeated: boolean, snapshot: string) {
      trace.steps.push({ step, liveIdentity, repeated });
      trace.terminalSnapshot = snapshot;
    },
    image(step: number, measurements: object[]) {
      const expected = rows.filter((row) => row.step === step);
      const liveRows = measurements.map((row) => comparable({ ...row, step }));
      const expectedRows = expected.map(comparable);
      try {
        expect(liveRows, `Replay mismatch: ${state} step ${String(step)}`).toEqual(expectedRows);
      } catch (error) {
        trace.failure = {
          phase: "row-match",
          error: String(error),
          step,
          expected: expectedRows,
          live: liveRows,
          scope: "this-cell-and-direction-only",
        };
        throw error;
      }
      const paths = [...new Set(expected.map((row) => row.screenshot))];
      expect(paths).toHaveLength(1);
      expect(typeof paths[0]).toBe("string");
      trace.matchedSteps.push(step);
      return paths[0] as string;
    },
    assertComplete() {
      if (entry != null) {
        const expected = [...new Set(rows.map((row) => row.step))];
        try {
          expect(trace.matchedSteps).toEqual(expected);
        } catch (error) {
          trace.failure = {
            phase: "direction-step-closure",
            error: String(error),
            expected,
            live: [...trace.matchedSteps],
            scope: "this-cell-and-direction-only",
          };
          throw error;
        }
      }
    },
    async finish(completed: boolean) {
      if (completed && entry != null) session.visited.add(state);
      trace.completed = completed;
      await persist(testInfo, session);
    },
  };
}

export async function finishFocusEvidenceReplay(testInfo: TestInfo) {
  const session = sessions.get(testInfo);
  if (session == null) return;
  await persist(testInfo, session);
  expect(
    [...session.visited].sort(),
    "Every inherited prefix must be reached by actual replay",
  ).toEqual(Object.keys(session.cell.entries).sort());
  expect(session.traces.every((trace) => trace.completed)).toBe(true);
}
