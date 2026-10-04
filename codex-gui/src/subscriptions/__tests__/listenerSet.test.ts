import { describe, expect, it, vi } from "vitest";
import { createListenerSet } from "../listenerSet";

describe("createListenerSet", () => {
  it("deduplicates listeners and lets either subscription cancel the registration", () => {
    const listeners = createListenerSet();
    const listener = vi.fn<() => void>();
    const unsubscribe = listeners.subscribe(listener);
    const unsubscribeDuplicate = listeners.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    listeners.notify();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribeDuplicate();
    listeners.notify();
    unsubscribe();
    unsubscribe();
    listeners.notify();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps sets independent and allows subscriptions after clearing", () => {
    const first = createListenerSet();
    const second = createListenerSet();
    const listener = vi.fn<() => void>();
    first.subscribe(listener);
    second.subscribe(listener);
    first.clear();
    first.notify();
    expect(listener).not.toHaveBeenCalled();
    second.notify();
    expect(listener).toHaveBeenCalledTimes(1);
    first.subscribe(listener);
    first.notify();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("skips listeners removed during notification and visits newly added listeners in order", () => {
    const listeners = createListenerSet();
    const calls: string[] = [];
    const added = () => calls.push("added");
    listeners.subscribe(() => {
      calls.push("first");
      unsubscribeRemoved();
      listeners.subscribe(added);
    });
    const unsubscribeRemoved = listeners.subscribe(() => calls.push("removed"));
    listeners.subscribe(() => calls.push("last"));

    listeners.notify();
    expect(calls).toEqual(["first", "last", "added"]);
  });

  it("stops visiting old listeners when cleared during notification", () => {
    const listeners = createListenerSet();
    const calls: string[] = [];
    listeners.subscribe(() => {
      calls.push("first");
      listeners.clear();
      listeners.subscribe(() => calls.push("new"));
    });
    listeners.subscribe(() => calls.push("cleared"));

    listeners.notify();
    expect(calls).toEqual(["first", "new"]);
    listeners.notify();
    expect(calls).toEqual(["first", "new", "new"]);
  });

  it("allows synchronous nested notifications", () => {
    const listeners = createListenerSet();
    const calls: string[] = [];
    let nested = false;
    listeners.subscribe(() => {
      calls.push(nested ? "nested first" : "outer first");
      if (!nested) {
        nested = true;
        listeners.notify();
        nested = false;
      }
    });
    listeners.subscribe(() => calls.push(nested ? "nested second" : "outer second"));

    listeners.notify();
    expect(calls).toEqual(["outer first", "nested first", "nested second", "outer second"]);
  });

  it("propagates the original error and remains usable for later notifications", () => {
    const listeners = createListenerSet();
    const error = new Error("listener failed");
    const unsubscribe = listeners.subscribe(() => {
      unsubscribe();
      throw error;
    });
    const remaining = vi.fn<() => void>();
    listeners.subscribe(remaining);

    let receivedError: unknown;
    try {
      listeners.notify();
    } catch (caught) {
      receivedError = caught;
    }
    expect(receivedError).toBe(error);
    expect(remaining).not.toHaveBeenCalled();
    listeners.notify();
    expect(remaining).toHaveBeenCalledTimes(1);
  });
});
