import { Alert, Surface } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorSnapshot,
} from "@/features/composerEditor/ComposerEditor";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerEditorContracts";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { invalidSelectedSkillPaths } from "./composerTurnControlModel";

export type ComposerPendingInputEditorProps = Readonly<{
  guardCompositionEndEnter: boolean;
  onControllerChange: (controller: ComposerEditorController | null) => void;
  onSave: (capture: ComposerDraftCapture) => void;
  onRetrySkillCatalog: () => void;
  onValidityChange: (valid: boolean) => void;
  skillCatalog: SkillCatalogState;
}>;

export function ComposerPendingInputEditor({
  guardCompositionEndEnter,
  onControllerChange,
  onSave,
  onRetrySkillCatalog,
  onValidityChange,
  skillCatalog,
}: ComposerPendingInputEditorProps) {
  const { t } = useLingui();
  const [controller, setController] = useState<ComposerEditorController | null>(null);
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);
  const snapshot = useSyncExternalStore<ComposerEditorSnapshot | null>(
    controller?.subscribe ?? subscribeUnavailableEditor,
    controller?.getSnapshot ?? getUnavailableEditorSnapshot,
  );
  const invalidPaths = useMemo(
    () => invalidSelectedSkillPaths(skillCatalog, snapshot?.selectedSkillPaths ?? []),
    [skillCatalog, snapshot],
  );
  const invalidStatusText = t`Invalid skill`;
  const skillValidity = useMemo(
    () => ({ invalidPaths, statusText: invalidStatusText }),
    [invalidPaths, invalidStatusText],
  );
  const valid = invalidPaths.size === 0;
  const handleControllerChange = useCallback(
    (nextController: ComposerEditorController | null): void => {
      setController(nextController);
      onControllerChange(nextController);
    },
    [onControllerChange],
  );

  useEffect(() => {
    onValidityChange(valid);
  }, [onValidityChange, valid]);

  return (
    <div className="relative grid min-w-0 gap-3">
      <div
        className="pointer-events-none absolute inset-x-0 top-full z-20 max-h-[min(22rem,45vh)]"
        ref={setSkillMenuParent}
      />
      <Surface
        className="relative min-w-0 rounded-field border bg-field text-field-foreground [border-color:var(--field-border)] [border-width:var(--border-width-field)]"
        variant="default"
      >
        <ComposerEditor
          ariaLabel={t`Edit pending message`}
          disabled={false}
          guardCompositionEndEnter={guardCompositionEndEnter}
          onControllerChange={handleControllerChange}
          onRetrySkillCatalog={onRetrySkillCatalog}
          onSubmit={(capture) => {
            if (valid) onSave(capture);
          }}
          placeholder={t`Edit pending message`}
          skillCatalog={skillCatalog}
          skillMenuParent={skillMenuParent}
          skillMenuPlacement="below"
          skillValidity={skillValidity}
        />
      </Surface>
      {invalidPaths.size > 0 ? (
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              <Trans>Invalid skill</Trans>
            </Alert.Title>
            <Alert.Description>
              <Trans>Remove or replace invalid skills before saving.</Trans>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </div>
  );
}

const subscribeUnavailableEditor = (): (() => void) => () => undefined;
const getUnavailableEditorSnapshot = (): null => null;
