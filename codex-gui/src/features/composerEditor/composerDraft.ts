import {
  $createParagraphNode,
  $getRoot,
  $isElementNode,
  $nodesOfType,
  CLEAR_HISTORY_COMMAND,
  createEditor,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  LineBreakNode,
  type SerializedEditorState,
} from "lexical";

import type { ReadonlyComposerInputPayload } from "@/features/composerInput/composerInputPayload";

import { $isSkillNode, SkillNode, type SkillNodeState } from "./SkillNode";
import { $getComposerText } from "./composerText";
import { $normalizeComposerLineBreak } from "./composerParagraphs";

const composerDraftBrand: unique symbol = Symbol("ComposerDraft");
const composerDraftCaptureBrand: unique symbol = Symbol("ComposerDraftCapture");
const composerDraftVersion = 2;

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

// The editor owns the JSON payload; persistence consumers retain it unchanged.
export type PersistedComposerDraft = Readonly<{
  version: typeof composerDraftVersion;
  editorStateJson: string;
}>;

export type ComposerDraftImportResult =
  | Readonly<{ type: "imported"; draft: ComposerDraft }>
  | Readonly<{ type: "invalidDraft" }>;

type ComposerDraftRecord = Readonly<{
  version: number;
  serializedEditorState: SerializedEditorState;
}>;

const composerDraftRecords = new WeakMap<ComposerDraft, ComposerDraftRecord>();
const composerDraftCaptureStates = new WeakMap<ComposerDraftCapture, EditorState>();

export function exportComposerDraft(draft: ComposerDraft): PersistedComposerDraft {
  const record = composerDraftRecords.get(draft);
  if (record?.version !== composerDraftVersion) {
    throw new Error("Cannot export an invalid composer draft");
  }
  return {
    version: composerDraftVersion,
    editorStateJson: JSON.stringify(record.serializedEditorState),
  };
}

export function importComposerDraft(value: unknown): ComposerDraftImportResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    (value.version !== 1 && value.version !== composerDraftVersion) ||
    !("editorStateJson" in value) ||
    typeof value.editorStateJson !== "string"
  ) {
    return { type: "invalidDraft" };
  }

  try {
    // Parsing has no live editor to mutate and invokes each registered node's
    // importJSON, including SkillNode's own version and field validation.
    const editor = createEditor({
      namespace: "codex-composer-draft-import",
      nodes: [SkillNode],
      onError(error) {
        throw error;
      },
    });
    const editorState = editor.parseEditorState(value.editorStateJson, () => {
      // Version 1 compiled every block boundary as two newlines. Preserve the
      // extra newline explicitly; subsequent imports only see version 2.
      if (value.version === 1) {
        const blocks = $getRoot().getChildren();
        for (const block of blocks.slice(0, -1)) {
          if ($isElementNode(block) && !block.isInline()) {
            block.insertAfter($createParagraphNode());
          }
        }
      }
      $normalizeDraftLineBreaks();
    });
    const capture = captureComposerDraft(editorState);
    return { type: "imported", draft: capture.draft };
  } catch {
    return { type: "invalidDraft" };
  }
}

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
      textContent: $getComposerText($getRoot().getChildren(), "display"),
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
      $normalizeDraftLineBreaks();
      $getRoot().selectEnd();
    });
  } catch {
    return { type: "invalidDraft" };
  }

  editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  editor.setEditorState(restoredEditorState);
  return { type: "restored" };
}

function $normalizeDraftLineBreaks(): void {
  for (const node of $nodesOfType(LineBreakNode)) $normalizeComposerLineBreak(node);
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
    collectSkills(root, skills, selectedSkillPaths, seenPaths);
    const text = $getComposerText(root.getChildren(), "canonical");
    const input: ReadonlyComposerInputPayload = [
      { type: "text", text, text_elements: [] },
      ...skills.map(({ name, path }) => ({ type: "skill" as const, name, path })),
    ];
    return {
      input,
      selectedSkillPaths,
      textContent: $getComposerText(root.getChildren(), "display"),
    };
  });
}

function collectSkills(
  node: LexicalNode,
  skills: SkillNodeState[],
  selectedSkillPaths: string[],
  seenPaths: Set<string>,
): void {
  if ($isSkillNode(node)) {
    const skill = node.getSkill();
    selectedSkillPaths.push(skill.path);
    if (!seenPaths.has(skill.path)) {
      seenPaths.add(skill.path);
      skills.push(skill);
    }
    return;
  }

  if (!$isElementNode(node)) {
    return;
  }

  for (const child of node.getChildren()) {
    collectSkills(child, skills, selectedSkillPaths, seenPaths);
  }
}
