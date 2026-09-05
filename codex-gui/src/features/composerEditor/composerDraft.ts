import {
  $getRoot,
  $isElementNode,
  CLEAR_HISTORY_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type SerializedEditorState,
} from "lexical";

import type { ReadonlyComposerInputPayload } from "@/features/composerInput/composerInputPayload";

import { $isSkillNode, type SkillNodeState } from "./SkillNode";

const composerDraftBrand: unique symbol = Symbol("ComposerDraft");
const composerDraftCaptureBrand: unique symbol = Symbol("ComposerDraftCapture");
const composerDraftVersion = 1;

export type ComposerDraft = Readonly<{
  [composerDraftBrand]: true;
}>;

export type ComposerDraftCapture = Readonly<{
  [composerDraftCaptureBrand]: true;
  draft: ComposerDraft;
  input: ReadonlyComposerInputPayload;
  textContent: string;
  selectedSkillPaths: readonly string[];
}>;

export type ComposerDraftRestoreResult =
  | Readonly<{ type: "restored" }>
  | Readonly<{ type: "invalidDraft" }>;

export type ComposerDraftProjection = Readonly<{
  textContent: string;
  selectedSkillPaths: readonly string[];
}>;

type ComposerDraftRecord = Readonly<{
  version: number;
  serializedEditorState: SerializedEditorState;
}>;

const composerDraftRecords = new WeakMap<ComposerDraft, ComposerDraftRecord>();
const composerDraftCaptureStates = new WeakMap<ComposerDraftCapture, EditorState>();

export function captureComposerDraft(editorState: EditorState): ComposerDraftCapture {
  const serializedEditorState = editorState.toJSON();
  const { input, selectedSkillPaths, textContent } = compileEditorState(editorState);
  const draft = { [composerDraftBrand]: true } as ComposerDraft;
  composerDraftRecords.set(draft, {
    version: composerDraftVersion,
    serializedEditorState,
  });

  const capture = {
    [composerDraftCaptureBrand]: true,
    draft,
    input,
    textContent,
    selectedSkillPaths,
  } as ComposerDraftCapture;
  composerDraftCaptureStates.set(capture, editorState);
  return capture;
}

export function projectComposerDraft(editorState: EditorState): ComposerDraftProjection {
  return editorState.read(() => {
    const selectedSkillPaths: string[] = [];
    collectSelectedSkillPaths($getRoot(), selectedSkillPaths);
    return {
      textContent: $getRoot().getTextContent(),
      selectedSkillPaths,
    };
  });
}

function collectSelectedSkillPaths(node: LexicalNode, paths: string[]): void {
  if ($isSkillNode(node)) {
    paths.push(node.getSkill().path);
    return;
  }
  if (!$isElementNode(node)) return;
  for (const child of node.getChildren()) {
    collectSelectedSkillPaths(child, paths);
  }
}

export function composerDraftCaptureMatchesEditorState(
  capture: ComposerDraftCapture,
  editorState: EditorState,
): boolean {
  return composerDraftCaptureStates.get(capture) === editorState;
}

export function restoreComposerDraft(
  editor: LexicalEditor,
  draft: ComposerDraft,
): ComposerDraftRestoreResult {
  const record = composerDraftRecords.get(draft);
  if (record?.version !== composerDraftVersion) {
    return { type: "invalidDraft" };
  }

  let restoredEditorState: EditorState;
  try {
    restoredEditorState = editor.parseEditorState(record.serializedEditorState, () => {
      $getRoot().selectEnd();
    });
  } catch {
    return { type: "invalidDraft" };
  }

  editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  editor.setEditorState(restoredEditorState);
  return { type: "restored" };
}

function compileEditorState(editorState: EditorState): Readonly<{
  input: ReadonlyComposerInputPayload;
  selectedSkillPaths: readonly string[];
  textContent: string;
}> {
  return editorState.read(() => {
    const skills: SkillNodeState[] = [];
    const selectedSkillPaths: string[] = [];
    const seenPaths = new Set<string>();
    const root = $getRoot();
    const text = compileNode(root, skills, selectedSkillPaths, seenPaths);
    const input: ReadonlyComposerInputPayload = [
      { type: "text", text, text_elements: [] },
      ...skills.map(({ name, path }) => ({ type: "skill" as const, name, path })),
    ];
    return {
      input,
      selectedSkillPaths,
      textContent: root.getTextContent(),
    };
  });
}

function compileNode(
  node: LexicalNode,
  skills: SkillNodeState[],
  selectedSkillPaths: string[],
  seenPaths: Set<string>,
): string {
  if ($isSkillNode(node)) {
    const skill = node.getSkill();
    selectedSkillPaths.push(skill.path);
    if (!seenPaths.has(skill.path)) {
      seenPaths.add(skill.path);
      skills.push(skill);
    }
    return `$${skill.name}`;
  }

  if (!$isElementNode(node)) {
    return node.getTextContent();
  }

  const children = node.getChildren();
  let text = "";
  for (const [index, child] of children.entries()) {
    text += compileNode(child, skills, selectedSkillPaths, seenPaths);
    if ($isElementNode(child) && index !== children.length - 1 && !child.isInline()) {
      text += "\n\n";
    }
  }
  return text;
}
