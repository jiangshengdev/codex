import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { createRef, type JSX, type RefObject } from "react";
import {
  $applyNodeReplacement,
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $nodesOfType,
  $setSelection,
  BEFORE_INPUT_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  DecoratorNode,
  type LexicalEditor,
  type SerializedLexicalNode,
} from "lexical";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { ComposerAtomicNodePlugin } from "../ComposerAtomicNodePlugin";

test("replaces a selected non-Skill inline atomic decorator with ordinary input", async () => {
  const { editor, screen } = await renderHarness({ atomicPluginEnabled: true });
  const editable = screen.getByRole("textbox", { name: "Atomic composer" });
  const atomic = screen.getByTestId("test-inline-atomic");

  await expect.element(atomic).toBeVisible();
  editable.element().focus();
  selectAtomicNodes(editor);
  expect(readNodeSelectionSize(editor)).toBe(1);

  await userEvent.keyboard("replacement");

  await expect.element(atomic).not.toBeInTheDocument();
  await expect.element(editable).toHaveTextContent("before replacement after");
  expect(readTextContent(editor)).toBe("before replacement after");
  expect(readNodeSelectionSize(editor)).toBeNull();
});

test("passes ordinary input through without changing a disabled editor", async () => {
  const { editor, screen } = await renderHarness({ atomicPluginEnabled: true });
  const editable = screen.getByRole("textbox", { name: "Atomic composer" });

  selectAtomicNodes(editor);
  const contentBefore = readTextContent(editor);
  editor.setEditable(false);
  await expect.element(editable).toHaveAttribute("contenteditable", "false");
  const event = createBeforeInputEvent("insertText", "replacement");
  let observedEvent: InputEvent | null = null;
  const unregisterObserver = editor.registerCommand(
    BEFORE_INPUT_COMMAND,
    (receivedEvent) => {
      observedEvent = receivedEvent;
      return true;
    },
    COMMAND_PRIORITY_NORMAL,
  );

  try {
    expect(editor.dispatchCommand(BEFORE_INPUT_COMMAND, event)).toBe(true);
    expect(observedEvent).toBe(event);
    expect(event.defaultPrevented).toBe(false);
    expect(readTextContent(editor)).toBe(contentBefore);
    expect(readNodeSelectionSize(editor)).toBe(1);
    await expect.element(screen.getByTestId("test-inline-atomic")).toBeInTheDocument();
  } finally {
    unregisterObserver();
  }
});

test("passes composition and drop input through without replacing the selection", async () => {
  const { editor, screen } = await renderHarness({ atomicPluginEnabled: true });
  const contentBefore = readTextContent(editor);

  for (const inputType of ["insertFromComposition", "insertFromDrop"] as const) {
    selectAtomicNodes(editor);
    const event = createBeforeInputEvent(inputType, "replacement");
    let observedEvent: InputEvent | null = null;
    const unregisterObserver = editor.registerCommand(
      BEFORE_INPUT_COMMAND,
      (receivedEvent) => {
        observedEvent = receivedEvent;
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    try {
      expect(editor.dispatchCommand(BEFORE_INPUT_COMMAND, event)).toBe(true);
      expect(observedEvent).toBe(event);
      expect(event.defaultPrevented).toBe(false);
      expect(readTextContent(editor)).toBe(contentBefore);
      expect(readNodeSelectionSize(editor)).toBe(1);
    } finally {
      unregisterObserver();
    }
  }
  await expect.element(screen.getByTestId("test-inline-atomic")).toBeInTheDocument();
});

test("passes input through for a selected inline decorator that is not keyboard-selectable", async () => {
  const { editor, screen } = await renderHarness({
    atomicPluginEnabled: true,
    keyboardSelectable: false,
  });
  const editable = screen.getByRole("textbox", { name: "Atomic composer" });
  const atomic = screen.getByTestId("test-non-keyboard-selectable-inline-atomic");

  selectNonKeyboardSelectableAtomicNodes(editor);
  const contentBefore = readTextContent(editor);
  const selectionKeysBefore = readNodeSelectionKeys(editor);
  expect(selectionKeysBefore).toHaveLength(1);
  const atomicElementBefore = atomic.element();
  const domBefore = editable.element().innerHTML;
  const event = createBeforeInputEvent("insertText", "replacement");
  let observedEvent: InputEvent | null = null;
  const unregisterObserver = editor.registerCommand(
    BEFORE_INPUT_COMMAND,
    (receivedEvent) => {
      observedEvent = receivedEvent;
      return true;
    },
    COMMAND_PRIORITY_NORMAL,
  );

  try {
    expect(editor.dispatchCommand(BEFORE_INPUT_COMMAND, event)).toBe(true);
    expect(observedEvent).toBe(event);
    expect(event.defaultPrevented).toBe(false);
    expect(readTextContent(editor)).toBe(contentBefore);
    expect(readNodeSelectionSize(editor)).toBe(1);
    expect(readNodeSelectionKeys(editor)).toEqual(selectionKeysBefore);
    await expect.element(atomic).toBeInTheDocument();
    expect(atomic.element()).toBe(atomicElementBefore);
    expect(editable.element().innerHTML).toBe(domBefore);
  } finally {
    unregisterObserver();
  }
});

test("lets RichText delete a selected atomic decorator without the Atomic plugin", async () => {
  const { editor, screen } = await renderHarness({ atomicPluginEnabled: false });
  const editable = screen.getByRole("textbox", { name: "Atomic composer" });
  const atomic = screen.getByTestId("test-inline-atomic");

  await expect.element(atomic).toBeVisible();
  editable.element().focus();
  selectAtomicNodes(editor);
  expect(readNodeSelectionSize(editor)).toBe(1);

  await userEvent.keyboard("{Delete}");

  await expect.element(atomic).not.toBeInTheDocument();
  await expect.element(editable).toHaveTextContent("before after");
  expect(readTextContent(editor)).toBe("before  after");
});

async function renderHarness({
  atomicPluginEnabled,
  keyboardSelectable = true,
}: {
  atomicPluginEnabled: boolean;
  keyboardSelectable?: boolean;
}) {
  const editorRef = createRef<LexicalEditor>();
  const screen = await render(
    <AtomicHarness atomicPluginEnabled={atomicPluginEnabled} editorRef={editorRef} />,
  );
  await expect.poll(() => editorRef.current).not.toBeNull();
  const editor = requireEditor(editorRef);
  const atomicTestId = keyboardSelectable
    ? "test-inline-atomic"
    : "test-non-keyboard-selectable-inline-atomic";
  editor.update(() => {
    $getRoot()
      .clear()
      .append(
        $createParagraphNode().append(
          $createTextNode("before "),
          keyboardSelectable
            ? $createTestInlineAtomicNode()
            : $createTestNonKeyboardSelectableInlineAtomicNode(),
          $createTextNode(" after"),
        ),
      );
  });
  await expect.element(screen.getByTestId(atomicTestId)).toBeVisible();
  return { editor, screen };
}

function AtomicHarness({
  atomicPluginEnabled,
  editorRef,
}: Readonly<{
  atomicPluginEnabled: boolean;
  editorRef: RefObject<LexicalEditor | null>;
}>) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "composer-atomic-node-test",
        nodes: [TestInlineAtomicNode, TestNonKeyboardSelectableInlineAtomicNode],
        onError: (error) => {
          throw error;
        },
      }}
    >
      <RichTextPlugin
        contentEditable={<ContentEditable aria-label="Atomic composer" />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      {atomicPluginEnabled ? <ComposerAtomicNodePlugin /> : null}
      <EditorRefPlugin editorRef={editorRef} />
    </LexicalComposer>
  );
}

class TestInlineAtomicNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config("test-inline-atomic", { extends: DecoratorNode });
  }

  static clone(node: TestInlineAtomicNode): TestInlineAtomicNode {
    return new TestInlineAtomicNode(node.__key);
  }

  static importJSON(serializedNode: SerializedLexicalNode): TestInlineAtomicNode {
    return new TestInlineAtomicNode().updateFromJSON(serializedNode);
  }

  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return <span data-testid="test-inline-atomic">atomic</span>;
  }

  getTextContent(): string {
    return "[atomic]";
  }

  isInline(): true {
    return true;
  }

  isKeyboardSelectable(): true {
    return true;
  }
}

class TestNonKeyboardSelectableInlineAtomicNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config("test-non-keyboard-selectable-inline-atomic", {
      extends: DecoratorNode,
    });
  }

  static clone(
    node: TestNonKeyboardSelectableInlineAtomicNode,
  ): TestNonKeyboardSelectableInlineAtomicNode {
    return new TestNonKeyboardSelectableInlineAtomicNode(node.__key);
  }

  static importJSON(
    serializedNode: SerializedLexicalNode,
  ): TestNonKeyboardSelectableInlineAtomicNode {
    return new TestNonKeyboardSelectableInlineAtomicNode().updateFromJSON(serializedNode);
  }

  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return <span data-testid="test-non-keyboard-selectable-inline-atomic">atomic</span>;
  }

  getTextContent(): string {
    return "[non-keyboard-selectable-atomic]";
  }

  isInline(): true {
    return true;
  }

  isKeyboardSelectable(): false {
    return false;
  }
}

function $createTestInlineAtomicNode(): TestInlineAtomicNode {
  return $applyNodeReplacement(new TestInlineAtomicNode());
}

function $createTestNonKeyboardSelectableInlineAtomicNode(): TestNonKeyboardSelectableInlineAtomicNode {
  return $applyNodeReplacement(new TestNonKeyboardSelectableInlineAtomicNode());
}

function selectAtomicNodes(editor: LexicalEditor): void {
  editor.update(
    () => {
      const nodes = $nodesOfType(TestInlineAtomicNode);
      if (nodes.length === 0) throw new Error("atomic harness must contain an atomic node");
      const selection = $createNodeSelection();
      for (const node of nodes) selection.add(node.getKey());
      $setSelection(selection);
    },
    { discrete: true },
  );
}

function selectNonKeyboardSelectableAtomicNodes(editor: LexicalEditor): void {
  editor.update(
    () => {
      const nodes = $nodesOfType(TestNonKeyboardSelectableInlineAtomicNode);
      if (nodes.length === 0) {
        throw new Error("atomic harness must contain a non-keyboard-selectable atomic node");
      }
      const selection = $createNodeSelection();
      for (const node of nodes) selection.add(node.getKey());
      $setSelection(selection);
    },
    { discrete: true },
  );
}

function readNodeSelectionSize(editor: LexicalEditor): number | null {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isNodeSelection(selection) ? selection.getNodes().length : null;
  });
}

function readNodeSelectionKeys(editor: LexicalEditor): string[] | null {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isNodeSelection(selection) ? selection.getNodes().map((node) => node.getKey()) : null;
  });
}

function readTextContent(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

function createBeforeInputEvent(inputType: string, data: string): InputEvent {
  return new InputEvent("beforeinput", { bubbles: true, cancelable: true, data, inputType });
}

function requireEditor(ref: RefObject<LexicalEditor | null>): LexicalEditor {
  if (ref.current == null) throw new Error("Lexical editor must be ready");
  return ref.current;
}
