import { fileURLToPath } from "node:url";

export const guiHostContractDirectory = fileURLToPath(
  new URL("../../codex-rs/gui-host/schema/typescript", import.meta.url),
);
export const appServerProtocolDirectory = fileURLToPath(
  new URL("../../codex-rs/app-server-protocol/schema/typescript", import.meta.url),
);
