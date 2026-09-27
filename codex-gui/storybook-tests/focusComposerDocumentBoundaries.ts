import { expect, type ElementHandle, type Page, type TestInfo } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { visitComposerSkillStates, type ComposerSkillState } from "./focusComposerPopovers";
import {
  assertDocumentFocus,
  readDocumentPosition,
  wheelDocumentToPosition,
  type DocumentWheelInput,
} from "./focusDocumentBoundaries";
import { focusProductControl } from "./focusKeyboardActions";
import { waitForStableFocusSnapshot, type observeCurrentFocus } from "./focusObservation";
import { recordFocusStates } from "./focusStateRecorder";

const story = "composer-input-and-send-send--send-unknown-long-list";
const states = [
  "skill-0",
  "skill-1",
  "skill-2",
  "skill-restored",
  "initial-backward",
  "initial-forward",
] as const;
type Target = ElementHandle<HTMLElement | SVGElement>;

const skillScrollStories = [
  "composer-input-and-send-send--send-unknown-multiple",
  "composer-input-and-send-send--send-unknown-multiple-long-text",
];

/** Exact candidate scope; ordinary all/supplements runs retain their existing behavior. */
export function parseComposerSkillScrollCapture(text: string, route: string, stories: string[]) {
  const parsed: unknown = JSON.parse(text);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Composer skill scroll capture must be an object");
  }
  const value = parsed as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    value.kind !== "composer-skill-scroll" ||
    (value.browser !== "chromium" && value.browser !== "firefox" && value.browser !== "webkit") ||
    (value.layout !== "narrow" && value.layout !== "narrow-container") ||
    route !== "supplements" ||
    stories.length === 0 ||
    new Set(stories).size !== stories.length ||
    stories.some((id) => !skillScrollStories.includes(id))
  ) {
    throw new Error(
      "Composer skill scroll requires the exact three-field request and allowed stories",
    );
  }
  return {
    kind: "composer-skill-scroll" as const,
    browser: value.browser,
    layout: value.layout,
  };
}

export type ComposerSkillScrollCapture = ReturnType<typeof parseComposerSkillScrollCapture>;

async function readComposerState(target: Target, panel: Target) {
  return target.evaluate((editor, owner) => {
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const selection = getSelection();
    const offset = (node: Node | null, position: number) => {
      if (node == null || !editor.contains(node)) return null;
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.setEnd(node, position);
      return range.toString().length;
    };
    return {
      text: editor.textContent,
      selection:
        selection == null
          ? null
          : {
              anchor: offset(selection.anchorNode, selection.anchorOffset),
              focus: offset(selection.focusNode, selection.focusOffset),
            },
      sameEditorFocused: editor.isConnected && document.activeElement === editor,
      samePanelFocused:
        owner.isConnected && owner.contains(editor) && owner.matches(":focus-within"),
      editorBounds: rect(editor),
      panelBounds: rect(owner),
      panelShadow: getComputedStyle(owner).boxShadow,
      ariaExpanded: editor.getAttribute("aria-expanded"),
      activeDescendant: editor.getAttribute("aria-activedescendant"),
      options: [...document.querySelectorAll('[role="option"]')].map((option) => {
        const bounds = rect(option);
        const ancestry: Element[] = [];
        for (let node: Element | null = option; node != null; node = node.parentElement)
          ancestry.push(node);
        return {
          id: option.id,
          selected: option.getAttribute("aria-selected"),
          bounds,
          display: getComputedStyle(option).display,
          visibility: getComputedStyle(option).visibility,
          intersectsViewport:
            bounds.x + bounds.width > 0 &&
            bounds.y + bounds.height > 0 &&
            bounds.x < innerWidth &&
            bounds.y < innerHeight &&
            bounds.width > 0 &&
            bounds.height > 0,
          scrollports: ancestry.map((node) => ({
            tag: node.tagName,
            scrollTop: node.scrollTop,
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
            overflowY: getComputedStyle(node).overflowY,
            bounds: rect(node),
          })),
        };
      }),
    };
  }, panel);
}

/** Retain each state's editor/panel through only its requested document positions. */
export async function observeComposerDocumentBoundaries(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  browserName: string,
  layout: { name: string; width: number; height: number; container: number | null },
  prepareStory: () => Promise<void>,
  entryCapture?: ComposerSkillScrollCapture,
) {
  if (entryCapture == null) {
    if (storyId !== story || browserName !== "webkit" || layout.name !== "narrow-container")
      return [];
    expect(layout).toEqual({ name: "narrow-container", width: 1280, height: 900, container: 240 });
  } else {
    expect(skillScrollStories).toContain(storyId);
    expect(browserName).toBe(entryCapture.browser);
    expect(layout).toEqual(
      entryCapture.layout === "narrow"
        ? { name: "narrow", width: 375, height: 812, container: null }
        : { name: "narrow-container", width: 1280, height: 900, container: 240 },
    );
  }
  expect(page.viewportSize()).toEqual({ width: layout.width, height: layout.height });
  const captureStates =
    entryCapture == null
      ? states
      : states.filter((state): state is ComposerSkillState => state.startsWith("skill-"));
  const evidence: unknown[] = [];
  const artifactName = `${storyId}-composer-document-boundaries`;
  const metadataPath = testInfo.outputPath(`${artifactName}-evidence.json`);
  return recordFocusStates(
    page,
    testInfo,
    {
      artifactName,
      initialPhase: "prepare",
      failureTrigger: "same-focus Composer document wheel endpoints",
      observedStatus: "observed-awaiting-visual-and-state-review",
      persistEvidence: () => writeFile(metadataPath, JSON.stringify(evidence, null, 2)),
    },
    async (recorder) => {
      for (const state of captureStates) {
        recorder.phase(`${state}-prepare`);
        await prepareStory();
        if (layout.container != null) {
          expect(
            await page
              .locator("#storybook-root")
              .evaluate((root) => root.getBoundingClientRect().width),
          ).toBe(layout.container);
        }
        await expect(page.getByRole("dialog")).toHaveCount(0);
        const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
        await expect(editor).toHaveCount(1);
        const panelLocator = editor.locator(
          "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' composer-field ')][1]",
        );
        await expect(panelLocator).toHaveCount(1);
        const journey = async () => {
          const target = await editor.elementHandle();
          const panel = await panelLocator.elementHandle();
          let failed = false;
          let cleanupFailure: { error: unknown } | undefined;
          try {
            if (entryCapture != null) await waitForStableFocusSnapshot(page);
            await assertDocumentFocus(target, panel);
            const initial = await readComposerState(target, panel);
            const assertSkillState = (current: Awaited<ReturnType<typeof readComposerState>>) => {
              if (entryCapture == null) return;
              expect(current.text).toBe(initial.text);
              expect(current.selection).toEqual(initial.selection);
              expect(current.ariaExpanded, "Wheel must retain the original skill popup state").toBe(
                initial.ariaExpanded,
              );
              expect(current.activeDescendant, "Wheel must retain the original virtual focus").toBe(
                initial.activeDescendant,
              );
              expect(
                current.options.map((option) => ({ id: option.id, selected: option.selected })),
                "Wheel must retain the same skill options and selection",
              ).toEqual(
                initial.options.map((option) => ({ id: option.id, selected: option.selected })),
              );
            };
            const assertRetainedSkillState =
              entryCapture == null
                ? undefined
                : async () => {
                    assertSkillState(await readComposerState(target, panel));
                  };
            const documentStart = await readDocumentPosition(panelLocator);
            const maximum = documentStart.scrollHeight - documentStart.clientHeight;
            const positions =
              entryCapture == null
                ? [
                    { endpoint: "start", desiredPosition: 0 },
                    { endpoint: "end", desiredPosition: maximum },
                  ]
                : [
                    {
                      endpoint: entryCapture.layout === "narrow" ? "owner-fit" : "owner-bottom",
                      // A short panel is centered; an oversized panel's bottom is centered.
                      // These are capture positions, never automatic four-edge pass criteria.
                      desiredPosition:
                        documentStart.scrollTop +
                        initial.panelBounds.y +
                        (entryCapture.layout === "narrow"
                          ? (initial.panelBounds.height - layout.height) / 2
                          : initial.panelBounds.height - layout.height / 2),
                    },
                  ];
            const row = {
              state,
              entryCapture,
              initial,
              documentStart,
              positions,
              endpoints: [] as unknown[],
            };
            evidence.push(row);
            if (entryCapture != null) {
              expect(initial.ariaExpanded).toBe(state === "skill-restored" ? "false" : "true");
              if (state !== "skill-restored") {
                expect(
                  initial.options.some(
                    (option) =>
                      option.id === initial.activeDescendant && option.selected === "true",
                  ),
                ).toBe(true);
              }
              if (entryCapture.layout === "narrow") {
                expect(initial.panelBounds.height).toBeLessThan(layout.height);
              } else {
                expect(initial.panelBounds.height).toBeGreaterThan(layout.height);
              }
            }
            for (const { endpoint, desiredPosition } of positions) {
              const name = `${storyId}-composer-document-${state}-${endpoint}`;
              recorder.phase(name);
              const input: DocumentWheelInput = {
                kind: "wheel",
                x: entryCapture == null ? 1260 : 2,
                y: layout.height / 2,
                deltasY: [],
              };
              const item: {
                endpoint: string;
                desiredPosition: number;
                input: DocumentWheelInput;
                before: Awaited<ReturnType<typeof readComposerState>>;
                after?: Awaited<ReturnType<typeof readComposerState>>;
                beforeCapture?: Awaited<ReturnType<typeof readComposerState>>;
                position?: Awaited<ReturnType<typeof readDocumentPosition>>;
                afterCapture?: Awaited<ReturnType<typeof readComposerState>>;
                capturedPanel?: Awaited<ReturnType<typeof observeCurrentFocus>>[number];
              } = {
                endpoint,
                desiredPosition,
                input,
                before: await readComposerState(target, panel),
              };
              row.endpoints.push(item);
              item.position = await wheelDocumentToPosition(
                page,
                panelLocator,
                target,
                input,
                desiredPosition,
                panel,
                assertRetainedSkillState,
              );
              expect(item.position.scrollHeight).toBe(documentStart.scrollHeight);
              expect(item.position.clientHeight).toBe(documentStart.clientHeight);
              item.after = await readComposerState(target, panel);
              assertSkillState(item.after);
              expect(item.after.text).toBe(initial.text);
              expect(item.after.selection).toEqual(initial.selection);
              await waitForStableFocusSnapshot(page);
              await assertDocumentFocus(target, panel);
              item.beforeCapture = await readComposerState(target, panel);
              assertSkillState(item.beforeCapture);
              expect(item.beforeCapture.text).toBe(initial.text);
              expect(item.beforeCapture.selection).toEqual(initial.selection);
              await recorder.record(name, `${state}: native wheel → document ${endpoint}`, {
                current: name,
              });
              await assertDocumentFocus(target, panel);
              item.afterCapture = await readComposerState(target, panel);
              assertSkillState(item.afterCapture);
              expect(item.afterCapture.text).toBe(initial.text);
              expect(item.afterCapture.selection).toEqual(initial.selection);
              expect(await readDocumentPosition(panelLocator)).toEqual(item.position);
              const captured = JSON.parse(
                await readFile(testInfo.outputPath(`${name}-focus.json`), "utf8"),
              ) as Awaited<ReturnType<typeof observeCurrentFocus>>;
              const panelBounds = item.afterCapture.panelBounds;
              item.capturedPanel = captured.find(
                (sample) =>
                  sample.ringOwner.classes?.split(/\s+/).includes("composer-field") &&
                  (["x", "y", "width", "height"] as const).every(
                    (key) => sample.ringOwner.bounds[key] === panelBounds[key],
                  ),
              );
              expect(
                item.capturedPanel,
                "Retained painted Composer panel must have capture evidence",
              ).toBeDefined();
            }
          } catch (error) {
            failed = true;
            try {
              evidence.push({
                state,
                failure: String(error),
                atFailure: await readComposerState(target, panel),
                documentAtFailure: await readDocumentPosition(panelLocator),
              });
            } catch (snapshotError) {
              testInfo.annotations.push({
                type: "focus-artifact-error",
                description: String(snapshotError),
              });
            }
            throw error;
          } finally {
            for (const handle of [target, panel]) {
              try {
                await handle.dispose();
              } catch (error) {
                cleanupFailure ??= { error };
                if (failed)
                  testInfo.annotations.push({
                    type: "focus-cleanup-error",
                    description: String(error),
                  });
              }
            }
          }
          if (cleanupFailure != null) throw cleanupFailure.error;
        };
        if (state.startsWith("skill-")) {
          await visitComposerSkillStates(
            page,
            testInfo,
            editor,
            async (visited) => {
              if (visited === state) await journey();
            },
            state as ComposerSkillState,
          );
        } else {
          await focusProductControl(page, editor);
          await expect(editor).toHaveAttribute("aria-expanded", "false");
          await page.keyboard.press(state === "initial-forward" ? "Shift+Tab" : "Tab");
          await expect(editor).not.toBeFocused();
          await page.keyboard.press(state === "initial-forward" ? "Tab" : "Shift+Tab");
          await expect(editor).toBeFocused();
          await journey();
        }
      }
    },
  );
}
