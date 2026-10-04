import { buildDevStandalone } from "storybook/internal/core-server";
import { currentRunContext } from "./resources.ts";

const run = currentRunContext();
await buildDevStandalone({
  configDir: ".storybook",
  port: run.port,
  host: "127.0.0.1",
  exactPort: true,
  ci: true,
  open: false,
  disableTelemetry: true,
  versionUpdates: false,
});
// This is sent only after Storybook's own listening promise succeeds.
process.send?.({ ready: true });
