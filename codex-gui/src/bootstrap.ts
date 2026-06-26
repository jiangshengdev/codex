import { installDevRuntimeCircuitBreaker } from "./devRuntimeCircuitBreaker";

installDevRuntimeCircuitBreaker({
  dev: import.meta.env.DEV,
  hot: import.meta.hot,
  pathname: window.location.pathname,
  replace: (url) => window.location.replace(url),
});

void import("./main");
