import { useState, type CSSProperties } from "react";
import { $getRoot, $getSelection, $isNodeSelection, getNearestEditorFromDOMNode } from "lexical";
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
const secondCanonicalName = "second-skill";
const secondDisplayName = "Second Skill";
const secondSkillPath = "/example/skills/second-skill/SKILL.md";
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
    {
      name: secondCanonicalName,
      description: "Second clipboard test skill",
      interface: {
        displayName: secondDisplayName,
        iconSmallUrl: null,
        iconLargeUrl: null,
      },
      path: secondSkillPath,
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

  const structuredDraft = harness.targetController().capture().draft;
  await target.fill("temporary replacement");
  expect(harness.targetController().restore(structuredDraft)).toEqual({ type: "restored" });
  await expect.element(target).toHaveTextContent(`$${displayName}`);
  await expect
    .poll(() => harness.targetController().capture().input)
    .toEqual([
      { type: "text", text: `$${canonicalName}`, text_elements: [] },
      { type: "skill", name: canonicalName, path: skillPath },
    ]);
});

test("multi-selected skill copy, cut, and paste preserve public MIME identities", async () => {
  const harness = await renderEditors();
  const source = harness.screen.getByRole("combobox", { name: "Source composer" });
  const target = harness.screen.getByRole("combobox", { name: "Target composer" });

  await insertSkill(harness.screen, source);
  await harness.screen.user.keyboard("$sec");
  const secondOption = harness.screen.getByRole("option", {
    name: new RegExp(secondDisplayName),
  });
  await expect.element(secondOption).toBeVisible();
  await secondOption.click();

  const firstHost = harness.screen.getByRole("group", { name: /Friendly Skill/i });
  const secondHost = harness.screen.getByRole("group", { name: /Second Skill/i });
  await firstHost.getByText(`$${displayName}`, { exact: true }).click();
  await secondHost
    .getByText(`$${secondDisplayName}`, { exact: true })
    .click({ modifiers: ["Shift"] });
  await expect.element(source).toHaveFocus();
  expect(readNodeSelectionSize(source.element())).toBe(2);
  await expect.element(firstHost).toHaveAttribute("data-selected");
  await expect.element(secondHost).toHaveAttribute("data-selected");

  const copiedData = observeNextCopyData();
  await harness.screen.user.copy();
  const copied = await copiedData;
  expect(copied.plainText).toBe(`$${canonicalName}$${secondCanonicalName}`);
  expect(copied.html).toBe(`<span>$${displayName}$${secondDisplayName}</span>`);
  expect(copied.lexical).toContain('"type":"skill"');
  expect(copied.lexical).toContain(`"name":"${canonicalName}"`);
  expect(copied.lexical).toContain(`"path":"${skillPath}"`);
  expect(copied.lexical).toContain(`"name":"${secondCanonicalName}"`);
  expect(copied.lexical).toContain(`"path":"${secondSkillPath}"`);
  expect(copied.lexical.match(/"type":"skill"/g)).toHaveLength(2);
  expect(copied.lexical).not.toContain("Clipboard test skill");
  expect(copied.lexical).not.toContain("Second clipboard test skill");
  expect(copied.lexical).not.toContain("tooltip");
  expect(copied.lexical).not.toContain("data-slot");
  expect(copied.html).not.toContain(skillPath);
  expect(copied.html).not.toContain(secondSkillPath);
  expect(copied.html).not.toContain("Clipboard test skill");
  expect(copied.html).not.toContain("Second clipboard test skill");

  const cutData = observeNextCopyData();
  await harness.screen.user.cut();
  const cut = await cutData;
  expect(cut).toEqual(copied);
  await expect.poll(() => source.element().textContent).toBe("");

  await target.click();
  await harness.screen.user.paste();
  await expect.element(target).toHaveTextContent(`$${displayName}$${secondDisplayName}`);
  await expect
    .poll(() => harness.targetController().capture().input)
    .toEqual([
      {
        type: "text",
        text: `$${canonicalName}$${secondCanonicalName}`,
        text_elements: [],
      },
      { type: "skill", name: canonicalName, path: skillPath },
      { type: "skill", name: secondCanonicalName, path: secondSkillPath },
    ]);
});

test("line-break copy preserves the newline boundary", async () => {
  const harness = await renderEditors();
  const source = harness.screen.getByRole("combobox", { name: "Source composer" });

  await source.fill("First line");
  await harness.screen.user.keyboard("{Shift>}{Enter}{/Shift}Second line");
  await expect
    .poll(() => harness.sourceController().capture().textContent)
    .toBe("First line\nSecond line");

  await harness.screen.user.keyboard(
    navigator.platform.startsWith("Mac") ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}",
  );
  const copiedData = observeNextCopyData();
  await harness.screen.user.copy();
  const copied = await copiedData;

  expect(copied.plainText).toBe("First line\nSecond line");
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

test("external HTML paste keeps text while stripping rich-text format", async () => {
  const harness = await renderEditors();
  const externalSource = harness.screen.getByRole("textbox", { name: "External rich source" });
  const target = harness.screen.getByRole("combobox", { name: "Target composer" });

  await externalSource.click();
  await harness.screen.user.keyboard(
    navigator.platform.startsWith("Mac") ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}",
  );
  await harness.screen.user.copy();
  await target.click();
  await harness.screen.user.paste();

  await expect.element(target).toHaveTextContent("Formatted value");
  const textNodes = readComposerTextFormats(target.element());
  expect(textNodes.map(({ content }) => content).join("")).toBe("Formatted value");
  expect(textNodes.every(({ format, style }) => format === 0 && style === "")).toBe(true);
  expect(harness.targetController().capture().input).toEqual([
    { type: "text", text: "Formatted value", text_elements: [] },
  ]);
});

async function renderEditors() {
  let sourceController: ComposerEditorController | null = null;
  let targetController: ComposerEditorController | null = null;
  const screen = await renderWithProviders(
    <div>
      <textarea aria-label="External source" />
      <div
        aria-label="External rich source"
        contentEditable={true}
        role="textbox"
        suppressContentEditableWarning
      >
        <strong>
          <em>Formatted value</em>
        </strong>
      </div>
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
    sourceController: () => requireController(sourceController),
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

function readComposerTextFormats(root: Element) {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("composer root must belong to a Lexical editor");
  return editor.getEditorState().read(() =>
    $getRoot()
      .getAllTextNodes()
      .map((node) => ({
        content: node.getTextContent(),
        format: node.getFormat(),
        style: node.getStyle(),
      })),
  );
}

function readNodeSelectionSize(root: Element): number | null {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("composer root must belong to a Lexical editor");
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isNodeSelection(selection) ? selection.getNodes().length : null;
  });
}
