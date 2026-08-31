import { useState, type CSSProperties } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorProps,
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

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

test("same-namespace copy and paste preserves skill identity without external leakage", async () => {
  const harness = await renderEditors();
  const source = harness.screen.getByRole("combobox", { name: "Source composer" });
  const target = harness.screen.getByRole("combobox", { name: "Target composer" });

  await insertSkill(harness.screen, source);
  await expect.element(source).toHaveTextContent(`$${displayName}`);

  await source.click();
  await expect.element(source).toHaveFocus();
  await harness.screen.user.keyboard(
    navigator.platform.startsWith("Mac") ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}",
  );
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
    .poll(() => harness.targetController().capture().input)
    .toEqual([
      { type: "text", text: `$${canonicalName}`, text_elements: [] },
      { type: "skill", name: canonicalName, path: skillPath },
    ]);
});

test("node-selected skill copy and cut preserve public MIME identity without tooltip details", async () => {
  const harness = await renderEditors();
  const source = harness.screen.getByRole("combobox", { name: "Source composer" });
  const target = harness.screen.getByRole("combobox", { name: "Target composer" });

  await insertSkill(harness.screen, source);
  const trigger = harness.screen.getByRole("button", { name: /Friendly Skill/i });
  await trigger.click();
  await expect.element(source).toHaveFocus();

  const copiedData = observeNextCopyData();
  await harness.screen.user.copy();
  const copied = await copiedData;
  expect(copied.plainText).toBe(`$${canonicalName}`);
  expect(copied.html).toBe(`<span>$${displayName}</span>`);
  expect(copied.lexical).toContain('"type":"skill"');
  expect(copied.lexical).toContain(`"name":"${canonicalName}"`);
  expect(copied.lexical).toContain(`"path":"${skillPath}"`);
  expect(copied.lexical).not.toContain("Clipboard test skill");
  expect(copied.lexical).not.toContain("tooltip");
  expect(copied.lexical).not.toContain("data-slot");
  expect(copied.html).not.toContain(skillPath);
  expect(copied.html).not.toContain("Clipboard test skill");

  const cutData = observeNextCopyData();
  await harness.screen.user.cut();
  const cut = await cutData;
  expect(cut).toEqual(copied);
  await expect.poll(() => source.element().textContent).toBe("");

  await target.click();
  await harness.screen.user.paste();
  await expect.element(target).toHaveTextContent(`$${displayName}`);
  await expect
    .poll(() => harness.targetController().capture().input)
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
    .poll(() => harness.targetController().capture().input)
    .toEqual([{ type: "text", text: `$${canonicalName}`, text_elements: [] }]);
});

async function renderEditors() {
  let sourceController: ComposerEditorController | null = null;
  let targetController: ComposerEditorController | null = null;
  const screen = await renderWithProviders(
    <div>
      <textarea aria-label="External source" />
      <ClipboardEditorFixture
        ariaLabel="Source composer"
        disabled={false}
        guardCompositionEndEnter={false}
        onControllerChange={(controller) => {
          sourceController = controller;
        }}
        onSubmit={vi.fn<ComposerEditorProps["onSubmit"]>()}
        placeholder="Source"
        skillCatalog={skillCatalog}
      />
      <ClipboardEditorFixture
        ariaLabel="Target composer"
        disabled={false}
        guardCompositionEndEnter={false}
        onControllerChange={(controller) => {
          targetController = controller;
        }}
        onSubmit={vi.fn<ComposerEditorProps["onSubmit"]>()}
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

function ClipboardEditorFixture(props: Omit<ComposerEditorProps, "skillMenuParent">) {
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);

  return (
    <div className="w-96 max-w-full">
      <div ref={setSkillMenuParent} style={fixtureSkillMenuParentStyle} />
      <ComposerEditor {...props} skillMenuParent={skillMenuParent} />
    </div>
  );
}

const fixtureSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "18rem",
} as CSSProperties;

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

function observeNextCopyData(
  eventType: "copy" | "cut" = "copy",
): Promise<{ plainText: string; html: string; lexical: string }> {
  return new Promise((resolve) => {
    document.addEventListener(
      eventType,
      (event) => {
        resolve({
          plainText: event.clipboardData?.getData("text/plain") ?? "",
          html: event.clipboardData?.getData("text/html") ?? "",
          lexical: event.clipboardData?.getData("application/x-lexical-editor") ?? "",
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
