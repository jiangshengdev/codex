import { execFileSync } from "node:child_process";
import type { LaunchOptions } from "playwright";

const localHosts = "localhost,127.0.0.1";

export function localNetworkEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment,
    NO_PROXY: localHosts,
    no_proxy: localHosts,
    npm_config_noproxy: localHosts,
    NPM_CONFIG_NOPROXY: localHosts,
  };
}

export function localNetworkLaunchOptions(browser: string): LaunchOptions {
  if (browser === "chromium") {
    return { args: [`--proxy-bypass-list=${localHosts.replaceAll(",", ";")}`] };
  }
  if (browser === "firefox") {
    return { firefoxUserPrefs: { "network.proxy.no_proxies_on": localHosts } };
  }
  if (browser !== "webkit") throw new Error(`Unsupported test browser: ${browser}`);
  if (process.platform === "darwin") {
    const configuration = execFileSync("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8" });
    const value = (key: string) => new RegExp(`^  ${key} : (.+)$`, "m").exec(configuration)?.[1];
    if (value("HTTPEnable") === "1") {
      const host = value("HTTPProxy");
      const port = value("HTTPPort");
      if (!host || !port) throw new Error("Missing enabled system HTTP proxy address");
      return { proxy: { server: `http://${host}:${port}`, bypass: localHosts } };
    }
  }
  return { env: localNetworkEnvironment(process.env) };
}
