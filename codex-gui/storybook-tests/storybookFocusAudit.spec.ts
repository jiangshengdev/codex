import {
  expect,
  test,
  type Page,
  type PlaywrightWorkerOptions,
  type TestInfo,
} from "@playwright/test";
import { beginFocusEvidenceReplay, finishFocusEvidenceReplay } from "./focusEvidenceReplay";
import type { StoryIndex } from "storybook/internal/types";
import { observeKeyboardFocus, observeScrollBoundaryFocus } from "./focusObservation";
import { observeProductOverlays } from "./focusProductStates";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { observePendingStates } from "./focusPendingStates";
import { observeReadingStates, parseReadingEntryCapture } from "./focusReadingStates";
import { observeRecoveryStates, parseRecoverySupplementSelection } from "./focusRecoveryStates";
import { loadFocusStory } from "./focusStoryReady";
import { observeFocusSupplements } from "./focusSupplements";
import type { observeComposerPopovers } from "./focusComposerPopovers";
import type { observeUnknownDetails } from "./focusUnknownDetails";
import type { DocumentBoundary } from "./focusHistoryBoundary";
import type { observeHistoryListStates } from "./focusHistoryListStates";
import type { observeHistoryContinuationStates } from "./focusHistoryContinuationStates";
import type { observeHistoryForkStates } from "./focusHistoryForkStates";
import type { observeAppShellStates } from "./focusAppShellStates";
import {
  parseComposerSkillScrollCapture,
  type observeComposerDocumentBoundaries,
} from "./focusComposerDocumentBoundaries";

test.use({ locale: "en", actionTimeout: 10_000, navigationTimeout: 30_000 });
test.describe.configure({ mode: "parallel" });

const layouts = [
  { name: "desktop", width: 1280, height: 900, container: null },
  { name: "narrow", width: 375, height: 812, container: null },
  { name: "narrow-container", width: 1280, height: 900, container: 240 },
] as const;

const groups = [
  "Composer",
  "History",
  "Transcript",
  "App shell",
  "Environment",
  "New session",
  "Recovery",
];
const excluded = new Set(["environment-stateful--empty", "environment-stateful--seeded"]);

const requestedStories = process.env.STORYBOOK_FOCUS_STORY;
const route = process.env.STORYBOOK_FOCUS_ROUTE ?? "all";
if (!["all", "supplements", "reading", "recovery"].includes(route)) {
  throw new Error(`Unknown Storybook focus route: ${route}`);
}
if (route !== "all" && requestedStories == null) {
  throw new Error("A focused route requires an explicit STORYBOOK_FOCUS_STORY selection");
}
if (
  process.env.STORYBOOK_FOCUS_REPLAY_MANIFEST != null &&
  (route !== "all" || requestedStories == null)
) {
  throw new Error("Focus evidence replay requires route all and explicit story IDs");
}
const requestedReadingEntry = process.env.STORYBOOK_FOCUS_READING_ENTRY;
if (
  requestedReadingEntry != null &&
  (route !== "reading" ||
    requestedStories == null ||
    requestedStories.split(",").some((id) => id.trim().length === 0))
) {
  throw new Error("STORYBOOK_FOCUS_READING_ENTRY requires route reading and explicit story IDs");
}
const readingEntryCapture =
  requestedReadingEntry == null ? undefined : parseReadingEntryCapture(requestedReadingEntry);
const requestedLongFailure = process.env.STORYBOOK_FOCUS_LONG_FAILURE;
if (requestedLongFailure != null) {
  if (requestedLongFailure !== "1") {
    throw new Error("STORYBOOK_FOCUS_LONG_FAILURE accepts only the literal 1 when set");
  }
  if (
    route !== "supplements" ||
    requestedStories !== "history-detail--long-content-continuation-failure"
  ) {
    throw new Error(
      "STORYBOOK_FOCUS_LONG_FAILURE requires route supplements and only history-detail--long-content-continuation-failure",
    );
  }
}
const requestedRecoveryEntry = process.env.STORYBOOK_FOCUS_RECOVERY_ENTRY;
if (
  requestedRecoveryEntry != null &&
  (requestedStories == null || requestedReadingEntry != null || requestedLongFailure != null)
) {
  throw new Error(
    "Recovery entry selection requires explicit stories and cannot combine with reading/long-failure selection",
  );
}
const recoverySupplementSelection =
  requestedRecoveryEntry == null
    ? undefined
    : parseRecoverySupplementSelection(
        requestedRecoveryEntry,
        route,
        requestedStories?.split(",") ?? [],
      );
const requestedComposerSkillScroll = process.env.STORYBOOK_FOCUS_COMPOSER_SKILL_SCROLL;
if (
  requestedComposerSkillScroll != null &&
  (requestedStories == null ||
    requestedReadingEntry != null ||
    requestedLongFailure != null ||
    requestedRecoveryEntry != null)
) {
  throw new Error("Composer skill scroll requires explicit stories and cannot combine selectors");
}
const composerSkillScrollCapture =
  requestedComposerSkillScroll == null
    ? undefined
    : parseComposerSkillScrollCapture(
        requestedComposerSkillScroll,
        route,
        requestedStories?.split(",") ?? [],
      );
const selections =
  requestedStories == null
    ? groups.map((group) => ({
        group,
        storyId: null as string | null,
        storyIds: [] as string[],
        title: group,
      }))
    : [...new Set(requestedStories.split(","))].map((storyId) => ({
        group: null as string | null,
        storyId,
        storyIds: [storyId],
        title: storyId || "invalid-empty-story-id",
      }));

// Selection constraints are input data, not optional assertions in the test body.
function requiredCaptureEnvironments() {
  const environments: { browser: string; layout: string }[] = [];
  if (recoverySupplementSelection?.kind === "restore-sync-failed-initial") {
    environments.push({ browser: "chromium", layout: "narrow-container" });
  } else if (
    recoverySupplementSelection?.kind === "history-missing-states" &&
    !recoverySupplementSelection.collectContext
  ) {
    environments.push({ browser: "firefox", layout: "desktop" });
  }
  if (composerSkillScrollCapture != null) {
    environments.push(composerSkillScrollCapture);
  }
  return environments;
}

function exactRecoveryCapture(browserName: string, layout: (typeof layouts)[number]) {
  const capture: Parameters<typeof observeRecoveryStates>[4] =
    requestedLongFailure == null
      ? undefined
      : {
          kind: "history-long-failure",
          documentEndpoints:
            (browserName === "chromium" || browserName === "webkit") &&
            (layout.name === "narrow" || layout.name === "narrow-container"),
        };
  return capture;
}

for (const layout of layouts) {
  for (const selection of selections) {
    test(`${selection.title} focus observations / ${layout.name}${route === "all" ? "" : ` / ${route}`}`, async ({
      page,
      request,
      browserName,
    }, testInfo) => {
      test.setTimeout((selection.storyId == null ? 1 : 2) * 60 * 60 * 1000);
      const startedAt = Date.now();
      const exactCapture = exactRecoveryCapture(browserName, layout);
      for (const environment of requiredCaptureEnvironments()) {
        expect(browserName).toBe(environment.browser);
        expect(layout.name).toBe(environment.layout);
      }
      page.setDefaultTimeout(10_000);
      await page.setViewportSize({ width: layout.width, height: layout.height });
      const response = await request.get("/index.json");
      expect(response.ok()).toBe(true);
      const index = (await response.json()) as StoryIndex;
      for (const storyId of selection.storyIds) {
        const entry = index.entries[storyId];
        expect(entry, `Requested story ID is absent from runtime index: ${storyId}`).toBeDefined();
        expect(entry?.type, `Requested ID is not a story: ${storyId}`).toBe("story");
        expect(excluded.has(storyId), `Requested story is excluded: ${storyId}`).toBe(false);
        expect(groups, `Requested story is outside product audit groups: ${storyId}`).toContain(
          entry?.title.split("/")[0],
        );
      }
      const stories = Object.values(index.entries).filter(
        (entry) =>
          entry.type === "story" &&
          !excluded.has(entry.id) &&
          (selection.storyId != null
            ? entry.id === selection.storyId
            : entry.title.split("/")[0] === selection.group),
      );
      expect(stories.length).toBeGreaterThan(0);
      await testInfo.attach("runtime-index", {
        body: JSON.stringify(index, null, 2),
        contentType: "application/json",
      });
      await writeFile(
        testInfo.outputPath("focus-audit-scope.json"),
        JSON.stringify(
          {
            route,
            stories: stories.map((story) => story.id),
            layout,
            ...(readingEntryCapture == null ? {} : { readingEntryCapture }),
            ...(exactCapture == null ? {} : { browserName, exactCapture }),
            ...(recoverySupplementSelection == null
              ? {}
              : { browserName, recoverySupplementSelection }),
            ...(composerSkillScrollCapture == null
              ? {}
              : { browserName, composerSkillScrollCapture }),
            limitation: "A selected route records only that route, not complete story acceptance",
          },
          null,
          2,
        ),
      );
      const coverage = await collectFocusAudit({
        page,
        testInfo,
        browserName,
        layout,
        stories,
        exactCapture,
        startedAt,
      });
      expect(coverage.filter((row) => row.status === "blocked")).toEqual([]);
    });
  }
}

// The collector owns route dispatch and evidence persistence. The test above
// always checks its blocked results, including failures retained before cleanup.
async function collectFocusAudit({
  page,
  testInfo,
  browserName,
  layout,
  stories,
  exactCapture,
  startedAt,
}: {
  page: Page;
  testInfo: TestInfo;
  browserName: PlaywrightWorkerOptions["browserName"];
  layout: (typeof layouts)[number];
  stories: StoryIndex["entries"][string][];
  exactCapture: Parameters<typeof observeRecoveryStates>[4];
  startedAt: number;
}) {
  const coverage: {
    story: string;
    layout: (typeof layouts)[number];
    state: string;
    status: string;
    observations?: number;
    error?: string;
    reason?: string;
  }[] = [];
  const persistCoverage = async () => {
    const artifact = testInfo.outputPath("coverage.json");
    const pending = `${artifact}.tmp`;
    await writeFile(pending, JSON.stringify(coverage, null, 2));
    await rename(pending, artifact);
  };
  try {
    for (const story of stories) {
      if (
        page.isClosed() ||
        testInfo.status === "timedOut" ||
        Date.now() - startedAt >= testInfo.timeout
      )
        throw new Error("Focus audit stopped before the next story because its test or page ended");

      const collectStoryEvidence = async () => {
        let phase = "loading";
        let routeCompleted = false;
        const priorFiles = new Set(await readdir(testInfo.outputPath()));
        const loadStory = () => loadFocusStory(page, story.id, layout.container);
        try {
          await beginFocusEvidenceReplay(testInfo, {
            story: story.id,
            browser: browserName,
            layout: layout.name,
            route: "all",
          });
          await loadStory();
          if (route === "all") {
            phase = "initial";
            await observeKeyboardFocus(page, testInfo, `${story.id}-initial`);
            phase = "scroll-boundaries";
            const unknownLists = page
              .getByRole("status")
              .filter({ hasText: "Sending result unknown" })
              .getByRole("list");
            for (let list = 0; list < (await unknownLists.count()); list += 1) {
              await observeScrollBoundaryFocus(
                page,
                testInfo,
                `${story.id}-unknown-${String(list)}`,
                unknownLists.nth(list),
              );
            }
            phase = "overlays";
            await observeProductOverlays(page, testInfo, story.id);
            phase = "pending";
            await observePendingStates(page, testInfo, `${story.id}-pending`);
          }
          if (route === "all" || route === "reading") {
            phase = "reading";
            const reading = await observeReadingStates(
              page,
              testInfo,
              story.id,
              readingEntryCapture,
            );
            if (reading.length === 0)
              coverage.push({
                story: story.id,
                layout,
                state: "reading-route",
                status: "not-applicable",
                reason: "This fixture exposes no matching product reading route",
              });
          }
          if (
            route === "all" ||
            route === "recovery" ||
            (route === "supplements" && story.id.startsWith("history-"))
          ) {
            phase = "recovery";
            const recovery = await observeRecoveryStates(
              page,
              testInfo,
              story.id,
              loadStory,
              exactCapture,
              recoverySupplementSelection,
            );
            if (
              exactCapture == null &&
              recoverySupplementSelection == null &&
              recovery.length === 0
            )
              coverage.push({
                story: story.id,
                layout,
                state: "recovery-route",
                status: "not-applicable",
                reason: "This fixture exposes no matching product recovery route",
              });
          }
          if (route === "all" || route === "supplements") {
            phase = "supplements";
            await observeFocusSupplements(
              page,
              testInfo,
              story.id,
              loadStory,
              browserName,
              layout,
              exactCapture,
              recoverySupplementSelection,
              composerSkillScrollCapture,
            );
          }
          await finishFocusEvidenceReplay(testInfo);
          routeCompleted = true;
        } catch (error) {
          coverage.push({
            story: story.id,
            layout,
            state: phase,
            status: "blocked",
            error: error instanceof Error ? (error.stack ?? error.message) : String(error),
          });
          // A timed-out test cannot safely reuse its page for later stories.
          // The finally blocks persist evidence before the failure propagates.
          if (
            page.isClosed() ||
            testInfo.status === "timedOut" ||
            Date.now() - startedAt >= testInfo.timeout
          )
            throw error;
        } finally {
          // Individual observations survive a later route failure. Persist progress
          // after each story rather than dropping successful states on exceptions.
          const files = await readdir(testInfo.outputPath());
          for (const file of files.filter(
            (name) =>
              !priorFiles.has(name) &&
              (name.endsWith("-composer-popovers.json") ||
                name.endsWith("-unknown-details.json") ||
                name.endsWith("-history-list-states.json") ||
                name.endsWith("-continuation-states.json") ||
                name.endsWith("-history-fork-states.json") ||
                name.endsWith("-app-shell-states.json") ||
                name.endsWith("-composer-document-boundaries.json")),
          )) {
            const results = JSON.parse(
              await readFile(testInfo.outputPath(file), "utf8"),
            ) as Awaited<
              ReturnType<
                | typeof observeComposerPopovers
                | typeof observeUnknownDetails
                | typeof observeHistoryListStates
                | typeof observeHistoryContinuationStates
                | typeof observeHistoryForkStates
                | typeof observeAppShellStates
                | typeof observeComposerDocumentBoundaries
              >
            >;
            for (const result of results) {
              coverage.push({
                story: story.id,
                layout,
                state: `${file}#${result.state}`,
                status: result.status,
                observations: result.observations,
                reason: result.reason,
              });
            }
          }
          for (const file of files.filter(
            (name) => !priorFiles.has(name) && name.endsWith("-scroll-boundaries.json"),
          )) {
            const boundaries = JSON.parse(await readFile(testInfo.outputPath(file), "utf8")) as ((
              | Awaited<ReturnType<typeof observeScrollBoundaryFocus>>[number]
              | DocumentBoundary
            ) &
              Partial<Pick<DocumentBoundary, "state">>)[];
            for (const boundary of boundaries)
              coverage.push({
                story: story.id,
                layout,
                state: `${file}#${boundary.state == null ? "" : `${boundary.state}#`}${boundary.axis}-${boundary.endpoint ?? "none"}`,
                status: boundary.status,
                reason: boundary.reason,
                observations: boundary.observations,
              });
          }
          for (const file of files.filter(
            (name) => !priorFiles.has(name) && name.endsWith("-focus.json"),
          )) {
            const rows = JSON.parse(await readFile(testInfo.outputPath(file), "utf8")) as Awaited<
              ReturnType<typeof observeKeyboardFocus>
            >;
            coverage.push({
              story: story.id,
              layout,
              state: file,
              observations: rows.length,
              status: rows.some((row) => !row.traversalCompleted)
                ? "partial-observations-before-failure"
                : rows.some((row) => row.evidenceOrigin === "inherited-image-live-replay")
                  ? "inherited-images-replayed-awaiting-state-and-prior-visual-review"
                  : rows.length > 0
                    ? "observed-awaiting-visual-and-state-review"
                    : "no-product-focus-observed",
              reason:
                rows.length === 0 ? "This traversal captured no product focus target" : undefined,
            });
          }
          if (routeCompleted) {
            coverage.push({
              story: story.id,
              layout,
              state: `route:${route}`,
              status: "route-collected-awaiting-visual-and-state-review",
              reason: "Only the selected route completed; this is not a visual verdict",
            });
          }
          await persistCoverage();
        }
      };

      await test.step(story.id, collectStoryEvidence);
    }
  } finally {
    const artifact = testInfo.outputPath("coverage.json");
    await persistCoverage();
    await testInfo.attach("coverage", {
      path: artifact,
      contentType: "application/json",
    });
  }
  return coverage;
}
