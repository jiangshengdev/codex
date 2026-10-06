import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { localNetworkLaunchOptions } from "../network.ts";
import { currentRunContext } from "../resources.ts";

const run = currentRunContext();
const browserName = process.argv[2];
assert(browserName === "chromium" || browserName === "firefox" || browserName === "webkit");
const browser = await { chromium, firefox, webkit }[browserName].launch({
  ...(process.argv[3] === "control" ? {} : localNetworkLaunchOptions(browserName)),
  headless: true,
});
try {
  for (const host of ["localhost", "127.0.0.1"]) {
    const page = await browser.newPage();
    const response = await page.goto(`http://${host}:${String(run.port)}/network-probe`);
    assert(response);
    assert.equal(response.status(), 200);
    assert.match(await response.text(), /Local network probe/);
    await page.waitForFunction(() => document.body.dataset.networkReply !== undefined);
    const exchange = await page.evaluate(() => document.body.dataset.networkReply);
    assert.equal(exchange, "network-round-trip");
    const address = await response.serverAddr();
    const connections =
      process.platform === "darwin"
        ? execFileSync(
            "/usr/sbin/lsof",
            ["-nP", `-iTCP:${String(run.port)}`, "-sTCP:ESTABLISHED", "-Fpcn"],
            { encoding: "utf8" },
          )
        : undefined;
    await writeFile(
      path.join(run.artifactsDirectory, `${host}.json`),
      JSON.stringify(
        { browserName, host, httpStatus: response.status(), address, exchange, connections },
        null,
        2,
      ),
    );
    if (process.argv[3] !== "control") assert.equal(address?.port, run.port);
    await page.close();
  }
} finally {
  await browser.close();
}
