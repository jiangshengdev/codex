import { expect, type Page, type WebSocketRoute } from "@playwright/test";
import {
  attachBaseline,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { InitializeResponse } from "@codex-protocol/InitializeResponse";
import type { SkillsListResponse } from "@codex-protocol/v2";

export const persistenceThreadId = attachBaseline.snapshot.thread.id;
const subscriptionId = "persistence-e2e-subscription";
const activeTurnId = "turn-in-progress";

type RpcRequest = { id: number; method: string; params?: unknown };

export async function createPersistenceHarness(page: Page, initiallyActive = false) {
  const requests: RpcRequest[] = [];
  let active = initiallyActive;
  let connection: WebSocketRoute | undefined;
  let headCommitId: string | null = null;

  await page.routeWebSocket("/ws", (socket) => {
    connection = socket;
    headCommitId = null;
    socket.onMessage((message) => {
      const request = JSON.parse(String(message)) as RpcRequest;
      requests.push(request);
      const reply = (result: unknown) => {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
      };
      switch (request.method) {
        case "gui/authenticate":
          reply({ authenticated: true });
          return;
        case "initialize":
          reply({
            userAgent: "codex-gui-persistence-e2e",
            codexHome: "/tmp/codex-home",
            platformFamily: "unix",
            platformOs: "macos",
          } satisfies InitializeResponse);
          return;
        case "thread/projection/attach":
          // Every attachment returns the host's current state, including after reload.
          // Replaying an old turnStarted event after an empty snapshot is not that state.
          headCommitId = attachBaseline.snapshot.headCommitId;
          reply({
            ...attachWithTurns(attachBaseline, active ? [inProgressTurn(activeTurnId)] : []),
            subscriptionId,
          });
          return;
        case "skills/list":
          reply({
            data: [{ cwd: attachBaseline.snapshot.thread.cwd, skills: [], errors: [] }],
          } satisfies SkillsListResponse);
          return;
        case "initialized":
          return;
        case "thread/projection/detach":
        case "turn/interrupt":
          reply({});
          return;
        case "turn/start":
        case "turn/steer":
          // Leave the response outstanding so a reload crosses the real RPC
          // uncertainty window instead of manufacturing a persisted state.
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
    sends: () =>
      requests.filter(({ method }) => method === "turn/start" || method === "turn/steer"),
    async open() {
      await page.goto(`/task/${persistenceThreadId}#token=e2e-secret-token`);
      await ready(page);
    },
    finishActiveTurn() {
      if (!connection) throw new Error("Expected an attached WebSocket");
      active = false;
      const event = eventWithEnvelope(eventTurnCompleted, {
        subscriptionId,
        parentCommitId: headCommitId,
      });
      if (event.event.type !== "turnCompleted") throw new Error("Expected turnCompleted fixture");
      headCommitId = event.commitId;
      connection.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "thread/projection/event",
          params: {
            ...event,
            event: {
              ...event.event,
              notification: { ...event.event.notification, turn: baseTurn(activeTurnId) },
            },
          },
        }),
      );
    },
  };
}

export const composer = (page: Page) =>
  page.getByRole("combobox", { name: "Message Codex", exact: true });

export async function ready(page: Page) {
  await expect(page.locator("main")).toHaveAttribute("data-gui-host-status", "initialized");
  await expect(composer(page)).toBeVisible();
}

export async function submit(page: Page, text: string, action = "Send") {
  await composer(page).fill(text);
  await expect(page.getByRole("button", { name: action, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: action, exact: true }).click();
  await expect(composer(page)).toHaveText("");
}

export async function settledRender(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        ),
      ),
  );
}
