import { describe, expect, it, vi } from "vitest";
import {
  BrowserPersistenceError,
  BrowserPersistenceStore,
  type BrowserPersistenceCodec,
} from "../browserPersistenceStore";

type TestValue = { draft: string; queue: string[] };

const codec: BrowserPersistenceCodec<TestValue> = {
  encode: (value) => value,
  decode: (value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("Invalid test value");
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.draft !== "string" ||
      !Array.isArray(record.queue) ||
      !record.queue.every((item: unknown) => typeof item === "string")
    ) {
      throw new Error("Invalid test value");
    }
    return { draft: record.draft, queue: record.queue };
  },
};

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem = vi.fn<(key: string) => string | null>((key) => this.values.get(key) ?? null);
  setItem = vi.fn<(key: string, value: string) => void>((key, value) => {
    this.values.set(key, value);
  });
}

function createStore(
  storage: MemoryStorage,
  overrides: { authorizationContext?: string; threadId?: string } = {},
) {
  return new BrowserPersistenceStore({
    storage,
    codec,
    authorizationContext: "context-one",
    threadId: "thread-one",
    ...overrides,
  });
}

function replaceStoredRecord(storage: MemoryStorage, value: string): void {
  const key = storage.values.keys().next().value;
  if (key === undefined) {
    throw new Error("Expected a stored record");
  }
  storage.values.set(key, value);
}

describe("BrowserPersistenceStore", () => {
  it("restores a complete draft and queue transition from one write", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    expect(store.read()).toBeNull();
    const initial = store.commit({ draft: "next message", queue: [] }, null);
    storage.setItem.mockClear();

    const committed = store.commit({ draft: "", queue: ["next message"] }, initial.revision);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(committed).toEqual({ revision: 2, value: { draft: "", queue: ["next message"] } });
    expect(createStore(storage).read()).toEqual(committed);
  });

  it("keeps the stored record and revision when a write fails, then allows retry", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    const previous = store.commit({ draft: "keep input", queue: [] }, null);
    const raw = [...storage.values];
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("quota exceeded");
    });

    expect(() => store.commit({ draft: "", queue: ["keep input"] }, previous.revision)).toThrow(
      new BrowserPersistenceError("write"),
    );
    expect([...storage.values]).toEqual(raw);
    expect(store.read()).toEqual(previous);
    expect(store.commit({ draft: "", queue: ["keep input"] }, previous.revision).revision).toBe(2);
  });

  it("rejects a stale approval revision without writing", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.commit({ draft: "first", queue: [] }, null);
    store.commit({ draft: "changed", queue: [] }, 1);
    storage.setItem.mockClear();

    expect(() => store.commit({ draft: "stale", queue: [] }, 1)).toThrow(
      new BrowserPersistenceError("revisionConflict"),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.read()?.value.draft).toBe("changed");
  });

  it("isolates threads and never restores another authorization context", () => {
    const storage = new MemoryStorage();
    createStore(storage).commit({ draft: "old context", queue: ["old message"] }, null);
    const secondThread = createStore(storage, { threadId: "thread-two" });
    expect(secondThread.read()).toBeNull();
    secondThread.commit({ draft: "second thread", queue: [] }, null);
    expect(createStore(storage).read()?.value.draft).toBe("old context");

    const newContext = createStore(storage, { authorizationContext: "context-two" });
    expect(newContext.read()).toBeNull();
    newContext.commit({ draft: "new context", queue: [] }, null);
    expect(newContext.read()?.value.draft).toBe("new context");
    expect(createStore(storage).read()).toBeNull();
  });

  it.each([
    ["invalid JSON", "malformed"],
    [JSON.stringify({ version: 2 }), "unsupportedVersion"],
    [JSON.stringify({ version: 1 }), "malformed"],
    [
      JSON.stringify({
        version: 1,
        authorizationContext: "context-one",
        threadId: "thread-one",
        revision: 1,
        payload: { draft: false },
      }),
      "payload",
    ],
  ] as const)("preserves unreadable record %s during read and commit", (raw, code) => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.commit({ draft: "", queue: [] }, null);
    replaceStoredRecord(storage, raw);
    storage.setItem.mockClear();

    expect(() => store.read()).toThrow(new BrowserPersistenceError(code));
    expect(() => store.commit({ draft: "replacement", queue: [] }, null)).toThrow(
      new BrowserPersistenceError(code),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect([...storage.values.values()]).toEqual([raw]);
  });

  it("does not erase damaged data when authorization changes", () => {
    const storage = new MemoryStorage();
    createStore(storage).commit({ draft: "", queue: [] }, null);
    replaceStoredRecord(
      storage,
      JSON.stringify({
        version: 1,
        authorizationContext: "context-one",
        threadId: "thread-one",
        revision: 1,
        payload: null,
      }),
    );
    storage.setItem.mockClear();
    expect(() =>
      createStore(storage, { authorizationContext: "context-two" }).commit(
        { draft: "", queue: [] },
        null,
      ),
    ).toThrow(new BrowserPersistenceError("payload"));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("validates the serialized payload before replacing a recoverable record", () => {
    const storage = new MemoryStorage();
    createStore(storage).commit({ draft: "original", queue: [] }, null);
    const raw = [...storage.values];
    const store = new BrowserPersistenceStore({
      storage,
      authorizationContext: "context-one",
      threadId: "thread-one",
      codec: { ...codec, encode: () => ({ draft: "bad", queue: [undefined] }) },
    });

    expect(() => store.commit({ draft: "candidate", queue: [] }, 1)).toThrow(
      new BrowserPersistenceError("payload"),
    );
    expect([...storage.values]).toEqual(raw);
  });

  it("propagates serialization failure without touching the stored value", () => {
    const storage = new MemoryStorage();
    createStore(storage).commit({ draft: "original", queue: [] }, null);
    const raw = [...storage.values];
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const store = new BrowserPersistenceStore({
      storage,
      authorizationContext: "context-one",
      threadId: "thread-one",
      codec: { ...codec, encode: () => circular },
    });

    expect(() => store.commit({ draft: "candidate", queue: [] }, 1)).toThrow(
      new BrowserPersistenceError("serialize"),
    );
    expect([...storage.values]).toEqual(raw);
  });

  it("propagates blocked reads without attempting to write", () => {
    const storage = new MemoryStorage();
    storage.getItem.mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = createStore(storage);
    expect(() => store.read()).toThrow(new BrowserPersistenceError("read"));
    expect(() => store.commit({ draft: "", queue: [] }, null)).toThrow(
      new BrowserPersistenceError("read"),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reports an unavailable browser sessionStorage getter", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked");
      },
    });
    try {
      expect(
        () =>
          new BrowserPersistenceStore({
            authorizationContext: "context-one",
            threadId: "one",
            codec,
          }),
      ).toThrow(new BrowserPersistenceError("unavailable"));
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, "sessionStorage");
      } else {
        Object.defineProperty(globalThis, "sessionStorage", descriptor);
      }
    }
  });
});
