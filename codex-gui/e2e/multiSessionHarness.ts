import { expect, type Page, type WebSocketRoute } from "@playwright/test";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithSnapshotThread,
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
  eventForThreadOwner,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { InitializeResponse } from "@codex-protocol/InitializeResponse";
import type {
  SkillsListResponse,
  Thread,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadProjectionEventNotification,
  ThreadStatusChangedNotification,
  TurnStartResponse,
} from "@codex-protocol/v2";
import { ready } from "./persistenceHarness";

export const firstThreadId = attachBaseline.snapshot.thread.id;
export const secondThreadId = "00000000-0000-0000-0000-000000000002";
export const firstTitle = "First parallel task";
export const secondTitle = "Second parallel task";

type RpcRequest = {
  id: number;
  method: string;
  params?: { threadId?: string; subscriptionId?: string };
};

export async function createMultiSessionHarness(
  page: Page,
  initiallyActive = true,
  acknowledgeSends = true,
) {
  const requests: RpcRequest[] = [];
  const threads = new Map<string, Thread>(
    [firstThreadId, secondThreadId].map((id): [string, Thread] => {
      const attach = attachWithTurns(
        attachWithThreadId(attachBaseline, id),
        initiallyActive ? [inProgressTurn(`${id}-initial`)] : [],
      );
      return [
        id,
        {
          ...attach.snapshot.thread,
          name: id === firstThreadId ? firstTitle : secondTitle,
          status: initiallyActive ? { type: "active", activeFlags: [] } : { type: "idle" },
        },
      ];
    }),
  );
  let connection: WebSocketRoute | undefined;
  let commitSequence = 0;
  const subscriptions = new Map<string, string>();
  const heads = new Map<string, string | null>();
  const resumeErrors = new Map<string, string>();

  const thread = (id: string): Thread => {
    const value = threads.get(id);
    if (!value) throw new Error(`Unknown test thread ${id}`);
    return value;
  };
  const emit = (id: string, event: ThreadProjectionEventNotification) => {
    const subscriptionId = subscriptions.get(id);
    if (!connection || !subscriptionId) throw new Error(`Thread ${id} is not attached`);
    const owned = eventForThreadOwner(
      eventWithEnvelope(event, { parentCommitId: heads.get(id) ?? null }),
      { threadId: id, subscriptionId },
    );
    heads.set(id, owned.commitId);
    connection.send(
      JSON.stringify({ jsonrpc: "2.0", method: "thread/projection/event", params: owned }),
    );
  };
  const notifyStatus = (value: Thread) => {
    if (!connection) throw new Error("No connected test socket");
    connection.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "thread/status/changed",
        params: {
          threadId: value.id,
          status: value.status,
        } satisfies ThreadStatusChangedNotification,
      }),
    );
  };
  await page.routeWebSocket("/ws", (socket) => {
    connection = socket;
    subscriptions.clear();
    heads.clear();
    socket.onMessage((message) => {
      const request = JSON.parse(String(message)) as RpcRequest;
      requests.push(request);
      const reply = (result: unknown) => {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
      };
      const requestedThread = () => thread(request.params?.threadId ?? "");
      switch (request.method) {
        case "gui/authenticate":
          reply({ authenticated: true });
          return;
        case "initialize":
          reply({
            userAgent: "codex-gui-multi-session-e2e",
            codexHome: "/tmp/codex-home",
            platformFamily: "unix",
            platformOs: "macos",
          } satisfies InitializeResponse);
          return;
        case "initialized":
          return;
        case "thread/list":
          reply({
            data: [...threads.values()],
            nextCursor: null,
            backwardsCursor: null,
          } satisfies ThreadListResponse);
          return;
        case "thread/read":
          reply({ thread: requestedThread() } satisfies ThreadReadResponse);
          return;
        case "thread/resume": {
          const value = requestedThread();
          const error = resumeErrors.get(value.id);
          if (error != null) {
            socket.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id: request.id,
                error: { code: -32000, message: error },
              }),
            );
            return;
          }
          reply({
            thread: value,
            model: "test-model",
            modelProvider: value.modelProvider,
            serviceTier: null,
            cwd: value.cwd,
            instructionSources: [],
            approvalPolicy: "never",
            approvalsReviewer: "user",
            sandbox: { type: "dangerFullAccess" },
            reasoningEffort: null,
            turnsBackwardsCursor: null,
            itemsBackwardsCursor: null,
          } satisfies ThreadResumeResponse);
          return;
        }
        case "thread/projection/attach": {
          const value = requestedThread();
          const subscriptionId = `${value.id}-subscription-${String(requests.length)}`;
          subscriptions.set(value.id, subscriptionId);
          heads.set(value.id, null);
          const attach = attachWithTurns(attachWithThreadId(attachBaseline, value.id), value.turns);
          reply(attachWithSnapshotThread(attach, value, subscriptionId));
          return;
        }
        case "skills/list":
          reply({
            data: [{ cwd: attachBaseline.snapshot.thread.cwd, skills: [], errors: [] }],
          } satisfies SkillsListResponse);
          return;
        case "thread/projection/detach":
          reply({ status: "detached" });
          return;
        case "turn/interrupt":
          reply({});
          return;
        case "turn/start": {
          // Outstanding responses cross the genuine RPC uncertainty window on reload.
          if (!acknowledgeSends) return;
          const value = requestedThread();
          const turn = inProgressTurn(`${value.id}-sent-${String(requests.length)}`);
          value.turns.push(turn);
          value.status = { type: "active", activeFlags: [] };
          reply({ turn } satisfies TurnStartResponse);
          emit(value.id, turnStarted(eventTurnStarted, `commit-${String(++commitSequence)}`, turn));
          notifyStatus(value);
          return;
        }
        case "turn/steer":
          return;
        default:
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: { code: -32601, message: `unexpected method ${request.method}` },
            }),
          );
      }
    });
  });
  return {
    requests,
    setResumeError(id: string, error: string | null) {
      if (error == null) resumeErrors.delete(id);
      else resumeErrors.set(id, error);
    },
    resumes: (id: string) =>
      requests.filter(
        (request) => request.method === "thread/resume" && request.params?.threadId === id,
      ),
    sends: (id: string) =>
      requests.filter(
        (request) =>
          (request.method === "turn/start" || request.method === "turn/steer") &&
          request.params?.threadId === id,
      ),
    attachments: (id: string) =>
      requests.filter(
        (request) =>
          request.method === "thread/projection/attach" && request.params?.threadId === id,
      ),
    detaches: () => requests.filter((request) => request.method === "thread/projection/detach"),
    async open() {
      await page.goto(`/task/${firstThreadId}#token=multi-session-test-token`);
      await ready(page);
    },
    finish(id: string, output = `Completed ${id}`) {
      const value = thread(id);
      const activeIndex = value.turns.findIndex((turn) => turn.status === "inProgress");
      const active = value.turns[activeIndex];
      if (!active) throw new Error(`No active turn for ${id}`);
      const answer = agentMessage(`${active.id}-answer`, output);
      const completed = baseTurn(active.id, [answer]);
      value.turns[activeIndex] = completed;
      value.status = { type: "idle" };
      emit(
        id,
        itemStarted(eventItemStarted, `commit-${String(++commitSequence)}`, active.id, answer),
      );
      emit(
        id,
        itemCompleted(eventItemCompleted, `commit-${String(++commitSequence)}`, active.id, answer),
      );
      emit(id, turnCompleted(eventTurnCompleted, `commit-${String(++commitSequence)}`, completed));
      notifyStatus(value);
    },
  };
}

export const activeRow = (page: Page, id: string) =>
  page.locator(`[data-active-thread-id="${id}"]`);
export async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Active tasks", exact: true })).toBeVisible();
}
export async function selectTask(page: Page, id: string) {
  await openMenu(page);
  await activeRow(page, id)
    .getByRole("button", {
      name: id === firstThreadId ? firstTitle : secondTitle,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/task/${id}$`));
  await ready(page);
}
export async function openTaskActions(page: Page, id: string) {
  const title = id === firstThreadId ? firstTitle : secondTitle;
  await activeRow(page, id)
    .getByRole("button", { name: `More options for ${title}`, exact: true })
    .click();
  await expect(
    page.getByRole("menu", { name: `More options for ${title}`, exact: true }),
  ).toBeVisible();
}
export async function continueSecondTask(page: Page) {
  await openMenu(page);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("link", { name: secondTitle, exact: true }).click();
  await page.getByRole("button", { name: "Continue this task", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/task/${secondThreadId}$`));
  await ready(page);
}
