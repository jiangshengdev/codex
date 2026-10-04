import { describe, expect, it } from "vitest";
import { createActiveThreadSessionIdentity } from "../activeThreadSessionIdentity";

describe("active thread session identity", () => {
  it("does not reuse the previous live identity when the same thread is reopened", () => {
    const previous = createActiveThreadSessionIdentity("thread-a");
    const background = createActiveThreadSessionIdentity("thread-b");
    const reopened = createActiveThreadSessionIdentity("thread-a");

    expect(previous.threadId).toBe("thread-a");
    expect(background.threadId).toBe("thread-b");
    expect(reopened.threadId).toBe(previous.threadId);
    expect(new Set([previous.instanceId, background.instanceId, reopened.instanceId]).size).toBe(3);
  });
});
