import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { $createParagraphNode, $getRoot, type EditorState, type LexicalEditor } from "lexical";
import { useEffect, useMemo, useRef, type KeyboardEvent, type Ref } from "react";

import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";

import { ComposerClipboardPlugin } from "./ComposerClipboardPlugin";
import { SkillNode } from "./SkillNode";
import { SkillTypeaheadPlugin } from "./SkillTypeaheadPlugin";

export type ComposerEditorSnapshot = Readonly<{
  editorState: EditorState;
  textContent: string;
}>;

export type ComposerEditorController = Readonly<{
  getSnapshot: () => ComposerEditorSnapshot;
  subscribe: (listener: () => void) => () => void;
  clearIfSame: (editorState: EditorState) => boolean;
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
  onSubmit: (snapshot: ComposerEditorSnapshot) => void;
  placeholder: string;
  skillCatalog: SkillCatalogState;
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
}: ComposerEditorProps) {
  const activeControllerRef = useRef<ComposerEditorController | null>(null);
  const isComposingRef = useRef(false);
  const suppressNextEnterRef = useRef(false);

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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) {
      suppressNextEnterRef.current = false;
      return;
    }

    if (event.nativeEvent.isComposing || isComposingRef.current) {
      return;
    }

    if (suppressNextEnterRef.current) {
      event.preventDefault();
      suppressNextEnterRef.current = false;
      return;
    }

    const controller = activeControllerRef.current;
    if (controller == null) {
      return;
    }

    event.preventDefault();
    onSubmit(controller.getSnapshot());
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            aria-autocomplete="list"
            aria-label={ariaLabel}
            aria-multiline="true"
            className="min-h-24 w-full resize-none bg-transparent px-3 py-2 outline-none"
            onCompositionEnd={onCompositionEnd}
            onCompositionStart={onCompositionStart}
            onKeyDown={onKeyDown}
            spellCheck
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
        placeholder={
          <div
            aria-hidden="true"
            className="pointer-events-none absolute px-3 py-2 text-default-500"
          >
            {placeholder}
          </div>
        }
      />
      <HistoryPlugin />
      <ComposerControllerPlugin
        activeControllerRef={activeControllerRef}
        controllerRef={controllerRef}
        onControllerChange={onControllerChange}
      />
      <EditablePlugin disabled={disabled} />
      <SkillTypeaheadPlugin
        isComposingRef={isComposingRef}
        onRetry={onRetrySkillCatalog}
        skillCatalog={skillCatalog}
      />
      <ComposerClipboardPlugin />
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
  private snapshot: ComposerEditorSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(editor: LexicalEditor) {
    this.editor = editor;
    this.snapshot = snapshotFromEditorState(editor.getEditorState());
  }

  readonly getSnapshot = (): ComposerEditorSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly clearIfSame = (editorState: EditorState): boolean => {
    if (this.editor.getEditorState() !== editorState) {
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
    if (this.snapshot.editorState === editorState) {
      return;
    }

    this.snapshot = snapshotFromEditorState(editorState);
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function snapshotFromEditorState(editorState: EditorState): ComposerEditorSnapshot {
  return editorState.read(() => ({
    editorState,
    textContent: $getRoot().getTextContent(),
  }));
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref != null) {
    ref.current = value;
  }
}
