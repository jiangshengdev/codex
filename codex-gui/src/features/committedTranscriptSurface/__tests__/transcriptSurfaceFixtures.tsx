import type { ReactElement } from "react";
import { makeStore } from "@/app/store";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import { activeThreadReadModelSlotCreated } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { renderWithProviders } from "@/utils/test-utils";

export const transcriptIdentity: ActiveThreadSessionIdentity = {
  threadId: attachBaseline.snapshot.thread.id,
  instanceId: "transcript-surface-instance",
};

export function makeTranscriptStore(identity: ActiveThreadSessionIdentity) {
  const store = makeStore();
  store.dispatch(activeThreadReadModelSlotCreated(identity));
  return store;
}

export function renderTranscriptWithProviders(
  identity: ActiveThreadSessionIdentity,
  ui: ReactElement,
  options: Omit<NonNullable<Parameters<typeof renderWithProviders>[1]>, "preloadedState"> = {},
) {
  const store = options.store ?? makeTranscriptStore(identity);
  return renderWithProviders(ui, { ...options, store });
}
