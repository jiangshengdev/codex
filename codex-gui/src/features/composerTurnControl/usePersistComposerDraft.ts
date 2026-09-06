import { useCallback, useEffect, useRef } from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerDraft } from "@/features/composerEditor/composerEditorContracts";

export function usePersistComposerDraft(
  role: ActiveThreadComposerRole,
  revision: number,
): (draft: ComposerDraft) => void {
  const pending = useRef<{ role: ActiveThreadComposerRole; draft: ComposerDraft } | null>(null);
  const save = useCallback(
    (draft: ComposerDraft): void => {
      const result = role.saveDraft(revision, draft);
      pending.current =
        typeof result === "object" && result.reason === "staleRevision" ? { role, draft } : null;
    },
    [role, revision],
  );

  useEffect(() => {
    const unsaved = pending.current;
    if (unsaved == null) return;
    if (unsaved.role !== role) {
      pending.current = null;
      return;
    }
    save(unsaved.draft);
  }, [role, save]);

  return save;
}
