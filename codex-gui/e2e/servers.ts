import { currentRunContext } from "../scripts/testRun/resources.ts";

const run = currentRunContext();
export const guiPort = run.port;
export const guiOrigin = run.origin;
