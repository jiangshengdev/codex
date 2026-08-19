import { expect, test, vi } from "vitest";
import { compileComposerDraft } from "@/features/composerEditor/compileComposerDraft";
import {
  ComposerEditor,
  type ComposerEditorController,
} from "@/features/composerEditor/ComposerEditor";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { renderWithProviders } from "@/utils/test-utils";

const canonicalName = "canonical-skill";
const displayName = "Friendly Skill";
const skillPath = "/example/skills/canonical-skill/SKILL.md";
const skillCatalog: SkillCatalogState = {
  type: "ready",
  candidates: [
    {
      name: canonicalName,
      description: "Clipboard test skill",
      interface: {
        displayName,
        iconSmallUrl: null,
        iconLargeUrl: null,
      },
      path: skillPath,
      scope: "repo",
    },
  ],
  partialErrorCount: 0,
};

test("same-namespace copy and paste preserves skill identity without external leakage", async () => {
  const harness = await renderEditors();
  const source = harness.screen.getByRole("combobox", { name: "Source composer" });
  const target = harness.screen.getByRole("combobox", { name: "Target composer" });

  await insertSkill(harness.screen, source);
  await expect.element(source).toHaveTextContent(`$${displayName}`);

  await harness.screen.user.tripleClick(source);
  const copiedData = observeNextCopyData();
  await harness.screen.user.copy();
  const copied = await copiedData;

  expect(copied.plainText).toBe(`$${canonicalName}`);
  expect(copied.html).toBe(`<span>$${displayName}</span>`);
  expect(copied.html).not.toContain(skillPath);
  expect(copied.html).not.toContain(canonicalName);
  expect(copied.html).not.toContain("namespace");
  expect(copied.html).not.toContain('"type":"skill"');

  await target.click();
  await harness.screen.user.paste();
  await expect.element(target).toHaveTextContent(`$${displayName}`);
  await expect
    .poll(() => compileComposerDraft(harness.targetController().getSnapshot().editorState))
    .toEqual([
      { type: "text", text: `$${canonicalName}`, text_elements: [] },
      { type: "skill", name: canonicalName, path: skillPath },
    ]);
});

test("external canonical-looking plain text pastes as ordinary text", async () => {
  const harness = await renderEditors();
  const externalSource = harness.screen.getByRole("textbox", { name: "External source" });
  const target = harness.screen.getByRole("combobox", { name: "Target composer" });

  await externalSource.fill(`$${canonicalName}`);
  await harness.screen.user.tripleClick(externalSource);
  await harness.screen.user.copy();
  await target.click();
  await harness.screen.user.paste();

  await expect.element(target).toHaveTextContent(`$${canonicalName}`);
  await expect
    .poll(() => compileComposerDraft(harness.targetController().getSnapshot().editorState))
    .toEqual([{ type: "text", text: `$${canonicalName}`, text_elements: [] }]);
});

async function renderEditors() {
  let sourceController: ComposerEditorController | null = null;
  let targetController: ComposerEditorController | null = null;
  const screen = await renderWithProviders(
    <div>
      <textarea aria-label="External source" />
      <ComposerEditor
        ariaLabel="Source composer"
        disabled={false}
        guardCompositionEndEnter={false}
        onControllerChange={(controller) => {
          sourceController = controller;
        }}
        onSubmit={vi.fn()}
        placeholder="Source"
        skillCatalog={skillCatalog}
      />
      <ComposerEditor
        ariaLabel="Target composer"
        disabled={false}
        guardCompositionEndEnter={false}
        onControllerChange={(controller) => {
          targetController = controller;
        }}
        onSubmit={vi.fn()}
        placeholder="Target"
        skillCatalog={skillCatalog}
      />
    </div>,
  );
  await expect.poll(() => sourceController).not.toBeNull();
  await expect.poll(() => targetController).not.toBeNull();

  return {
    screen,
    targetController: () => requireController(targetController),
  };
}

async function insertSkill(
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
  composer: ReturnType<Awaited<ReturnType<typeof renderWithProviders>>["getByRole"]>,
): Promise<void> {
  await composer.click();
  await screen.user.keyboard("$fr");
  const option = screen.getByRole("option", { name: new RegExp(displayName) });
  await expect.element(option).toBeVisible();
  await option.click();
}

function observeNextCopyData(): Promise<{ plainText: string; html: string }> {
  return new Promise((resolve) => {
    document.addEventListener(
      "copy",
      (event) => {
        resolve({
          plainText: event.clipboardData?.getData("text/plain") ?? "",
          html: event.clipboardData?.getData("text/html") ?? "",
        });
      },
      { once: true },
    );
  });
}

function requireController(controller: ComposerEditorController | null): ComposerEditorController {
  if (controller == null) throw new Error("Composer editor controller must be ready");
  return controller;
}
