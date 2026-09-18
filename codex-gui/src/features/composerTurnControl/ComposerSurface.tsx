import { Surface } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useState, type ReactNode, type Ref } from "react";
import { ComposerEditor, type ComposerEditorProps } from "@/features/composerEditor/ComposerEditor";
import { ComposerSkillMenuLayer } from "./ComposerSkillMenuLayer";

type ComposerSurfaceProps = Readonly<{
  editor: Omit<
    ComposerEditorProps,
    "attachmentControlsParent" | "skillMenuParent" | "ariaLabel" | "placeholder"
  >;
  editorKey?: string;
  header?: ReactNode;
  feedback?: ReactNode;
  afterEditor?: ReactNode;
  toolbarLeading?: ReactNode;
  actions: ReactNode;
  disabled?: boolean;
  shellRef?: Ref<HTMLElement>;
  focusVisible?: boolean;
}>;

export function ComposerSurface({
  editor,
  editorKey,
  header,
  feedback,
  afterEditor,
  toolbarLeading,
  actions,
  disabled = false,
  shellRef,
  focusVisible,
}: ComposerSurfaceProps) {
  const { t } = useLingui();
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
            key={editorKey}
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
