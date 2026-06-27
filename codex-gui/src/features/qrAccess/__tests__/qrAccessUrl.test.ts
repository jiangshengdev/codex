import { describe, expect, it } from "vitest";
import { buildQrAccessUrl } from "../qrAccessUrl";

describe("buildQrAccessUrl", () => {
  it("rebuilds a launch URL with threadId and token fragment", () => {
    expect(
      buildQrAccessUrl({
        origin: "http://192.168.3.203:57223",
        threadId: "thread-abc",
        token: "secret-token",
      }),
    ).toBe("http://192.168.3.203:57223/?threadId=thread-abc#token=secret-token");
  });

  it("encodes threadId and token without changing the origin", () => {
    expect(
      buildQrAccessUrl({
        origin: "http://127.0.0.1:57223",
        threadId: "thread with space",
        token: "token with # and &",
      }),
    ).toBe("http://127.0.0.1:57223/?threadId=thread+with+space#token=token+with+%23+and+%26");
  });
});
