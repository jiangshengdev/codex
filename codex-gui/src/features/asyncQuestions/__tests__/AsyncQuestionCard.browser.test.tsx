import { Profiler, type ProfilerOnRenderCallback } from "react";
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import { TranscriptReadContext } from "@/features/committedTranscriptSurface/TranscriptReadContext";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import { AsyncQuestionCard } from "../AsyncQuestionCard";

test("does not render an unchanged question when unrelated session revisions arrive", async () => {
  const harness = createActiveThreadSessionHarness();
  const snapshot = harness.activeSnapshot();
  harness.publish(snapshot);
  const rendered = vi.fn<ProfilerOnRenderCallback>();
  const screen = await renderWithProviders(
    <AppCapabilitiesProvider
      capabilities={{
        activeThreadSession: harness.session,
        newSessionOwner: new NewSessionOwner(),
        authorizationToken: null,
        commands: null,
        connectionRecovery: null,
        routeTarget: { type: "currentTask", threadId: snapshot.threadId },
        status: { label: "initialized" },
      }}
    >
      <TranscriptReadContext value={{ kind: "live", identity: snapshot.identity }}>
        <Profiler id="question" onRender={rendered}>
          <AsyncQuestionCard
            question={{ title: "Historical question", options: null }}
            turnId="old-turn"
            itemId="old-item"
            index={0}
          />
        </Profiler>
      </TranscriptReadContext>
    </AppCapabilitiesProvider>,
  );
  await expect.element(screen.getByText("Historical question", { exact: true })).toBeVisible();
  const before = rendered.mock.calls.length;
  harness.publish({ ...snapshot, revision: snapshot.revision + 1, activeTurnId: "later-turn" });
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => {
      resolve();
    }),
  );
  expect(rendered).toHaveBeenCalledTimes(before);
});
