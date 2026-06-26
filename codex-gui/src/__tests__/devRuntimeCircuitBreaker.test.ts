import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import {
  installDevRuntimeCircuitBreaker,
  resetDevRuntimeCircuitBreakerForTests,
} from "../devRuntimeCircuitBreaker";

type HmrCallback = (payload?: unknown) => void;

function createHot() {
  const listeners = new Map<string, HmrCallback>();

  return {
    hot: {
      on(event: string, callback: HmrCallback) {
        listeners.set(event, callback);
      },
    },
    emit(event: string, payload?: unknown) {
      const callback = listeners.get(event);
      if (!callback) {
        throw new Error(`Missing listener for ${event}`);
      }
      callback(payload);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

describe("installDevRuntimeCircuitBreaker", () => {
  beforeEach(() => {
    resetDevRuntimeCircuitBreakerForTests();
  });

  it("navigates once when Vite HMR disconnects", () => {
    const devRuntime = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: devRuntime.hot,
      pathname: "/",
      replace: (url) => {
        replacements.push(url);
      },
    });

    devRuntime.emit("vite:ws:disconnect");
    devRuntime.emit("vite:ws:disconnect");

    expect(replacements).toEqual(["/__codex-gui/dev-runtime-error?reason=hmrDisconnected"]);
  });

  it("navigates once when Vite reports an error without copying payload", () => {
    const devRuntime = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: devRuntime.hot,
      pathname: "/thread/test",
      replace: (url) => {
        replacements.push(url);
      },
    });

    devRuntime.emit("vite:error", {
      message: "Something failed",
      stack: "Error: Something failed\n    at app.ts:1:1",
    });

    expect(replacements).toEqual(["/__codex-gui/dev-runtime-error?reason=viteError"]);
  });

  it("lets the first Vite event win", () => {
    const devRuntime = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: devRuntime.hot,
      pathname: "/",
      replace: (url) => {
        replacements.push(url);
      },
    });

    devRuntime.emit("vite:error");
    devRuntime.emit("vite:ws:disconnect");

    expect(replacements).toEqual(["/__codex-gui/dev-runtime-error?reason=viteError"]);
  });

  it("does not install listeners outside dev mode", () => {
    const devRuntime = createHot();

    installDevRuntimeCircuitBreaker({
      dev: false,
      hot: devRuntime.hot,
      pathname: "/",
      replace: () => {
        return;
      },
    });

    expect(devRuntime.listenerCount()).toBe(0);
  });

  it("does not navigate from the stable runtime error page", () => {
    const devRuntime = createHot();
    const replacements: string[] = [];

    installDevRuntimeCircuitBreaker({
      dev: true,
      hot: devRuntime.hot,
      pathname: "/__codex-gui/dev-runtime-error",
      replace: (url) => {
        replacements.push(url);
      },
    });

    devRuntime.emit("vite:error");

    expect(replacements).toEqual([]);
  });
});

describe("dev runtime circuit breaker bootstrap", () => {
  it("loads the bootstrap entry before dynamically importing the app", () => {
    const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const bootstrap = readFileSync(new URL("../bootstrap.ts", import.meta.url), "utf8");

    expect(indexHtml).toContain('src="/src/bootstrap.ts"');
    expect(indexHtml).not.toContain("/src/main.tsx");
    expect(bootstrap).toContain("installDevRuntimeCircuitBreaker({");
    expect(bootstrap).toContain('void import("./main")');
    expect(bootstrap).not.toContain('from "./main"');

    const installIndex = bootstrap.indexOf("installDevRuntimeCircuitBreaker({");
    const importIndex = bootstrap.indexOf('void import("./main")');
    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(importIndex).toBeGreaterThan(installIndex);
  });
});
