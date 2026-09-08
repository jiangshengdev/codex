import { describe, expect, it, vi } from "vitest";
import { createGuiHostCommands, launchThreadId } from "@/__tests__/appBrowserTestSupport";
import { makeStore } from "@/app/store";
import type { createActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { type ActiveThreadSessionController } from "@/features/activeThreadSession/activeThreadSession";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import { type StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import {
  startGuiHostConnectionLifecycle,
  type GuiHostConnectionLifecycleEnvironment,
  type GuiHostConnectionLifecycleInput,
} from "../guiHostConnectionLifecycle";

function setup() {
  const events: string[] = [];
  const tasks: VoidFunction[] = [];
  const subscriptions = new Set<
    Parameters<GuiHostConnectionLifecycleEnvironment["subscribePageTransitions"]>[0]
  >();
  const environment: GuiHostConnectionLifecycleEnvironment = {
    readLocation: () => new URL("http://localhost/history"),
    replaceState: vi.fn<History["replaceState"]>(),
    subscribePageTransitions: (handlers) => {
      subscriptions.add(handlers);
      return () => {
        events.push("unsubscribe");
        subscriptions.delete(handlers);
      };
    },
    scheduler: {
      requestFrame: vi.fn<GuiHostConnectionLifecycleEnvironment["scheduler"]["requestFrame"]>(),
      cancelFrame: vi.fn<GuiHostConnectionLifecycleEnvironment["scheduler"]["cancelFrame"]>(),
    },
    queueMicrotask: (task) => tasks.push(task),
  };
  const authorization = new BrowserAuthorizationSession(
    { getItem: () => null, setItem: vi.fn<Storage["setItem"]>() },
    { token: "test-token", activeThreadId: null },
    "test-context",
  );
  const controllers: ActiveThreadSessionController[] = [];
  const connections: StartGuiHostConnectionOptions[] = [];
  const dependencies = {
    consumeAuthorization: vi.fn<typeof consumeBrowserAuthorizationSession>(() => authorization),
    startConnection: vi.fn<typeof startGuiHostConnection>((options) => {
      events.push("connect");
      connections.push(options);
      return () => {
        events.push("host-cleanup");
        options.onCommandsUnavailable?.();
      };
    }),
    createSession: vi.fn<typeof createActiveThreadSession>(() => {
      events.push("create-session");
      const controller: ActiveThreadSessionController = {
        session: createActiveThreadSessionHarness().session,
        activateRecoveryThread: vi.fn<ActiveThreadSessionController["activateRecoveryThread"]>(
          () => {
            events.push("recover");
            return Promise.resolve({ type: "empty" });
          },
        ),
        handleProjectionEvent: vi.fn<ActiveThreadSessionController["handleProjectionEvent"]>(),
        handleProjectionDelta: vi.fn<ActiveThreadSessionController["handleProjectionDelta"]>(),
        handleProjectionClosed: vi.fn<ActiveThreadSessionController["handleProjectionClosed"]>(),
        handleSkillsChanged: vi.fn<ActiveThreadSessionController["handleSkillsChanged"]>(),
        handleThreadStatusChanged:
          vi.fn<ActiveThreadSessionController["handleThreadStatusChanged"]>(),
        connectionUnavailable: vi.fn<ActiveThreadSessionController["connectionUnavailable"]>(() => {
          events.push("unavailable");
        }),
        suspendRestoredQueue: vi.fn<ActiveThreadSessionController["suspendRestoredQueue"]>(() => {
          events.push("suspend");
        }),
        dispose: vi.fn<ActiveThreadSessionController["dispose"]>(() => {
          events.push("dispose");
        }),
      };
      controllers.push(controller);
      return controller;
    }),
  };
  const owner = new NewSessionOwner();
  const bind = vi.spyOn(owner, "setConnection");
  bind.mockImplementation((connection) => events.push(connection ? "bind" : "unbind"));
  const input: GuiHostConnectionLifecycleInput = {
    dispatch: makeStore().dispatch,
    startupTarget: { type: "currentTask", threadId: launchThreadId },
    newSessionOwner: owner,
    setStatus: vi.fn<GuiHostConnectionLifecycleInput["setStatus"]>((status) => {
      events.push(status.label);
    }),
    setCommands: vi.fn<GuiHostConnectionLifecycleInput["setCommands"]>((commands) => {
      events.push(commands ? "commands" : "clear-commands");
    }),
    setAuthorizationToken: vi.fn<GuiHostConnectionLifecycleInput["setAuthorizationToken"]>(),
    setActiveThreadSession: vi.fn<GuiHostConnectionLifecycleInput["setActiveThreadSession"]>(
      (session) => {
        events.push(session ? "session" : "clear-session");
      },
    ),
  };
  const show = (persisted: boolean) => {
    // A handler replaces its subscription; dispatch only to listeners present at entry.
    const listeners = [...subscriptions];
    for (const handlers of listeners) handlers.onShow({ persisted });
  };
  const hide = () => {
    for (const handlers of subscriptions) handlers.onHide();
  };
  const flush = () => {
    for (const task of tasks.splice(0)) task();
  };
  const ready = () => {
    const connection = connections.at(-1);
    if (!connection) throw new Error("No connection to initialize");
    const commands = createGuiHostCommands();
    connection.onCommandsReady?.(commands);
    const controller = controllers.at(-1);
    if (!controller) throw new Error("No session created");
    return { connection, controller, commands };
  };
  return {
    events,
    tasks,
    subscriptions,
    environment,
    authorization,
    dependencies,
    input,
    bind,
    connections,
    controllers,
    show,
    hide,
    flush,
    ready,
    start: () => startGuiHostConnectionLifecycle(input, environment, dependencies),
  };
}

describe("page connection lifecycle", () => {
  it("publishes ready capabilities and starts recovery in order", () => {
    const h = setup();
    const release = h.start();
    const { controller, commands } = h.ready();
    expect(h.events).toEqual([
      "connect",
      "commands",
      "create-session",
      "bind",
      "session",
      "recover",
    ]);
    expect(controller.activateRecoveryThread).toHaveBeenCalledExactlyOnceWith(launchThreadId);
    expect(h.input.setAuthorizationToken).toHaveBeenCalledExactlyOnceWith("test-token");
    expect(h.dependencies.createSession).toHaveBeenCalledWith({
      authorizationSession: h.authorization,
      commands,
      dispatch: h.input.dispatch,
      scheduler: h.environment.scheduler,
      persistence: { authorizationContext: "test-context" },
    });
    release();
  });

  it("suspends before replacement, consumes authorization again and ignores old callbacks", () => {
    const h = setup();
    const release = h.start();
    const old = h.ready();
    h.hide();
    h.show(false);
    expect(old.controller.suspendRestoredQueue).toHaveBeenCalledOnce();
    expect(h.connections).toHaveLength(1);
    h.events.length = 0;
    h.show(true);
    expect(h.events).toEqual([
      "suspend",
      "unbind",
      "unsubscribe",
      "dispose",
      "clear-commands",
      "clear-session",
      "host-cleanup",
      "connect",
    ]);
    const current = h.ready();
    expect(h.dependencies.consumeAuthorization).toHaveBeenCalledTimes(2);
    expect(h.subscriptions.size).toBe(1);
    h.events.length = 0;
    old.connection.onCommandsReady?.(createGuiHostCommands());
    old.connection.onCommandsUnavailable?.();
    old.connection.onStatus?.({ label: "closed" });
    old.connection.onThreadStatusChanged?.({ threadId: launchThreadId, status: { type: "idle" } });
    expect(h.events).toEqual([]);
    expect(old.controller.handleThreadStatusChanged).not.toHaveBeenCalled();
    expect(current.controller.handleThreadStatusChanged).not.toHaveBeenCalled();
    release();
    expect(h.subscriptions.size).toBe(0);
    expect(current.controller.dispose).toHaveBeenCalledOnce();
    h.events.length = 0;
    current.connection.onStatus?.({ label: "closed" });
    h.show(true);
    expect(h.events).toEqual([]);
  });

  it("keeps the disposed session reference on unavailable without reconnecting", () => {
    const h = setup();
    const release = h.start();
    const { connection, controller } = h.ready();
    h.events.length = 0;
    connection.onCommandsUnavailable?.();
    expect(h.events).toEqual(["unbind", "unavailable", "clear-commands"]);
    expect(h.input.setActiveThreadSession).toHaveBeenCalledExactlyOnceWith(controller.session);
    expect(h.connections).toHaveLength(1);
    release();
    expect(h.input.setActiveThreadSession).toHaveBeenLastCalledWith(null);
  });

  it.each([false, true])("defers authorization failure and cancels it on release=%s", (unmount) => {
    const h = setup();
    h.dependencies.consumeAuthorization.mockImplementation(() => {
      throw new Error("authorization");
    });
    const release = h.start();
    expect(h.input.setStatus).not.toHaveBeenCalled();
    expect(h.dependencies.startConnection).not.toHaveBeenCalled();
    expect(h.subscriptions.size).toBe(0);
    if (unmount) release();
    h.flush();
    expect(vi.mocked(h.input.setStatus).mock.calls).toEqual(
      unmount ? [] : [[{ label: "error", message: "authorization" }]],
    );
    if (!unmount) release();
  });

  it.each([false, true])(
    "defers startup failure until unavailable and cancels on release=%s",
    (unmount) => {
      const h = setup();
      h.dependencies.startConnection.mockImplementation(() => {
        throw new Error("socket");
      });
      const release = h.start();
      expect(h.events).toEqual([]);
      if (unmount) release();
      h.events.length = 0;
      h.flush();
      expect(h.events).toEqual(unmount ? [] : ["unbind", "clear-commands", "error"]);
      if (!unmount) release();
    },
  );

  it("does not let a replaced round's pending error unbind the current connection", () => {
    const h = setup();
    h.dependencies.startConnection.mockImplementationOnce(() => {
      throw new Error("old socket");
    });
    const release = h.start();
    h.show(true);
    h.ready();
    h.events.length = 0;
    h.flush();
    expect(h.events).toEqual([]);
    release();
  });

  it("forwards current notifications and preserves the Host's error ordering", () => {
    const h = setup();
    const release = h.start();
    const { connection, controller } = h.ready();
    const notification: Parameters<ActiveThreadSessionController["handleThreadStatusChanged"]>[0] =
      {
        threadId: launchThreadId,
        status: { type: "idle" },
      };
    connection.onThreadStatusChanged?.(notification);
    expect(controller.handleThreadStatusChanged).toHaveBeenCalledExactlyOnceWith(notification);
    h.events.length = 0;
    connection.onStatus?.({ label: "error", message: "protocol" });
    connection.onCommandsUnavailable?.();
    expect(h.events).toEqual(["error", "unbind", "unavailable", "clear-commands"]);
    h.events.length = 0;
    connection.onCommandsUnavailable?.();
    connection.onStatus?.({ label: "closed" });
    expect(h.events).toEqual(["unbind", "unavailable", "clear-commands", "closed"]);
    release();
  });

  it("preserves cleanup errors instead of swallowing them or starting another round", () => {
    const h = setup();
    h.start();
    const { controller } = h.ready();
    vi.mocked(controller.dispose).mockImplementation(() => {
      throw new Error("cleanup");
    });
    expect(() => {
      h.show(true);
    }).toThrow("cleanup");
    expect(h.connections).toHaveLength(1);
    expect(h.subscriptions.size).toBe(0);
    expect(h.events).not.toContain("host-cleanup");
  });
});
