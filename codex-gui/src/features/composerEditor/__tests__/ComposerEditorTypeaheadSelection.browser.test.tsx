import { dispatchEnterShortcut } from "./composerKeyboardBrowserTestSupport";
import { createRef, useState, type RefObject } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { renderWithProviders } from "@/utils/test-utils";

import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorProps,
} from "../ComposerEditor";
import { catalog, getController, renderEditor, skill } from "./composerEditorBrowserTestSupport";
import { IndependentEditorsFixture } from "./independentEditorsFixture";
import { withNavigatorPlatform } from "./navigatorPlatformBrowserTestSupport";
import {
  collapsedCaretOffset,
  setCollapsedCaret,
} from "./composerEditorSelectionBrowserTestSupport";

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
        submitIntents={["ordinary", "guide"]}
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
