import { describe, expect, it, vi } from "vitest";
import {
  clearLaunchTokenFragment,
  readLaunchParams,
  startGuiHostConnection,
} from "../guiHostClient";
import {
  MemoryStorage,
  RecordingWebSocket,
  ThrowingSetItemStorage,
  readRpcMethod,
} from "./guiHostClientTestSupport";

describe("guiHostClient launch params", () => {
  it("stores app-server launch URL fragment token and restores it after refresh", () => {
    const storage = new MemoryStorage();
    const replaceState = vi.fn<History["replaceState"]>();

    expect(
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"), storage),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
    expect(
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc"), storage),
    ).toEqual({ threadId: "thread-abc", token: "secret" });

    clearLaunchTokenFragment(
      new URL("http://127.0.0.1:4567/app?threadId=thread-abc#token=secret"),
      replaceState,
    );

    expect(replaceState).toHaveBeenCalledTimes(1);
    const [, , replacedUrl] = replaceState.mock.calls[0] as [unknown, unknown, string];
    expect(replacedUrl).not.toContain("#token=");
    expect(replacedUrl).toContain("/app");
    expect(replacedUrl).toContain("threadId=thread-abc");
  });

  it("throws when launch URL is missing required launch params", () => {
    expect(() =>
      readLaunchParams(new URL("http://127.0.0.1:4567/#token=secret"), new MemoryStorage()),
    ).toThrow("Missing threadId query parameter");
    expect(() =>
      readLaunchParams(new URL("http://127.0.0.1:4567/?threadId=thread-abc"), new MemoryStorage()),
    ).toThrow("Missing launch token fragment");
  });

  it("clears the fragment and authenticates when launch token storage fails", () => {
    const socket = new RecordingWebSocket();
    const replaceState = vi.fn<History["replaceState"]>();

    startGuiHostConnection({
      location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
      replaceState,
      tokenStorage: new ThrowingSetItemStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
    });

    expect(replaceState).toHaveBeenCalledTimes(1);
    const [, , replacedUrl] = replaceState.mock.calls[0] as [unknown, unknown, string];
    expect(replacedUrl).not.toContain("#token=");

    socket.onopen?.();

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
  });
});
