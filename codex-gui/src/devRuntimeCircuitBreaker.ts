const devRuntimeErrorPath = "/__codex-gui/dev-runtime-error";

type DevRuntimeErrorReason = "hmrDisconnected" | "viteError";

type ViteHot = {
  on(event: string, callback: (payload?: unknown) => void): void;
};

type InstallDevRuntimeCircuitBreakerOptions = {
  dev: boolean;
  hot?: ViteHot;
  pathname: string;
  replace: (url: string) => void;
};

let tripped = false;

export function installDevRuntimeCircuitBreaker({
  dev,
  hot,
  pathname,
  replace,
}: InstallDevRuntimeCircuitBreakerOptions): void {
  if (!dev || !hot) {
    return;
  }

  const trip = (reason: DevRuntimeErrorReason) => {
    if (tripped || pathname === devRuntimeErrorPath) {
      return;
    }

    tripped = true;
    replace(`${devRuntimeErrorPath}?reason=${reason}`);
  };

  hot.on("vite:ws:disconnect", () => {
    trip("hmrDisconnected");
  });
  hot.on("vite:error", () => {
    trip("viteError");
  });
}

export function resetDevRuntimeCircuitBreakerForTests(): void {
  tripped = false;
}
