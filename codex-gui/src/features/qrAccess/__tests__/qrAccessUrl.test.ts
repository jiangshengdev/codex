import { describe, expect, it } from "vitest";
import { buildQrAccessUrl } from "../qrAccessUrl";

describe("buildQrAccessUrl", () => {
  it("builds the canonical current task URL with only a token fragment", () => {
    expect(
      buildQrAccessUrl({
        authorizationToken: "secret-token",
        origin: "http://192.168.3.203:57223",
        routeTarget: {
          type: "currentTask",
          threadId: "11111111-2222-3333-4444-555555555555",
        },
      }),
    ).toBe(
      "http://192.168.3.203:57223/task/11111111-2222-3333-4444-555555555555#token=secret-token",
    );
  });

  it("builds the canonical history detail URL and encodes the token", () => {
    expect(
      buildQrAccessUrl({
        authorizationToken: "token with # and &",
        origin: "http://127.0.0.1:57223",
        routeTarget: {
          type: "historyDetail",
          threadId: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
        },
      }),
    ).toBe(
      "http://127.0.0.1:57223/history/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE#token=token+with+%23+and+%26",
    );
  });

  it("does not build a QR URL for the history list", () => {
    expect(
      buildQrAccessUrl({
        authorizationToken: "secret-token",
        origin: "http://127.0.0.1:57223",
        routeTarget: { type: "historyList" },
      }),
    ).toBeNull();
  });

  it("does not build a QR URL without an authorization token", () => {
    expect(
      buildQrAccessUrl({
        authorizationToken: null,
        origin: "http://127.0.0.1:57223",
        routeTarget: {
          type: "currentTask",
          threadId: "11111111-2222-3333-4444-555555555555",
        },
      }),
    ).toBeNull();
  });
});
