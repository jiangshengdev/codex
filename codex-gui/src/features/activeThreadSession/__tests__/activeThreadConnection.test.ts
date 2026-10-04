import { describe, expect, it, vi } from "vitest";
import type { GuiHostCommands } from "@/features/guiHost/guiHostCommandGateway";
import { createActiveThreadConnection } from "../activeThreadConnection";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import { createDeferred } from "@/__tests__/appBrowserTestSupport";

describe("active thread connection", () => {
  it("rejects new work after revocation without sending it to the old connection", async () => {
    const listLoadedThreads = vi.fn<GuiHostCommands["listLoadedThreads"]>();
    const connection = createActiveThreadConnection({ listLoadedThreads });

    connection.revoke();

    await expect(
      connection.run((commands) => commands.listLoadedThreads({})),
    ).rejects.toMatchObject({
      name: "GuiHostCommandError",
      source: "unavailable",
      delivery: "definitelyNotAccepted",
    });
    expect(listLoadedThreads).not.toHaveBeenCalled();
    expect(connection.capture()).toBeNull();
  });

  it("uses the replacement for new requests and marks captured old requests stale", async () => {
    const oldCommands = {
      listLoadedThreads: vi.fn<GuiHostCommands["listLoadedThreads"]>().mockResolvedValue({
        data: ["old-thread"],
        nextCursor: null,
      }),
    };
    const connection = createActiveThreadConnection(oldCommands);
    const oldRound = connection.capture();
    connection.revoke();
    connection.replace({
      listLoadedThreads: vi.fn<GuiHostCommands["listLoadedThreads"]>().mockResolvedValue({
        data: ["new-thread"],
        nextCursor: null,
      }),
    });

    expect(oldRound?.isCurrent()).toBe(false);
    expect(connection.capture()?.isCurrent()).toBe(true);
    await expect(connection.run((commands) => commands.listLoadedThreads({}))).resolves.toEqual({
      data: ["new-thread"],
      nextCursor: null,
    });
    expect(oldCommands.listLoadedThreads).not.toHaveBeenCalled();
  });

  it("preserves the original in-flight delivery result after replacement", async () => {
    const pending = createDeferred<Awaited<ReturnType<GuiHostCommands["interruptTurn"]>>>();
    const connection = createActiveThreadConnection<Pick<GuiHostCommands, "interruptTurn">>({
      interruptTurn: () => pending.promise,
    });
    const request = connection.run((commands) =>
      commands.interruptTurn({ threadId: "thread-1", turnId: "turn-1" }),
    );
    const unknown = new GuiHostCommandError({
      source: "unavailable",
      delivery: "deliveryUnknown",
      error: new Error("Connection closed after send"),
    });
    connection.revoke();
    connection.replace({ interruptTurn: () => Promise.resolve({}) });
    pending.reject(unknown);

    await expect(request).rejects.toBe(unknown);
  });
});
