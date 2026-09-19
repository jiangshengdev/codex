import { createActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import type { SkillCatalogCandidate } from "@/features/skillCatalog/skillCatalogOwner";
import {
  createPendingInputScenario,
  type PendingInputScenarioOptions,
} from "../pendingInput/pendingInputScenario";

export const previewSkill: SkillCatalogCandidate = {
  name: "preview-review",
  description: "Review fictional changes in this local simulation.",
  shortDescription: "Local review fixture",
  path: "/storybook/skills/preview-review/SKILL.md",
  scope: "repo",
};

export function createComposerScenario(persistence?: PendingInputScenarioOptions["persistence"]) {
  const queue = createPendingInputScenario({ ordinaryCount: 0, persistence, activeTurnId: null });
  queue.coordinator.completeRestoreReconciliation();
  return {
    ...queue,
    identity: createActiveThreadSessionIdentity("thread-1"),
    dispose() {
      queue.dispose();
      for (const requests of [queue.starts, queue.steers, queue.interrupts]) {
        for (const request of requests.getSnapshot()) {
          request.reject(new Error("Storybook simulation disposed"));
        }
      }
    },
  };
}

export type ComposerScenario = ReturnType<typeof createComposerScenario>;
