import { describe, expect, it, vi } from "vitest";
import { consumeBrowserLaunchParams } from "../browserLaunchParams";

const launchTokenStorageKey = "codex-gui.launchToken";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingSetItemStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("sessionStorage unavailable");
  }
}

class ThrowingGetItemStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error("sessionStorage read failed");
  }
}

function installSessionStorageGetter(getter: () => Storage): () => void {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: getter,
  });

  return () => {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "sessionStorage", previousDescriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, "sessionStorage");
  };
}

describe("consumeBrowserLaunchParams", () => {
  it("stores a fragment token and restores it after refresh", () => {
    const storage = new MemoryStorage();
    const firstReplaceState = vi.fn<History["replaceState"]>();

    expect(
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/app?threadId=thread-abc#token=secret"),
        replaceState: firstReplaceState,
        tokenStorage: storage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
    expect(firstReplaceState).toHaveBeenCalledWith(null, "", "/app?threadId=thread-abc");

    expect(
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/app?threadId=thread-abc"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: storage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
  });

  it("prefers a non-empty fragment token over an existing stored token", () => {
    const storage = new MemoryStorage();
    storage.setItem(launchTokenStorageKey, "stale");

    expect(
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=fresh"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: storage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "fresh" });
    expect(storage.getItem(launchTokenStorageKey)).toBe("fresh");
  });

  it("treats an empty token fragment as absent without overwriting storage", () => {
    const tokenStorage = {
      getItem: vi.fn(() => "stored"),
      setItem: vi.fn(),
    };

    expect(
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token="),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "stored" });
    expect(tokenStorage.getItem).toHaveBeenCalledWith(launchTokenStorageKey);
    expect(tokenStorage.setItem).not.toHaveBeenCalled();
  });

  it("throws the existing threadId error for missing and empty values", () => {
    for (const url of [
      "http://127.0.0.1:4567/#token=secret",
      "http://127.0.0.1:4567/?threadId=#token=secret",
    ]) {
      expect(() =>
        consumeBrowserLaunchParams({
          location: new URL(url),
          replaceState: vi.fn<History["replaceState"]>(),
          tokenStorage: new MemoryStorage(),
        }),
      ).toThrowError(new Error("Missing threadId query parameter"));
    }
  });

  it("throws the existing token error when fragment and storage are empty", () => {
    for (const url of [
      "http://127.0.0.1:4567/?threadId=thread-abc",
      "http://127.0.0.1:4567/?threadId=thread-abc#token=",
    ]) {
      expect(() =>
        consumeBrowserLaunchParams({
          location: new URL(url),
          replaceState: vi.fn<History["replaceState"]>(),
          tokenStorage: new MemoryStorage(),
        }),
      ).toThrowError(new Error("Missing launch token fragment"));
    }
  });

  it("clears the whole fragment while preserving pathname and query", () => {
    const replaceState = vi.fn<History["replaceState"]>();

    consumeBrowserLaunchParams({
      location: new URL(
        "http://127.0.0.1:4567/nested/path?threadId=thread-abc&mode=compact#token=secret&extra=value",
      ),
      replaceState,
      tokenStorage: new MemoryStorage(),
    });

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/nested/path?threadId=thread-abc&mode=compact",
    );
  });

  it("clears the fragment before later validation failure", () => {
    const replaceState = vi.fn<History["replaceState"]>();

    expect(() =>
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/app#token=secret"),
        replaceState,
        tokenStorage: new MemoryStorage(),
      }),
    ).toThrowError(new Error("Missing threadId query parameter"));
    expect(replaceState).toHaveBeenCalledWith(null, "", "/app");
  });

  it("ignores storage write failures but propagates storage read failures", () => {
    expect(
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: new ThrowingSetItemStorage(),
      }),
    ).toEqual({ threadId: "thread-abc", token: "secret" });

    expect(() =>
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/?threadId=thread-abc"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: new ThrowingGetItemStorage(),
      }),
    ).toThrowError(new Error("sessionStorage read failed"));
  });

  it("falls back to no storage when default sessionStorage access throws", () => {
    const restoreSessionStorage = installSessionStorageGetter(() => {
      throw new Error("sessionStorage unavailable");
    });

    try {
      expect(
        consumeBrowserLaunchParams({
          location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token=secret"),
          replaceState: vi.fn<History["replaceState"]>(),
        }),
      ).toEqual({ threadId: "thread-abc", token: "secret" });
    } finally {
      restoreSessionStorage();
    }
  });
});
