import { createRef, useState, type CSSProperties, type RefObject } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { renderWithProviders } from "@/utils/test-utils";

import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorProps,
} from "../ComposerEditor";
import {
  catalog,
  getController,
  renderEditor,
  skill,
} from "./composerEditorTypeaheadBrowserTestSupport";

beforeEach(async () => {
  await userEvent.unhover(document.body);
});
test("keeps simultaneous typeahead ids and keyboard ownership scoped to each editor", async () => {
  const firstControllerRef = createRef<ComposerEditorController>();
  const secondControllerRef = createRef<ComposerEditorController>();
  const screen = await renderWithProviders(
    <IndependentEditorsFixture
      firstControllerRef={firstControllerRef}
      firstSubmit={() => undefined}
      secondControllerRef={secondControllerRef}
      secondSubmit={() => undefined}
    />,
  );
  await expect.poll(() => firstControllerRef.current).not.toBeNull();
  await expect.poll(() => secondControllerRef.current).not.toBeNull();
  const firstEditor = screen.getByRole("combobox", { name: "First message" });
  const secondEditor = screen.getByRole("combobox", { name: "Second message" });
  const firstController = getController(firstControllerRef);
  const secondController = getController(secondControllerRef);

  await firstEditor.fill("$alp");
  const firstDraft = firstController.capture().draft;
  await secondEditor.fill("$alp");
  expect(firstController.restore(firstDraft)).toEqual({ type: "restored" });

  const firstMenu = screen
    .getByRole("region", { name: "First skill suggestions" })
    .getByRole("listbox", { name: "Typeahead menu" });
  const secondMenu = screen
    .getByRole("region", { name: "Second skill suggestions" })
    .getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(firstMenu).toBeVisible();
  await expect.element(secondMenu).toBeVisible();
  const firstOption = firstMenu.getByRole("option", { name: /alpha/ });
  const secondOption = secondMenu.getByRole("option", { name: /alpha/ });
  await expect.element(firstEditor).toHaveAttribute("aria-controls", firstMenu.element().id);
  await expect.element(secondEditor).toHaveAttribute("aria-controls", secondMenu.element().id);
  await expect
    .element(firstEditor)
    .toHaveAttribute("aria-activedescendant", firstOption.element().id);
  await expect
    .element(secondEditor)
    .toHaveAttribute("aria-activedescendant", secondOption.element().id);
  expect(firstMenu.element().id).not.toBe(secondMenu.element().id);
  expect(firstOption.element().id).not.toBe(secondOption.element().id);

  firstController.focus();
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => firstController.getSnapshot().textContent).toBe("$alpha");
  await expect.element(firstMenu).not.toBeInTheDocument();
  await expect.element(secondMenu).toBeVisible();
  expect(secondController.getSnapshot().textContent).toBe("$alp");

  expect(firstController.restore(firstDraft)).toEqual({ type: "restored" });
  await expect.element(firstMenu).toBeVisible();
  secondController.focus();
  await screen.user.keyboard("{Escape}");
  await expect.element(secondMenu).not.toBeInTheDocument();
  await expect.element(firstMenu).toBeVisible();
  expect(firstController.getSnapshot().textContent).toBe("$alp");
});

test("consumes typeahead Escape before an enclosing dialog key handler", async () => {
  const onDialogEscape = vi.fn<() => void>();
  const screen = await renderWithProviders(
    <DrawerEditorFixture
      candidates={[skill("alpha", "/alpha")]}
      controllerRef={createRef<ComposerEditorController>()}
      onDialogEscape={onDialogEscape}
    />,
  );
  const editor = screen.getByRole("combobox", { name: "Pending message" });

  await editor.fill("$");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Escape}");

  await expect
    .element(screen.getByRole("listbox", { name: "Typeahead menu" }))
    .not.toBeInTheDocument();
  expect(onDialogEscape).not.toHaveBeenCalled();
  await expect.element(editor).toHaveFocus();
});

test("filters by canonical and display names but never by description", async () => {
  const { screen } = await renderEditor([
    skill("canonical-match", "/canonical", "Friendly"),
    skill("other", "/display", "Display Match"),
    skill("description-only", "/description", "Hidden Candidate", "match appears only here"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$match");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox.getByRole("option", { name: /Friendly/ })).toBeVisible();
  await expect.element(listbox.getByRole("option", { name: /Display Match/ })).toBeVisible();
  await expect
    .element(listbox.getByRole("option", { name: /Hidden Candidate/ }))
    .not.toBeInTheDocument();
});

test("replaces a query at a middle caret with canonical skill input without submitting", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor(
    [skill("canonical-match", "/canonical", "Friendly")],
    { onSubmit },
  );
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("before $canonical after");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("before $canonical after");
  await editor.click();
  await expect.element(editor).toHaveFocus();
  setCollapsedCaret(editor.element(), "before $canonical after", 17);
  await expect.poll(() => collapsedCaretOffset(editor.element())).toBe(17);
  await expect.element(editor).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Enter}");

  expect(onSubmit).not.toHaveBeenCalled();
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("before $Friendly after");
  expect(getController(controllerRef).capture().input).toEqual([
    {
      type: "text",
      text: "before $canonical-match after",
      text_elements: [],
    },
    { type: "skill", name: "canonical-match", path: "/canonical" },
  ]);
});

test("uses Tab to choose, Escape to close, and Shift Enter only to add a line break", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([skill("alpha", "/alpha")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$alp");
  await screen.user.keyboard("{Tab}");
  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$alpha");

  await editor.fill("$");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("listbox", { name: "Typeahead menu" }))
    .not.toBeInTheDocument();
  await expect.element(editor).toHaveAttribute("aria-expanded", "false");

  await editor.fill("Line");
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}");
  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("Line\n");
});

test("keeps the typeahead Enter owner ahead of the guide shortcut", async () => {
  await withNavigatorPlatform("MacIntel", async () => {
    const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
    const { controllerRef, screen } = await renderEditor([skill("alpha", "/alpha")], {
      onSubmit,
    });
    const editor = screen.getByRole("combobox", { name: "Message" });

    await editor.fill("$alp");
    await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
    dispatchEnterShortcut(editor.element(), { metaKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
    await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$alpha");
  });
});

test("uses the same replacement for pointer selection and retains editor focus", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([skill("pointer", "/pointer")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$poi");
  const option = screen.getByRole("option", { name: /pointer/ });
  await expect.element(option).toHaveClass("list-box-item", "list-box-item--default");
  expect(getComputedStyle(option.element()).transitionProperty).toContain("transform");
  await option.click();

  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$pointer");
  await expect.element(editor).toHaveFocus();
});

test("uses touch pointer down to select without moving focus from the editor", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([skill("touch", "/skills/touch/SKILL.md")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$tou");
  const optionLocator = screen.getByRole("option", { name: /touch/ });
  await expect.element(optionLocator).toBeVisible();
  const option = optionLocator.element();
  option.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      isPrimary: true,
      pointerType: "touch",
    }),
  );

  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$touch");
  await expect.element(editor).toHaveFocus();
});

test.for(["ArrowUp", "ArrowDown"] as const)(
  "keeps typeahead ownership of $0",
  async (direction) => {
    const { controllerRef, screen } = await renderEditor([
      skill("alpha", "/skills/alpha/SKILL.md", "Alpha"),
      skill("beta", "/skills/beta/SKILL.md", "Beta"),
    ]);
    const editor = screen.getByRole("combobox", { name: "Message" });
    await editor.fill("$");
    const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
    const alphaOption = listbox.getByRole("option", { name: /Alpha/ });
    const betaOption = listbox.getByRole("option", { name: /Beta/ });
    await expect.element(alphaOption).toHaveAttribute("aria-selected", "true");
    await expect.element(betaOption).toHaveAttribute("aria-selected", "false");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", alphaOption.element().id);

    await screen.user.keyboard(`{${direction}}`);

    await expect.element(editor).toHaveFocus();
    await expect.element(listbox).toBeVisible();
    await expect.element(alphaOption).toHaveAttribute("aria-selected", "false");
    await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", betaOption.element().id);
    expect(getController(controllerRef).getSnapshot().textContent).toBe("$");
    expect(screen.container.querySelector('[data-slot="chip"]')).toBeNull();
  },
);

function DrawerEditorFixture({
  candidates,
  controllerRef,
  onDialogEscape,
}: Readonly<{
  candidates: readonly ReturnType<typeof skill>[];
  controllerRef: RefObject<ComposerEditorController | null>;
  onDialogEscape?: () => void;
}>) {
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);

  return (
    <div
      aria-label="Edit pending input"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onDialogEscape?.();
        }
      }}
      role="dialog"
    >
      <ComposerEditor
        ariaLabel="Pending message"
        controllerRef={controllerRef}
        disabled={false}
        guardCompositionEndEnter={false}
        onSubmit={() => undefined}
        placeholder="Edit pending message"
        skillCatalog={catalog("ready", candidates)}
        skillMenuParent={skillMenuParent}
      />
      <div aria-label="Skill suggestions" ref={setSkillMenuParent} role="region" />
    </div>
  );
}

function IndependentEditorsFixture({
  firstControllerRef,
  firstSubmit,
  secondControllerRef,
  secondSubmit,
}: Readonly<{
  firstControllerRef: RefObject<ComposerEditorController | null>;
  firstSubmit: ComposerEditorProps["onSubmit"];
  secondControllerRef: RefObject<ComposerEditorController | null>;
  secondSubmit: ComposerEditorProps["onSubmit"];
}>) {
  const [firstMenuParent, setFirstMenuParent] = useState<HTMLElement | null>(null);
  const [secondMenuParent, setSecondMenuParent] = useState<HTMLElement | null>(null);
  const skillCatalog = catalog("ready", [skill("alpha", "/alpha")]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div
          aria-label="First skill suggestions"
          ref={setFirstMenuParent}
          role="region"
          style={fixtureSkillMenuParentStyle}
        />
        <ComposerEditor
          ariaLabel="First message"
          controllerRef={firstControllerRef}
          disabled={false}
          guardCompositionEndEnter={false}
          onSubmit={firstSubmit}
          placeholder="First message"
          skillCatalog={skillCatalog}
          skillMenuParent={firstMenuParent}
        />
      </div>
      <div>
        <div
          aria-label="Second skill suggestions"
          ref={setSecondMenuParent}
          role="region"
          style={fixtureSkillMenuParentStyle}
        />
        <ComposerEditor
          ariaLabel="Second message"
          controllerRef={secondControllerRef}
          disabled={false}
          guardCompositionEndEnter={false}
          onSubmit={secondSubmit}
          placeholder="Second message"
          skillCatalog={skillCatalog}
          skillMenuParent={secondMenuParent}
        />
      </div>
    </div>
  );
}

const fixtureSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "18rem",
} as CSSProperties;

function setCollapsedCaret(root: Element, expectedText: string, offset: number): void {
  const textElements = root.querySelectorAll<HTMLElement>('[data-lexical-text="true"]');
  if (textElements.length !== 1) {
    throw new Error("composer editor must contain exactly one Lexical text element");
  }

  const textElement = textElements.item(0);
  const textNode = textElement.firstChild;
  if (textElement.childNodes.length !== 1 || !(textNode instanceof Text)) {
    throw new Error("Lexical text element must contain exactly one Text child");
  }
  if (textNode.data !== expectedText) {
    throw new Error(`expected Lexical text ${expectedText}, received ${textNode.data}`);
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > textNode.length) {
    throw new Error(`caret offset ${String(offset)} is outside the Lexical text`);
  }

  const selection = root.ownerDocument.getSelection();
  if (selection == null) {
    throw new Error("composer editor document must provide a Selection");
  }
  const range = root.ownerDocument.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.ownerDocument.dispatchEvent(new Event("selectionchange"));
}

function collapsedCaretOffset(root: Element): number | null {
  const selection = root.ownerDocument.getSelection();
  if (
    selection == null ||
    !selection.isCollapsed ||
    selection.anchorNode == null ||
    !root.contains(selection.anchorNode)
  ) {
    return null;
  }
  return selection.anchorOffset;
}
type EnterShortcutModifiers = Readonly<
  Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>
>;

function dispatchEnterShortcut(element: Element, modifiers: EnterShortcutModifiers): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      ...modifiers,
    }),
  );
}

async function withNavigatorPlatform(platform: string, run: () => Promise<void>): Promise<void> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });
  try {
    await run();
  } finally {
    if (originalDescriptor == null) {
      Reflect.deleteProperty(navigator, "platform");
    } else {
      Object.defineProperty(navigator, "platform", originalDescriptor);
    }
  }
}
