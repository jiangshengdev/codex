import { beforeEach } from "vitest";
import { installBrowserMotionPolicy } from "./browserMotion";

beforeEach(({ onTestFinished }) => {
  onTestFinished(installBrowserMotionPolicy());
});
