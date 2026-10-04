import type { AppDispatch } from "@/app/store";
import { createActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithSnapshotThread,
  attachWithThreadId,
  attachWithTurns,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { createRecoveryCommands } from "../recovery/recoveryCommands";
import { createAttachmentRequests } from "../composer/attachmentRequests";
import { previewSkill } from "../composer/composerScenario";

export const newSessionId = "00000000-0000-0000-0000-000000000138";
export const newSessionCwd = "/storybook/workspaces/example-project";
export type NewSessionOptions = Readonly<{
  preset?:
    | "interactive"
    | "initialInput"
    | "missingDirectory"
    | "blankInput"
    | "creating"
    | "activating"
    | "failed";
  failure?: "create" | "createUnknown" | "activate" | "handoff" | "handoffUnknown";
  input?: "skill" | "file" | "image" | "mixed";
  uploading?: boolean;
}>;

export function createNewSessionScenario(dispatch: AppDispatch, options: NewSessionOptions) {
  const fallback = createRecoveryCommands();
  const uploads = createAttachmentRequests();
  const listeners = createListenerSet();
  const records = new Map<string, string>();
  let failWrites = options.failure === "handoff";
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
  const authorization = new BrowserAuthorizationSession(
    storage,
    {
      token: "storybook-new-session",
      activeThreadId: null,
      ...(options.preset === "missingDirectory" ? {} : { historyCwd: newSessionCwd }),
    },
    crypto.randomUUID(),
  );
  const empty = attachWithTurns(attachWithThreadId(attachBaseline, newSessionId), []);
  const baseline = attachWithSnapshotThread(empty, {
    ...empty.snapshot.thread,
    cwd: newSessionCwd,
    name: "Fictional new session",
    preview: "",
  });
  const cancellations = new Set<() => void>();
  const wait = (hold = false): Promise<void> =>
    new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        reject(new Error("Local preview disposed"));
      };
      const timer = hold
        ? undefined
        : setTimeout(() => {
            cancellations.delete(cancel);
            resolve();
          }, 600);
      cancellations.add(cancel);
    });
  let starts = 0;
  let attaches = 0;
  let sends: Parameters<GuiHostCommands["startTurn"]>[0][] = [];
  const commands: GuiHostCommands = {
    ...fallback.commands,
    startThread: async () => {
      starts += 1;
      listeners.notify();
      await wait(options.preset === "creating");
      if (starts === 1 && (options.failure === "create" || options.failure === "createUnknown")) {
        throw new GuiHostCommandError({
          source: "send",
          delivery: options.failure === "create" ? "definitelyNotAccepted" : "deliveryUnknown",
          error: new Error("Simulated session creation failure"),
        });
      }
      return {
        thread: baseline.snapshot.thread,
        model: "storybook-model",
        modelProvider: "storybook",
        serviceTier: null,
        disabledPluginIds: [],
        cwd: newSessionCwd,
        instructionSources: [],
        approvalPolicy: "on-request",
        approvalsReviewer: "user",
        sandbox: { type: "dangerFullAccess" },
        reasoningEffort: null,
      };
    },
    listLoadedThreads: () => Promise.resolve({ data: [newSessionId], nextCursor: null }),
    attachThreadProjection: async () => {
      attaches += 1;
      await wait(options.preset === "activating");
      if (attaches === 1 && options.failure === "activate")
        throw new Error("Simulated session activation failure");
      return baseline;
    },
    listSkills: () =>
      Promise.resolve({
        data: [
          {
            cwd: newSessionCwd,
            skills: [{ ...previewSkill, enabled: true, pluginId: null }],
            errors: [],
          },
        ],
      }),
    // Keep the real queue's first request observable without advancing a model turn.
    startTurn: (params) => {
      sends = [...sends, params];
      listeners.notify();
      if (options.failure === "handoffUnknown") throw new Error("Simulated unknown input handoff");
      return wait(true).then(() => {
        throw new Error("Local preview disposed");
      });
    },
  };
  const controller = createActiveThreadSession({
    dispatch,
    commands,
    authorizationSession: authorization,
    persistence: {
      authorizationContext: authorization.getPersistenceContext(),
      storage: {
        getItem: storage.getItem,
        setItem: (key, value) => {
          // Only the existing per-thread queue record fails; membership and authorization still persist.
          if (
            failWrites &&
            key === `codex-gui.browserPersistence.${encodeURIComponent(newSessionId)}`
          )
            throw new Error("Simulated queue storage failure");
          storage.setItem(key, value);
        },
      },
    },
    scheduler: {
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => {
        cancelAnimationFrame(id);
      },
    },
  });
  const owner = new NewSessionOwner();
  owner.setConnection({ commands, session: controller.session });
  owner.setNavigation(true, "initial");
  if (options.preset !== "missingDirectory") owner.open(newSessionCwd);
  const capture = composerDraftCapture(
    options.preset === "blankInput" ? "   " : "Review the fictional project.",
    {
      skill:
        options.input === "skill" || options.input === "mixed"
          ? {
              name: previewSkill.name,
              path: previewSkill.path,
              displayName: previewSkill.name,
              sourceLabel: "repo",
            }
          : null,
    },
  );
  if (options.preset != null && options.preset !== "interactive") owner.saveDraft(capture.draft);
  let started = false;
  return {
    commands,
    session: controller.session,
    owner,
    options,
    uploads,
    recoverStorage() {
      failWrites = false;
      const snapshot = controller.session.getSnapshot();
      if (snapshot.phase === "active") snapshot.composerRole.retryPersistence(snapshot.revision);
    },
    start() {
      if (started) return;
      started = true;
      if (
        options.input == null &&
        (options.preset === "creating" ||
          options.preset === "activating" ||
          options.preset === "failed")
      )
        void owner.submit(capture);
    },
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    getStarts: () => starts,
    getSends: () => sends,
    dispose() {
      owner.setConnection(null);
      owner.setNavigation(false, null);
      controller.dispose();
      uploads.dispose();
      for (const cancel of cancellations) cancel();
      cancellations.clear();
      listeners.clear();
      fallback.dispose();
    },
  };
}
