import { expect, it, vi } from "vitest";
import { randomUuid } from "../randomUuid";

it.each([
  [0x00, "00000000-0000-4000-8000-000000000000"],
  [0xff, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
] as const)("sets UUID v4 version and variant bits for random byte %i", (byte, expected) => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(byte),
  });
  try {
    expect(randomUuid()).toBe(expected);
  } finally {
    vi.unstubAllGlobals();
  }
});
