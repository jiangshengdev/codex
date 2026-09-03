import { useCallback, useLayoutEffect, useRef } from "react";
import type { ComposerEditorController } from "@/features/composerEditor/ComposerEditor";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { ComposerPendingInputEditor } from "./ComposerPendingInputEditor";
import type {
  ComposerPendingInputCurrentFacts,
  ComposerPendingInputSession,
  ComposerPendingInputSessionSnapshot,
} from "./composerPendingInputSession";

export function ComposerPendingInputEditorAdapter({
  controllerRef,
  edit,
  facts,
  guardCompositionEndEnter,
  onRetrySkillCatalog,
  pendingInputSession,
  skillCatalog,
}: Readonly<{
  controllerRef: {
    current: Readonly<{
      preparationToken: number;
      controller: ComposerEditorController;
    }> | null;
  };
  edit: NonNullable<NonNullable<ComposerPendingInputSessionSnapshot["view"]>["edit"]>;
  facts: ComposerPendingInputCurrentFacts;
  guardCompositionEndEnter: boolean;
  onRetrySkillCatalog: () => void;
  pendingInputSession: ComposerPendingInputSession;
  skillCatalog: SkillCatalogState;
}>) {
  const factsRef = useRef(facts);
  useLayoutEffect(() => {
    factsRef.current = facts;
  }, [facts]);
  const handleControllerChange = useCallback(
    (controller: ComposerEditorController | null): void => {
      const currentFacts = factsRef.current;
      if (controller == null) {
        if (controllerRef.current?.preparationToken === edit.preparationToken) {
          controllerRef.current = null;
        }
        pendingInputSession.detachEditor(currentFacts, edit.preparationToken);
        return;
      }
      controllerRef.current = { preparationToken: edit.preparationToken, controller };
      pendingInputSession.attachEditor({
        facts: currentFacts,
        preparationToken: edit.preparationToken,
        itemKey: edit.item.key,
        restore: controller.restore,
        capture: () => controller.capture(),
      });
    },
    [controllerRef, edit.item.key, edit.preparationToken, pendingInputSession],
  );
  const handleValidityChange = useCallback(
    (valid: boolean): void => {
      pendingInputSession.setEditorValidity(factsRef.current, edit.preparationToken, valid);
    },
    [edit.preparationToken, pendingInputSession],
  );
  const handleSave = useCallback((): void => {
    pendingInputSession.saveEdit(factsRef.current, edit.preparationToken);
  }, [edit.preparationToken, pendingInputSession]);

  return (
    <ComposerPendingInputEditor
      guardCompositionEndEnter={guardCompositionEndEnter}
      onControllerChange={handleControllerChange}
      onRetrySkillCatalog={onRetrySkillCatalog}
      onSave={handleSave}
      onValidityChange={handleValidityChange}
      skillCatalog={skillCatalog}
    />
  );
}
