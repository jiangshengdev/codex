import { appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Plugin } from "vite";
import type { Issue97CaptureOptions } from "./issue97CaptureBrowser";

// Temporary diagnostic only. With no live control file, no script is injected.
const directory = "/tmp/issue97-native-probe";
const controlFile = `${directory}/control.json`;
type CaptureControl = Issue97CaptureOptions & { expiresAt: number };

async function readControl(): Promise<CaptureControl | null> {
  let contents: string;
  try {
    contents = await readFile(controlFile, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const value: unknown = JSON.parse(contents);
  if (
    value == null ||
    typeof value !== "object" ||
    !("label" in value) ||
    typeof value.label !== "string" ||
    !/^[a-z0-9-]{1,48}$/.test(value.label) ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "number"
  ) {
    throw new Error("Invalid issue97 capture control");
  }
  if (value.expiresAt <= Date.now()) return null;
  const control: CaptureControl = { label: value.label, expiresAt: value.expiresAt };
  if ("instrumentCalls" in value) {
    if (typeof value.instrumentCalls !== "boolean") {
      throw new Error("Invalid issue97 call instrumentation");
    }
    control.instrumentCalls = value.instrumentCalls;
  }
  if ("transitionDelayMs" in value) {
    if (
      typeof value.transitionDelayMs !== "number" ||
      !Number.isFinite(value.transitionDelayMs) ||
      value.transitionDelayMs < 0 ||
      value.transitionDelayMs > 10_000
    ) {
      throw new Error("Invalid issue97 transition delay");
    }
    control.transitionDelayMs = value.transitionDelayMs;
  }
  return control;
}

export function issue97Capture(): Plugin {
  return {
    name: "issue97-native-capture",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== "/__issue97_capture") {
          next();
          return;
        }
        void (async () => {
          const control = await readControl();
          const data = request.headers["x-issue97-data"];
          if (request.method !== "GET" || control == null) {
            response.writeHead(410).end();
            return;
          }
          if (typeof data !== "string" || Buffer.byteLength(data) > 6000) {
            response.writeHead(400).end();
            return;
          }
          const parsed: unknown = JSON.parse(data);
          if (
            parsed == null ||
            typeof parsed !== "object" ||
            !("label" in parsed) ||
            parsed.label !== control.label
          ) {
            response.writeHead(409).end();
            return;
          }
          await appendFile(`${directory}/${control.label}.jsonl`, `${JSON.stringify(parsed)}\n`, {
            mode: 0o600,
          });
          response.writeHead(204, { "Cache-Control": "no-store" }).end();
        })().catch((error: unknown) => {
          server.config.logger.error(`[issue97] Capture failed: ${String(error)}`);
          response.writeHead(500).end();
        });
      });
    },
    transformIndexHtml: {
      order: "pre",
      async handler() {
        const control = await readControl();
        if (control == null) return [];
        const browserFile = fileURLToPath(new URL("./issue97CaptureBrowser.ts", import.meta.url));
        const output = await build({
          stdin: {
            contents: `import { startIssue97Capture } from ${JSON.stringify(browserFile)}; startIssue97Capture(${JSON.stringify({ label: control.label, transitionDelayMs: control.transitionDelayMs, instrumentCalls: control.instrumentCalls })});`,
            loader: "ts",
            resolveDir: dirname(browserFile),
          },
          bundle: true,
          write: false,
          format: "iife",
          platform: "browser",
          target: "es2023",
        });
        const script = output.outputFiles.at(0)?.text;
        if (script == null) throw new Error("Missing issue97 browser bundle");
        return [
          {
            tag: "script",
            attrs: { "data-issue97-probe": "" },
            children: script,
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}
