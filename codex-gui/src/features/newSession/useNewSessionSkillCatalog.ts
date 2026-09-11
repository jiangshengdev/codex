import { useEffect, useState } from "react";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  SkillCatalogOwner,
  type SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";

const unavailableCatalog: SkillCatalogState = {
  type: "initialLoading",
  previousFailure: null,
  candidates: [],
  partialErrorCount: 0,
};

export function useNewSessionSkillCatalog(cwd: string, commands: GuiHostCommands | null) {
  const [catalog, setCatalog] = useState<{
    cwd: string;
    commands: GuiHostCommands;
    owner: SkillCatalogOwner;
    state: SkillCatalogState;
  } | null>(null);

  useEffect(() => {
    if (commands == null) return;
    const owner = new SkillCatalogOwner({ cwd, listSkills: commands.listSkills });
    const unsubscribe = owner.subscribe(() => {
      setCatalog({ cwd, commands, owner, state: owner.getSnapshot() });
    });
    owner.start();
    return () => {
      unsubscribe();
      owner.dispose();
    };
  }, [commands, cwd]);

  const current = catalog?.commands === commands && catalog.cwd === cwd ? catalog : null;
  return {
    skillCatalog: current?.state ?? unavailableCatalog,
    retry: () => current?.owner.retry(),
  };
}
