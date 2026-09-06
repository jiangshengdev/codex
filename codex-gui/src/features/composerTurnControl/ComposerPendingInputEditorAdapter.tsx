import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  const connectionGenerationRef = useRef(0);
  const [connectionFailure, setConnectionFailure] = useState<{ error: unknown } | null>(null);
  useLayoutEffect(() => {
    factsRef.current = facts;
  }, [facts]);
  const handleControllerChange = useCallback(
    (controller: ComposerEditorController | null): void => {
      const generation = ++connectionGenerationRef.current;
      if (controller == null) {
        if (controllerRef.current?.preparationToken === edit.preparationToken) {
          controllerRef.current = null;
        }
      } else {
        controllerRef.current = { preparationToken: edit.preparationToken, controller };
      }
      // Restore synchronously as one transaction, after React leaves its commit.
      // A reconnect also invalidates the cleanup scheduled by effect replay.
      queueMicrotask(() => {
        if (connectionGenerationRef.current !== generation) return;
        if (controller == null) {
          pendingInputSession.detachEditor(factsRef.current, edit.preparationToken);
          return;
        }
        try {
          pendingInputSession.attachEditor({
            facts: factsRef.current,
            preparationToken: edit.preparationToken,
            itemKey: edit.item.key,
            restore: controller.restore,
            capture: () => controller.capture(),
          });
        } catch (error) {
          // Keep unexpected failures visible to the existing React error boundary.
          setConnectionFailure({ error });
        }
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

  if (connectionFailure != null) throw connectionFailure.error;

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
