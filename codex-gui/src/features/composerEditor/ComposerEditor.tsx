import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
  $createParagraphNode,
  $getRoot,
  COMMAND_PRIORITY_BEFORE_EDITOR,
  KEY_ENTER_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import { useEffect, useMemo, useRef, type Ref } from "react";

import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";

import { ComposerClipboardPlugin } from "./ComposerClipboardPlugin";
import { SelectedSkillPresentationEnvironment } from "./SelectedSkillToken";
import { SkillEditingPlugin } from "./SkillEditingPlugin";
import {
  captureComposerDraft,
  composerDraftCaptureMatchesEditorState,
  projectComposerDraft,
  restoreComposerDraft,
  type ComposerDraft,
  type ComposerDraftCapture,
  type ComposerDraftRestoreResult,
} from "./composerDraft";
import { SkillNode } from "./SkillNode";
import { SkillTypeaheadPlugin, type SkillTypeaheadPlacement } from "./SkillTypeaheadPlugin";

export type ComposerEditorSkillMenuPlacement = SkillTypeaheadPlacement;

export type ComposerEditorSnapshot = Readonly<{
  textContent: string;
  selectedSkillPaths: readonly string[];
}>;

export type ComposerEditorSubmitIntent = "ordinary" | "guide";

export type ComposerEditorController = Readonly<{
  getSnapshot: () => ComposerEditorSnapshot;
  subscribe: (listener: () => void) => () => void;
  capture: () => ComposerDraftCapture;
  clearIfCurrent: (capture: ComposerDraftCapture) => boolean;
  restore: (draft: ComposerDraft) => ComposerDraftRestoreResult;
  focus: () => void;
  getRootElement: () => HTMLElement | null;
}>;

export type ComposerEditorProps = Readonly<{
  ariaLabel: string;
  controllerRef?: Ref<ComposerEditorController>;
  disabled: boolean;
  guardCompositionEndEnter: boolean;
  onControllerChange?: (controller: ComposerEditorController | null) => void;
  onRetrySkillCatalog?: () => void;
  onSubmit: (capture: ComposerDraftCapture, intent: ComposerEditorSubmitIntent) => void;
  placeholder: string;
  skillCatalog: SkillCatalogState;
  skillMenuParent: HTMLElement | null;
  skillMenuPlacement?: ComposerEditorSkillMenuPlacement;
  skillValidity?: Readonly<{
    invalidPaths: ReadonlySet<string>;
    statusText: string;
  }>;
}>;

export function ComposerEditor({
  ariaLabel,
  controllerRef,
  disabled,
  guardCompositionEndEnter,
  onControllerChange,
  onRetrySkillCatalog,
  onSubmit,
  placeholder,
  skillCatalog,
  skillMenuParent,
  skillMenuPlacement = "above",
  skillValidity,
}: ComposerEditorProps) {
  const primaryModifier = primaryModifierForPlatform(navigator.platform);
  const activeControllerRef = useRef<ComposerEditorController | null>(null);
  const isComposingRef = useRef(false);
  const suppressNextEnterRef = useRef(false);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const onCompositionStart = (): void => {
    isComposingRef.current = true;
    suppressNextEnterRef.current = false;
  };

  const onCompositionEnd = (): void => {
    const wasComposing = isComposingRef.current;
    isComposingRef.current = false;
    if (wasComposing && guardCompositionEndEnter) {
      suppressNextEnterRef.current = true;
    }
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <SelectedSkillPresentationEnvironment
        disabled={disabled}
        skillCatalog={skillCatalog}
        skillValidity={skillValidity}
      >
        <div className="relative min-w-0">
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                aria-autocomplete="list"
                aria-label={ariaLabel}
                aria-keyshortcuts={shortcutForPrimaryModifier(primaryModifier)}
                aria-multiline="true"
                className="min-h-24 w-full min-w-0 resize-none overflow-x-hidden overflow-y-auto bg-transparent px-3 py-2 leading-6 whitespace-pre-wrap outline-none [max-height:min(13rem,30vh)] [overflow-wrap:anywhere]"
                onCompositionEnd={onCompositionEnd}
                onCompositionStart={onCompositionStart}
                spellCheck
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
            placeholder={
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 px-3 py-2 leading-6 text-field-placeholder"
              >
                {placeholder}
              </div>
            }
          />
        </div>
        <EnterCommandPlugin
          activeControllerRef={activeControllerRef}
          isComposingRef={isComposingRef}
          onSubmitRef={onSubmitRef}
          primaryModifier={primaryModifier}
          suppressNextEnterRef={suppressNextEnterRef}
        />
        <HistoryPlugin />
        <ComposerControllerPlugin
          activeControllerRef={activeControllerRef}
          controllerRef={controllerRef}
          onControllerChange={onControllerChange}
        />
        <EditablePlugin disabled={disabled} />
        <SkillEditingPlugin />
        {skillMenuParent == null ? null : (
          <SkillTypeaheadPlugin
            isComposingRef={isComposingRef}
            onRetry={onRetrySkillCatalog}
            placement={skillMenuPlacement}
            portalParent={skillMenuParent}
            skillCatalog={skillCatalog}
          />
        )}
        <ComposerClipboardPlugin />
      </SelectedSkillPresentationEnvironment>
    </LexicalComposer>
  );
}

const initialConfig = {
  namespace: "codex-composer",
  nodes: [SkillNode],
  onError(error: Error) {
    throw error;
  },
};

type PrimaryModifier = "control" | "meta";

function primaryModifierForPlatform(platform: string): PrimaryModifier {
  return platform.startsWith("Mac") ? "meta" : "control";
}

function shortcutForPrimaryModifier(primaryModifier: PrimaryModifier): string {
  return primaryModifier === "meta" ? "Meta+Enter" : "Control+Enter";
}

function submitIntentForEnter(
  event: Pick<globalThis.KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  primaryModifier: PrimaryModifier,
): ComposerEditorSubmitIntent | null {
  if (event.shiftKey) {
    return null;
  }
  const isGuide =
    primaryModifier === "meta"
      ? event.metaKey && !event.ctrlKey && !event.altKey
      : event.ctrlKey && !event.metaKey && !event.altKey;
  return isGuide ? "guide" : "ordinary";
}

function EnterCommandPlugin({
  activeControllerRef,
  isComposingRef,
  onSubmitRef,
  primaryModifier,
  suppressNextEnterRef,
}: Readonly<{
  activeControllerRef: { current: ComposerEditorController | null };
  isComposingRef: { current: boolean };
  onSubmitRef: { current: ComposerEditorProps["onSubmit"] };
  primaryModifier: PrimaryModifier;
  suppressNextEnterRef: { current: boolean };
}>): null {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event == null) {
            return false;
          }
          const intent = submitIntentForEnter(event, primaryModifier);
          if (intent == null) {
            return false;
          }
          if (event.isComposing || isComposingRef.current) {
            event.preventDefault();
            return true;
          }
          if (suppressNextEnterRef.current) {
            event.preventDefault();
            suppressNextEnterRef.current = false;
            return true;
          }

          const controller = activeControllerRef.current;
          if (controller == null) {
            return false;
          }

          event.preventDefault();
          onSubmitRef.current(controller.capture(), intent);
          return true;
        },
        COMMAND_PRIORITY_BEFORE_EDITOR,
      ),
    [
      activeControllerRef,
      editor,
      isComposingRef,
      onSubmitRef,
      primaryModifier,
      suppressNextEnterRef,
    ],
  );

  return null;
}

function ComposerControllerPlugin({
  activeControllerRef,
  controllerRef,
  onControllerChange,
}: Readonly<{
  activeControllerRef: { current: ComposerEditorController | null };
  controllerRef?: Ref<ComposerEditorController>;
  onControllerChange?: (controller: ComposerEditorController | null) => void;
}>): null {
  const [editor] = useLexicalComposerContext();
  const controller = useMemo(() => new ComposerEditorControllerImpl(editor), [editor]);

  useEffect(() => {
    activeControllerRef.current = controller;
    assignRef(controllerRef, controller);
    onControllerChange?.(controller);
    const unregister = controller.start();

    return () => {
      unregister();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
      assignRef(controllerRef, null);
      onControllerChange?.(null);
    };
  }, [activeControllerRef, controller, controllerRef, onControllerChange]);

  return null;
}

function EditablePlugin({ disabled }: Readonly<{ disabled: boolean }>): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return null;
}

class ComposerEditorControllerImpl implements ComposerEditorController {
  private readonly editor: LexicalEditor;
  private publishedEditorState: EditorState;
  private snapshot: ComposerEditorSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(editor: LexicalEditor) {
    this.editor = editor;
    this.publishedEditorState = editor.getEditorState();
    this.snapshot = snapshotFromEditorState(editor.getEditorState());
  }

  readonly getSnapshot = (): ComposerEditorSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly capture = (): ComposerDraftCapture => captureComposerDraft(this.editor.getEditorState());

  readonly clearIfCurrent = (capture: ComposerDraftCapture): boolean => {
    if (!composerDraftCaptureMatchesEditorState(capture, this.editor.getEditorState())) {
      return false;
    }

    this.editor.update(
      () => {
        $getRoot().clear().append($createParagraphNode());
      },
      { discrete: true },
    );
    return true;
  };

  readonly restore = (draft: ComposerDraft): ComposerDraftRestoreResult =>
    restoreComposerDraft(this.editor, draft);

  readonly focus = (): void => {
    this.editor.focus();
  };

  readonly getRootElement = (): HTMLElement | null => this.editor.getRootElement();

  start(): () => void {
    this.publish(this.editor.getEditorState());
    return this.editor.registerUpdateListener(({ editorState }) => {
      this.publish(editorState);
    });
  }

  private publish(editorState: EditorState): void {
    if (this.publishedEditorState === editorState) {
      return;
    }

    this.publishedEditorState = editorState;
    this.snapshot = snapshotFromEditorState(editorState);
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function snapshotFromEditorState(editorState: EditorState): ComposerEditorSnapshot {
  return projectComposerDraft(editorState);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref != null) {
    ref.current = value;
  }
}
