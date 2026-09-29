import type { TestUserConfig } from "vitest/config";

export const sharedTestConfig = {
  reporters: [["minimal", { silent: false }]],
} satisfies TestUserConfig;
