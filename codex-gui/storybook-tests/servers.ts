import { currentRunContext } from "../scripts/testRun/resources.ts";

const run = currentRunContext();
export const storybookPort = run.port;
export const storybookOrigin = run.origin;
