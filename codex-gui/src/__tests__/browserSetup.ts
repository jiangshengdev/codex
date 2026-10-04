import { beforeEach, vi } from "vitest";
import { installBrowserMotionPolicy } from "./browserMotion";

beforeEach(({ onTestFinished }) => {
  onTestFinished(installBrowserMotionPolicy());
  // Real workers outlive Vitest's test iframes and bypass WebKit module-mock
  // routing (CNB #259). Notification Browser tests provide their own worker
  // mock; e2e/taskNotifications.spec.ts covers the real worker lifecycle.
  const register = vi
    .spyOn(navigator.serviceWorker, "register")
    .mockRejectedValue(
      new DOMException("Service workers are disabled in Browser fixtures", "NotAllowedError"),
    );
  onTestFinished(() => {
    register.mockRestore();
  });
});
