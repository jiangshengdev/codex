import { describe, expect, it, vi } from "vitest";
import { consumeBrowserAuthorizationSession } from "../browserAuthorizationSession";

const firstThreadId = "11111111-2222-3333-4444-555555555555";
const secondThreadId = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";

class MemoryStorage {
  readonly values = new Map<string, string>();
  readonly operations: string[] = [];

  getItem(key: string): string | null {
    this.operations.push("get");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.operations.push("set");
    this.values.set(key, value);
  }

  onlyStoredRecord(): unknown {
    const records = Array.from(this.values.values());
    if (records.length !== 1) {
      throw new Error("Expected exactly one stored authorization session record");
    }
    return JSON.parse(records[0] ?? "null") as unknown;
  }
}

describe("consumeBrowserAuthorizationSession", () => {
  it("stores a decoded fragment token before clearing the fragment", () => {
    const storage = new MemoryStorage();
    const operations = storage.operations;
    const historyState = { key: "tanstack-entry" };
    const previousHistoryDescriptor = Object.getOwnPropertyDescriptor(globalThis, "history");
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: { state: historyState },
    });
    const replaceState = vi.fn<History["replaceState"]>(() => {
      operations.push("replace");
    });

    let session: ReturnType<typeof consumeBrowserAuthorizationSession>;
    try {
      session = consumeBrowserAuthorizationSession({
        location: new URL(
          `https://codex.test/task/${firstThreadId}#token=fresh+token%2Bvalue&extra=ignored`,
        ),
        replaceState,
        storage,
      });
    } finally {
      restoreGlobalProperty("history", previousHistoryDescriptor);
    }

    expect({
      operations,
      snapshot: session.getSnapshot(),
      stored: storage.onlyStoredRecord(),
      replacedWith: replaceState.mock.calls,
    }).toEqual({
      operations: ["set", "replace"],
      snapshot: { token: "fresh token+value", activeThreadId: null },
      stored: { token: "fresh token+value" },
      replacedWith: [[historyState, "", `/task/${firstThreadId}`]],
    });
  });

  it("restores a token and active thread in the same tab", () => {
    const storage = new MemoryStorage();
    const first = consumeBrowserAuthorizationSession({
      location: new URL(`https://codex.test/task/${firstThreadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });
    first.commitActiveThread(firstThreadId);

    const restored = consumeBrowserAuthorizationSession({
      location: new URL("https://codex.test/history"),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });

    expect({ snapshot: restored.getSnapshot(), stored: storage.onlyStoredRecord() }).toEqual({
      snapshot: { token: "secret", activeThreadId: firstThreadId },
      stored: { token: "secret", activeThreadId: firstThreadId },
    });
  });

  it("consumes an empty token fragment without replacing the stored session or recovery", () => {
    const storage = new MemoryStorage();
    const existing = consumeBrowserAuthorizationSession({
      location: new URL(`https://codex.test/task/${firstThreadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });
    existing.commitActiveThread(firstThreadId);
    storage.operations.length = 0;

    const historyState = { key: "tanstack-entry" };
    const previousHistoryDescriptor = Object.getOwnPropertyDescriptor(globalThis, "history");
    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: { state: historyState },
    });
    const replaceState = vi.fn<History["replaceState"]>(() => {
      storage.operations.push("replace");
    });

    let restored: ReturnType<typeof consumeBrowserAuthorizationSession>;
    try {
      restored = consumeBrowserAuthorizationSession({
        location: new URL(`https://codex.test/history/${secondThreadId}#token=&extra=ignored`),
        replaceState,
        storage,
      });
    } finally {
      restoreGlobalProperty("history", previousHistoryDescriptor);
    }

    expect({
      operations: storage.operations,
      snapshot: restored.getSnapshot(),
      stored: storage.onlyStoredRecord(),
      replacedWith: replaceState.mock.calls,
    }).toEqual({
      operations: ["get", "replace"],
      snapshot: { token: "secret", activeThreadId: firstThreadId },
      stored: { token: "secret", activeThreadId: firstThreadId },
      replacedWith: [[historyState, "", `/history/${secondThreadId}`]],
    });
  });

  it("fails closed for an empty token fragment without a stored session", () => {
    const replaceState = vi.fn<History["replaceState"]>();

    expect(() =>
      consumeBrowserAuthorizationSession({
        location: new URL("https://codex.test/history#token="),
        replaceState,
        storage: new MemoryStorage(),
      }),
    ).toThrow(new Error("Missing launch token fragment"));
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("replaces an existing session and clears recovery for a new fragment launch", () => {
    const storage = new MemoryStorage();
    const existing = consumeBrowserAuthorizationSession({
      location: new URL(`https://codex.test/task/${firstThreadId}#token=old`),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });
    existing.commitActiveThread(firstThreadId);

    const replacement = consumeBrowserAuthorizationSession({
      location: new URL(`https://codex.test/history/${secondThreadId}#token=new`),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });

    expect({ snapshot: replacement.getSnapshot(), stored: storage.onlyStoredRecord() }).toEqual({
      snapshot: { token: "new", activeThreadId: null },
      stored: { token: "new" },
    });
  });

  it("commits and clears active recovery only through explicit APIs", () => {
    const storage = new MemoryStorage();
    const session = consumeBrowserAuthorizationSession({
      location: new URL(`https://codex.test/task/${firstThreadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });

    session.commitActiveThread(secondThreadId);
    const committed = { snapshot: session.getSnapshot(), stored: storage.onlyStoredRecord() };
    session.clearActiveThread();

    expect({
      committed,
      cleared: session.getSnapshot(),
      stored: storage.onlyStoredRecord(),
    }).toEqual({
      committed: {
        snapshot: { token: "secret", activeThreadId: secondThreadId },
        stored: { token: "secret", activeThreadId: secondThreadId },
      },
      cleared: { token: "secret", activeThreadId: null },
      stored: { token: "secret" },
    });
  });

  it.each([
    [null, "Missing launch token fragment"],
    ["not-json", "Stored browser authorization session is malformed"],
    [JSON.stringify({ token: "" }), "Stored browser authorization session is malformed"],
    [
      JSON.stringify({ token: "secret", activeThreadId: "" }),
      "Stored browser authorization session is malformed",
    ],
    [
      JSON.stringify({ token: "secret", activeThreadId: null }),
      "Stored browser authorization session is malformed",
    ],
    [
      JSON.stringify({ token: "secret", activeThreadId: "not-a-uuid" }),
      "Stored browser authorization session is malformed",
    ],
    [
      JSON.stringify({ token: "secret", extra: true }),
      "Stored browser authorization session is malformed",
    ],
  ])("fails closed for invalid stored record %s", (stored, message) => {
    const storage = {
      getItem: vi.fn<() => string | null>(() => stored),
      setItem: vi.fn<(key: string, value: string) => void>(),
    };

    expect(() =>
      consumeBrowserAuthorizationSession({
        location: new URL("https://codex.test/history"),
        replaceState: vi.fn<History["replaceState"]>(),
        storage,
      }),
    ).toThrow(new Error(message));
  });

  it("fails closed without clearing the fragment when storage cannot be written", () => {
    const replaceState = vi.fn<History["replaceState"]>();

    expect(() =>
      consumeBrowserAuthorizationSession({
        location: new URL(`https://codex.test/history/${firstThreadId}#token=secret`),
        replaceState,
        storage: {
          getItem: () => null,
          setItem: () => {
            throw new Error("write failed");
          },
        },
      }),
    ).toThrow(new Error("Unable to write browser authorization session"));
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("fails closed when storage cannot be read or accessed", () => {
    expect(() =>
      consumeBrowserAuthorizationSession({
        location: new URL("https://codex.test/history"),
        replaceState: vi.fn<History["replaceState"]>(),
        storage: {
          getItem: () => {
            throw new Error("read failed");
          },
          setItem: () => undefined,
        },
      }),
    ).toThrow(new Error("Unable to read browser authorization session"));

    const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("unavailable");
      },
    });
    try {
      expect(() =>
        consumeBrowserAuthorizationSession({
          location: new URL("https://codex.test/history"),
          replaceState: vi.fn<History["replaceState"]>(),
        }),
      ).toThrow(new Error("Browser authorization session storage is unavailable"));
    } finally {
      if (previousDescriptor == null) {
        Reflect.deleteProperty(globalThis, "sessionStorage");
      } else {
        Object.defineProperty(globalThis, "sessionStorage", previousDescriptor);
      }
    }
  });

  it("keeps the committed snapshot unchanged when a later storage write fails", () => {
    let failWrites = false;
    const storage = new MemoryStorage();
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (failWrites) {
        throw new Error("write failed");
      }
      setItem(key, value);
    };
    const session = consumeBrowserAuthorizationSession({
      location: new URL(`https://codex.test/task/${firstThreadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });
    failWrites = true;

    expect(() => {
      session.commitActiveThread(secondThreadId);
    }).toThrow(new Error("Unable to write browser authorization session"));
    expect(session.getSnapshot()).toEqual({ token: "secret", activeThreadId: null });
  });

  it("rejects an invalid active thread ID without touching storage", () => {
    const storage = new MemoryStorage();
    const session = consumeBrowserAuthorizationSession({
      location: new URL(`https://codex.test/task/${firstThreadId}#token=secret`),
      replaceState: vi.fn<History["replaceState"]>(),
      storage,
    });
    storage.operations.length = 0;

    expect(() => {
      session.commitActiveThread("not-a-uuid");
    }).toThrow(new Error("Active thread ID must be a UUID"));
    expect({ operations: storage.operations, snapshot: session.getSnapshot() }).toEqual({
      operations: [],
      snapshot: { token: "secret", activeThreadId: null },
    });
  });
});

function restoreGlobalProperty(key: "history", descriptor: PropertyDescriptor | undefined): void {
  if (descriptor == null) {
    Reflect.deleteProperty(globalThis, key);
  } else {
    Object.defineProperty(globalThis, key, descriptor);
  }
}
