import { afterEach, expect, it, vi } from "vitest";
import { isMacAppleWebKitRuntime } from "../composerRuntime";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["Apple Computer, Inc.", "MacIntel", 0, true],
  ["Apple Computer, Inc.", "MacIntel", 1, true],
  ["Apple Computer, Inc.", "MacIntel", 2, false],
  ["Apple Computer, Inc.", "iPhone", 1, false],
  ["Google Inc.", "MacIntel", 0, false],
  ["", "MacIntel", 0, false],
] as const)(
  "detects the composition guard runtime for vendor=%s platform=%s touchPoints=%i",
  (vendor, platform, maxTouchPoints, expected) => {
    vi.stubGlobal("navigator", { vendor, platform, maxTouchPoints });
    expect(isMacAppleWebKitRuntime()).toBe(expected);
  },
);
