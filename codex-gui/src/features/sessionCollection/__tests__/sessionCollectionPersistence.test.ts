import { describe, expect, it, vi } from "vitest";
import {
  SessionCollectionPersistenceError,
  SessionCollectionPersistenceStore,
} from "../sessionCollectionPersistence";

const firstThreadId = "11111111-1111-4111-8111-111111111111";
const secondThreadId = "22222222-2222-4222-8222-222222222222";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem = vi.fn<(key: string) => string | null>((key) => this.values.get(key) ?? null);
  setItem = vi.fn<(key: string, value: string) => void>((key, value) => {
    this.values.set(key, value);
  });
}

function createStore(storage: MemoryStorage, authorizationContext = "context-one") {
  return new SessionCollectionPersistenceStore({ storage, authorizationContext });
}

function replaceRecord(storage: MemoryStorage, raw: string): void {
  const key = storage.values.keys().next().value;
  if (key === undefined) {
    throw new Error("Expected a stored membership record");
  }
  storage.values.set(key, raw);
}

describe("SessionCollectionPersistenceStore", () => {
  it("distinguishes missing membership from a saved empty collection", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    expect(store.read()).toEqual({ type: "absent" });
    store.commit([]);
    expect(createStore(storage).read()).toEqual({ type: "restored", threadIds: [] });
  });

  it("restores stable deduplicated order without saving viewing or business state", () => {
    const storage = new MemoryStorage();
    createStore(storage).commit([secondThreadId, firstThreadId, secondThreadId]);

    expect(createStore(storage).read()).toEqual({
      type: "restored",
      threadIds: [secondThreadId, firstThreadId],
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect([...storage.values.values()].map((raw): unknown => JSON.parse(raw))).toEqual([
      {
        version: 1,
        authorizationContext: "context-one",
        threadIds: [secondThreadId, firstThreadId],
      },
    ]);
  });

  it("deduplicates restored IDs in their first occurrence order", () => {
    const storage = new MemoryStorage();
    createStore(storage).commit([]);
    replaceRecord(
      storage,
      JSON.stringify({
        version: 1,
        authorizationContext: "context-one",
        threadIds: [secondThreadId, firstThreadId, secondThreadId],
      }),
    );
    expect(createStore(storage).read()).toEqual({
      type: "restored",
      threadIds: [secondThreadId, firstThreadId],
    });
  });

  it("does not consume earlier authorization members or mutate them during reads", () => {
    const storage = new MemoryStorage();
    createStore(storage).commit([firstThreadId]);
    const before = [...storage.values];
    const next = createStore(storage, "context-two");
    expect(next.read()).toEqual({ type: "contextMismatch" });
    expect([...storage.values]).toEqual(before);

    next.commit([secondThreadId]);
    expect(next.read()).toEqual({ type: "restored", threadIds: [secondThreadId] });
    expect(createStore(storage).read()).toEqual({ type: "contextMismatch" });
  });

  it("preserves membership on a failed removal write and supports retry", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.commit([firstThreadId, secondThreadId]);
    const before = [...storage.values];
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("quota exceeded");
    });

    expect(() => {
      store.commit([secondThreadId]);
    }).toThrow(new SessionCollectionPersistenceError("write"));
    expect([...storage.values]).toEqual(before);
    expect(createStore(storage).read()).toEqual({
      type: "restored",
      threadIds: [firstThreadId, secondThreadId],
    });
    store.commit([secondThreadId]);
    expect(createStore(storage).read()).toEqual({ type: "restored", threadIds: [secondThreadId] });
  });

  it.each([
    ["invalid JSON", "malformed"],
    ["null", "malformed"],
    ["[]", "malformed"],
    ["{}", "malformed"],
    [JSON.stringify({ version: 2 }), "unsupportedVersion"],
    [
      JSON.stringify({ version: 1, authorizationContext: "context-one", threadIds: ["bad-id"] }),
      "malformed",
    ],
    [JSON.stringify({ version: 1, authorizationContext: "", threadIds: [] }), "malformed"],
    [
      JSON.stringify({ version: 1, authorizationContext: "context-one", threadIds: null }),
      "malformed",
    ],
  ] as const)("preserves damaged metadata %s on read and attempted replacement", (raw, code) => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.commit([firstThreadId]);
    replaceRecord(storage, raw);
    storage.setItem.mockClear();

    expect(() => store.read()).toThrow(new SessionCollectionPersistenceError(code));
    expect(() => {
      store.commit([]);
    }).toThrow(new SessionCollectionPersistenceError(code));
    expect(() => {
      createStore(storage, "context-two").commit([]);
    }).toThrow(new SessionCollectionPersistenceError(code));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect([...storage.values.values()]).toEqual([raw]);
  });

  it("propagates a blocked read and never attempts to overwrite it", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.commit([firstThreadId]);
    const before = [...storage.values];
    storage.setItem.mockClear();
    storage.getItem.mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => store.read()).toThrow(new SessionCollectionPersistenceError("read"));
    expect(() => {
      store.commit([]);
    }).toThrow(new SessionCollectionPersistenceError("read"));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect([...storage.values]).toEqual(before);
  });

  it("reports blocked sessionStorage access", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new Error("blocked");
      },
    });
    try {
      expect(
        () => new SessionCollectionPersistenceStore({ authorizationContext: "context-one" }),
      ).toThrow(new SessionCollectionPersistenceError("unavailable"));
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, "sessionStorage");
      } else {
        Object.defineProperty(globalThis, "sessionStorage", descriptor);
      }
    }
  });
});
