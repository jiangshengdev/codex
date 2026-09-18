import { Surface } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ComposerEditor, type ComposerEditorProps } from "@/features/composerEditor/ComposerEditor";
import { ComposerSkillMenuLayer } from "./ComposerSkillMenuLayer";
import { useRevealComposerOnViewportResize } from "./useRevealComposerOnViewportResize";

type ComposerSurfaceProps = Readonly<{
  editor: Omit<
    ComposerEditorProps,
    "attachmentControlsParent" | "skillMenuParent" | "ariaLabel" | "placeholder"
  >;
  header?: ReactNode;
  feedback?: ReactNode;
  afterEditor?: ReactNode;
  toolbarLeading?: ReactNode;
  actions: ReactNode;
  disabled?: boolean;
}>;

export function ComposerSurface({
  editor,
  header,
  feedback,
  afterEditor,
  toolbarLeading,
  actions,
  disabled = false,
}: ComposerSurfaceProps) {
  const { t } = useLingui();
  const shellRef = useRef<HTMLElement | null>(null);
  const focusVisible = useComposerFocusVisible(shellRef);
  useRevealComposerOnViewportResize(shellRef);
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);
  const [attachmentControlsParent, setAttachmentControlsParent] = useState<HTMLDivElement | null>(
    null,
  );

  return (
    <section
      aria-label={t`Message composer`}
      className="composer-shell task-bottom-shell sticky bottom-0 z-10"
      ref={shellRef}
    >
      <Surface className="composer-frame flex flex-col gap-1" variant="secondary">
        {header}
        {feedback}
        <Surface
          aria-disabled={disabled}
          className="composer-panel task-bottom-panel composer-field grid gap-2"
          data-disabled={disabled}
          data-readonly={editor.disabled && !disabled}
          data-focus-visible={focusVisible}
          variant="default"
        >
          <ComposerSkillMenuLayer onPortalParentChange={setSkillMenuParent} />
          <ComposerEditor
            {...editor}
            ariaLabel={t`Message Codex`}
            placeholder={t`Message Codex`}
            attachmentControlsParent={attachmentControlsParent}
            skillMenuParent={skillMenuParent}
          />
          {afterEditor}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="composer-footer-left flex shrink-0 items-center gap-2">
              <div className="flex items-center" ref={setAttachmentControlsParent} />
              {toolbarLeading}
            </div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
        </Surface>
      </Surface>
    </section>
  );
}

function useComposerFocusVisible(composerShellRef: {
  readonly current: HTMLElement | null;
}): boolean {
  const [isFocusVisible, setIsFocusVisible] = useState(false);

  useEffect(() => {
    const composerPanel = composerShellRef.current?.querySelector(".composer-panel");
    if (!(composerPanel instanceof HTMLElement)) {
      return;
    }

    let lastModality: "keyboard" | "pointer" = "keyboard";
    let publishedFocusVisible = false;
    const publishFocusVisible = (nextFocusVisible: boolean): void => {
      if (publishedFocusVisible === nextFocusVisible) {
        return;
      }
      publishedFocusVisible = nextFocusVisible;
      setIsFocusVisible(nextFocusVisible);
    };
    const handlePointerDown = (): void => {
      lastModality = "pointer";
      if (composerPanel.contains(document.activeElement)) {
        publishFocusVisible(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" && event.key !== "Escape") {
        return;
      }
      lastModality = "keyboard";
      if (composerPanel.contains(document.activeElement)) {
        publishFocusVisible(true);
      }
    };
    const handleVirtualClick = (event: MouseEvent): void => {
      if (event.detail !== 0) {
        return;
      }
      lastModality = "keyboard";
      if (
        composerPanel.contains(document.activeElement) ||
        (event.target instanceof Node && composerPanel.contains(event.target))
      ) {
        publishFocusVisible(true);
      }
    };
    const handleFocusIn = (): void => {
      publishFocusVisible(lastModality === "keyboard");
    };
    const handleFocusOut = (event: FocusEvent): void => {
      if (event.relatedTarget instanceof Node && composerPanel.contains(event.relatedTarget)) {
        return;
      }
      publishFocusVisible(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleVirtualClick, true);
    composerPanel.addEventListener("focusin", handleFocusIn);
    composerPanel.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("click", handleVirtualClick, true);
      composerPanel.removeEventListener("focusin", handleFocusIn);
      composerPanel.removeEventListener("focusout", handleFocusOut);
    };
  }, [composerShellRef]);

  return isFocusVisible;
}
