import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { createRef, type RefObject } from "react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  SET_TEXT_FORMAT_COMMAND,
  type LexicalEditor,
} from "lexical";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { ComposerContentModelPlugin } from "../ComposerContentModelPlugin";

test("rejects format commands and normalizes formatted text and paragraphs", async () => {
  const { editor, screen } = await renderHarness();
  const editable = screen.getByRole("textbox", { name: "Controlled composer" });

  editor.update(() => {
    const text = $createTextNode("controlled").setFormat("bold").setStyle("color: red");
    const paragraph = $createParagraphNode()
      .setDirection("rtl")
      .setFormat("center")
      .setIndent(2)
      .setStyle("background: blue")
      .setTextFormat(1)
      .setTextStyle("font-size: 24px");
    paragraph.append(text);
    $getRoot().clear().append(paragraph);
    text.select(0, text.getTextContentSize());
  });

  await expect
    .poll(() => readContentModel(editor))
    .toEqual({
      paragraph: {
        direction: "rtl",
        format: "",
        indent: 0,
        style: "",
        textFormat: 0,
        textStyle: "",
      },
      selection: { anchorOffset: 0, focusOffset: 10, type: "range" },
      text: { content: "controlled", format: 0, style: "" },
    });
  await expect.element(editable).toHaveTextContent("controlled");

  expect(editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")).toBe(true);
  expect(editor.dispatchCommand(SET_TEXT_FORMAT_COMMAND, { underline: true })).toBe(true);
  expect(editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")).toBe(true);

  expect(readContentModel(editor)).toEqual({
    paragraph: {
      direction: "rtl",
      format: "",
      indent: 0,
      style: "",
      textFormat: 0,
      textStyle: "",
    },
    selection: { anchorOffset: 0, focusOffset: 10, type: "range" },
    text: { content: "controlled", format: 0, style: "" },
  });
  await expect.element(editable).toHaveTextContent("controlled");
});

test("contains rich-text drag and drop and keeps closed-menu Escape focused", async () => {
  const { editor, screen } = await renderHarness();
  const editable = screen.getByRole("textbox", { name: "Controlled composer" });

  await editable.fill("keep this");
  await editable.click();
  await expect.element(editable).toHaveFocus();
  const contentBefore = readContentModel(editor);
  const lexicalSelectionBefore = readLexicalSelection(editor);
  const domSelectionBefore = readDomSelection(editable.element());

  for (const [type, command] of [
    ["dragstart", DRAGSTART_COMMAND],
    ["dragover", DRAGOVER_COMMAND],
    ["drop", DROP_COMMAND],
  ] as const) {
    const event = new DragEvent(type, { bubbles: true, cancelable: true });
    expect(editor.dispatchCommand(command, event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  }

  expect(readContentModel(editor)).toEqual(contentBefore);
  expect(readLexicalSelection(editor)).toEqual(lexicalSelectionBefore);
  expect(readDomSelection(editable.element())).toEqual(domSelectionBefore);
  await expect.element(editable).toHaveFocus();
  await expect.element(editable).toHaveTextContent("keep this");

  await userEvent.keyboard("{Escape}");

  await expect.element(editable).toHaveFocus();
  expect(readContentModel(editor)).toEqual(contentBefore);
  expect(readLexicalSelection(editor)).toEqual(lexicalSelectionBefore);
  expect(readDomSelection(editable.element())).toEqual(domSelectionBefore);
});

test("unregisters transforms on unmount and still contains programmatic format while disabled", async () => {
  const editorRef = createRef<LexicalEditor>();
  const screen = await render(
    <ContentModelHarness contentModelEnabled={true} editorRef={editorRef} />,
  );
  await expect.poll(() => editorRef.current).not.toBeNull();
  const editor = requireEditor(editorRef);
  const editable = screen.getByRole("textbox", { name: "Controlled composer" });

  editor.setEditable(false);
  await expect.element(editable).toHaveAttribute("contenteditable", "false");
  setFormattedContent(editor, "disabled");
  await expect
    .poll(() => readContentModel(editor).text)
    .toEqual({
      content: "disabled",
      format: 0,
      style: "",
    });
  expect(editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")).toBe(true);

  await screen.rerender(<ContentModelHarness contentModelEnabled={false} editorRef={editorRef} />);
  setFormattedContent(editor, "unmounted");

  await expect
    .poll(() => readContentModel(editor).text)
    .toEqual({
      content: "unmounted",
      format: 1,
      style: "color: red",
    });
});

async function renderHarness() {
  const editorRef = createRef<LexicalEditor>();
  const screen = await render(
    <ContentModelHarness contentModelEnabled={true} editorRef={editorRef} />,
  );
  await expect.poll(() => editorRef.current).not.toBeNull();
  return { editor: requireEditor(editorRef), screen };
}

function ContentModelHarness({
  contentModelEnabled,
  editorRef,
}: Readonly<{
  contentModelEnabled: boolean;
  editorRef: RefObject<LexicalEditor | null>;
}>) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "composer-content-model-test",
        onError: (error) => {
          throw error;
        },
      }}
    >
      <RichTextPlugin
        contentEditable={<ContentEditable aria-label="Controlled composer" />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      {contentModelEnabled ? <ComposerContentModelPlugin /> : null}
      <EditorRefPlugin editorRef={editorRef} />
    </LexicalComposer>
  );
}

function setFormattedContent(editor: LexicalEditor, content: string): void {
  editor.update(() => {
    const text = $createTextNode(content).setFormat("bold").setStyle("color: red");
    $getRoot().clear().append($createParagraphNode().append(text));
  });
}

function readContentModel(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const paragraph = $getRoot().getFirstChild();
    if (!$isParagraphNode(paragraph)) {
      throw new Error("content model must contain one paragraph");
    }
    const text = paragraph.getFirstChild();
    if (!$isTextNode(text)) {
      throw new Error("content model paragraph must contain one text node");
    }
    return {
      paragraph: {
        direction: paragraph.getDirection(),
        format: paragraph.getFormatType(),
        indent: paragraph.getIndent(),
        style: paragraph.getStyle(),
        textFormat: paragraph.getTextFormat(),
        textStyle: paragraph.getTextStyle(),
      },
      selection: readCurrentSelection(),
      text: {
        content: text.getTextContent(),
        format: text.getFormat(),
        style: text.getStyle(),
      },
    };
  });
}

function readLexicalSelection(editor: LexicalEditor) {
  return editor.getEditorState().read(readCurrentSelection);
}

function readCurrentSelection() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return { type: "other" as const };
  return {
    anchorOffset: selection.anchor.offset,
    focusOffset: selection.focus.offset,
    type: "range" as const,
  };
}

function readDomSelection(root: Element) {
  const selection = root.ownerDocument.getSelection();
  return {
    anchorOffset: selection?.anchorOffset ?? null,
    collapsed: selection?.isCollapsed ?? null,
    focusOffset: selection?.focusOffset ?? null,
    insideRoot:
      selection?.anchorNode != null &&
      selection.focusNode != null &&
      root.contains(selection.anchorNode) &&
      root.contains(selection.focusNode),
  };
}

function requireEditor(ref: RefObject<LexicalEditor | null>): LexicalEditor {
  if (ref.current == null) throw new Error("Lexical editor must be ready");
  return ref.current;
}
