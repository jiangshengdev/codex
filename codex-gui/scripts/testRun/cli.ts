import { runIsolated } from "./run.ts";

const [mode, ...args] = process.argv.slice(2);
const modes: Record<string, { service?: string; args: string[] }> = {
  storybook: {
    service: "storybook",
    args: ["playwright", "test", "--config=playwright.storybook.config.ts"],
  },
  e2e: { service: "vite", args: ["playwright", "test", "--config=playwright.config.ts"] },
  "browser-parallel": { args: ["vitest", "--config=vitest.browser.parallel.config.ts"] },
  "browser-sequential": { args: ["vitest", "--config=vitest.browser.sequential.config.ts"] },
  "browser-smoke": { args: ["vitest", "--config=vitest.browser.smoke.config.ts"] },
  stories: { args: ["vitest", "--run", "--project=storybook"] },
};
const selected = mode ? modes[mode] : undefined;
if (!selected || !mode) throw new Error(`Unsupported test mode: ${mode}`);
const controller = new AbortController();
const cancel = () => {
  controller.abort();
};
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
try {
  const result = await runIsolated({
    name: mode,
    ...(selected.service
      ? {
          service: {
            command: process.execPath,
            args: ["--import", "tsx", `scripts/testRun/${selected.service}Server.ts`],
          },
        }
      : {}),
    test: {
      command: "pnpm",
      args: ["exec", ...selected.args, ...args],
    },
    signal: controller.signal,
  });
  process.exitCode = controller.signal.aborted ? 130 : result.code;
} finally {
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}
