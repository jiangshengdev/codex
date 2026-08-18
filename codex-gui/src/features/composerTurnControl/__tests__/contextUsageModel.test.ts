import { describe, expect, it } from "vitest";
import { eventTokenUsageUpdated } from "@/features/projection/__tests__/projectionFixtures";
import type { ThreadTokenUsage } from "@codex-protocol/v2";
import { contextUsageModelFromTokenUsage, formatCompactTokenCount } from "../contextUsageModel";

const fixtureTokenUsage = (): ThreadTokenUsage => {
  if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
    throw new Error("fixture must contain a tokenUsageUpdated projection event");
  }

  return eventTokenUsageUpdated.event.notification.tokenUsage;
};

const tokenUsageWith = ({
  lastTotalTokens,
  modelContextWindow,
  totalTotalTokens = fixtureTokenUsage().total.totalTokens,
}: {
  lastTotalTokens: number;
  modelContextWindow: number | null;
  totalTotalTokens?: number;
}): ThreadTokenUsage => {
  const fixture = fixtureTokenUsage();
  return {
    ...fixture,
    total: { ...fixture.total, totalTokens: totalTotalTokens },
    last: { ...fixture.last, totalTokens: lastTotalTokens },
    modelContextWindow,
  };
};

describe("contextUsageModelFromTokenUsage", () => {
  it("returns null when token usage is unknown", () => {
    expect(contextUsageModelFromTokenUsage(null)).toBeNull();
  });

  it("derives the raw used percentage and compact values from the last usage", () => {
    expect(
      contextUsageModelFromTokenUsage(
        tokenUsageWith({ lastTotalTokens: 149_000, modelContextWindow: 258_000 }),
      ),
    ).toStrictEqual({
      usedTokens: 149_000,
      modelContextWindow: 258_000,
      percentage: 58,
      usedTokensCompact: "149k",
      modelContextWindowCompact: "258k",
    });
  });

  it.each([null, 0, -1])("keeps raw usage when the context window is %s", (modelContextWindow) => {
    expect(
      contextUsageModelFromTokenUsage(
        tokenUsageWith({ lastTotalTokens: 149_000, modelContextWindow }),
      ),
    ).toStrictEqual({
      usedTokens: 149_000,
      modelContextWindow,
      percentage: null,
      usedTokensCompact: "149k",
      modelContextWindowCompact:
        modelContextWindow == null ? null : formatCompactTokenCount(modelContextWindow),
    });
  });

  it("clamps over-window usage to 100 while preserving raw values", () => {
    expect(
      contextUsageModelFromTokenUsage(
        tokenUsageWith({ lastTotalTokens: 300, modelContextWindow: 100 }),
      ),
    ).toMatchObject({ usedTokens: 300, modelContextWindow: 100, percentage: 100 });
  });

  it("clamps negative used tokens to zero percent while preserving the raw value", () => {
    expect(
      contextUsageModelFromTokenUsage(
        tokenUsageWith({ lastTotalTokens: -1, modelContextWindow: 100 }),
      ),
    ).toMatchObject({ usedTokens: -1, modelContextWindow: 100, percentage: 0 });
  });

  it("ignores cumulative total tokens", () => {
    const first = contextUsageModelFromTokenUsage(
      tokenUsageWith({
        lastTotalTokens: 149_000,
        modelContextWindow: 258_000,
        totalTotalTokens: 200_000,
      }),
    );
    const second = contextUsageModelFromTokenUsage(
      tokenUsageWith({
        lastTotalTokens: 149_000,
        modelContextWindow: 258_000,
        totalTotalTokens: 9_000_000,
      }),
    );

    expect(second).toStrictEqual(first);
  });
});

describe("formatCompactTokenCount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1_000, "1k"],
    [1_500, "1.5k"],
    [9_999, "10k"],
    [10_000, "10k"],
    [22_800, "23k"],
    [997_500, "998k"],
    [1_000_000, "1M"],
    [1_200_000, "1.2M"],
    [1_250_000, "1.25M"],
  ] as const)("formats %i as %s", (value, expected) => {
    expect(formatCompactTokenCount(value)).toBe(expected);
  });
});
