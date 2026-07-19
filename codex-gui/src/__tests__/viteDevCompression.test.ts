import { gunzipSync } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, request } from "node:http";
import type { IncomingHttpHeaders, Server as HttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer as createViteServer } from "vite";
import type { ViteDevServer } from "vite";
import viteConfig from "../../vite.config";

const largeContent = "a".repeat(2048);
const smallContent = "b".repeat(512);

type HttpResponse = {
  body: Buffer;
  headers: IncomingHttpHeaders;
  statusCode: number | undefined;
};

const headerValues = (header: string | string[] | undefined): string[] => {
  if (header === undefined) {
    return [];
  }
  return typeof header === "string" ? [header] : header;
};

describe("Vite development response compression", () => {
  let httpServer: HttpServer | undefined;
  let root: string | undefined;
  let viteServer: ViteDevServer | undefined;
  let port: number;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "codex-gui-vite-compression-"));
    await Promise.all([
      writeFile(join(root, "large.txt"), largeContent),
      writeFile(join(root, "small.txt"), smallContent),
    ]);

    viteServer = await createViteServer({
      ...viteConfig,
      configFile: false,
      root,
      server: {
        ...viteConfig.server,
        hmr: false,
        middlewareMode: true,
      },
    });
    httpServer = createHttpServer(viteServer.middlewares);

    await new Promise<void>((resolve, reject) => {
      httpServer?.once("error", reject);
      httpServer?.listen(0, "127.0.0.1", resolve);
    });

    const address = httpServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("temporary Vite HTTP server did not expose a TCP port");
    }
    port = address.port;
  });

  afterAll(async () => {
    if (httpServer !== undefined) {
      await new Promise<void>((resolve, reject) => {
        httpServer?.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
    await viteServer?.close();
    if (root !== undefined) {
      await rm(root, { force: true, recursive: true });
    }
  });

  const requestAsset = (path: string, acceptEncoding: string): Promise<HttpResponse> =>
    new Promise((resolve, reject) => {
      const clientRequest = request(
        {
          headers: { "Accept-Encoding": acceptEncoding },
          host: "127.0.0.1",
          path,
          port,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            resolve({
              body: Buffer.concat(chunks),
              headers: response.headers,
              statusCode: response.statusCode,
            });
          });
          response.on("error", reject);
        },
      );
      clientRequest.on("error", reject);
      clientRequest.end();
    });

  it("gzip-compresses large responses and advertises content negotiation", async () => {
    const response = await requestAsset("/large.txt", "gzip");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(response.body).toString()).toBe(largeContent);

    const varyTokens = headerValues(response.headers.vary)
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase());
    expect(varyTokens).toContain("accept-encoding");
  });

  it("does not compress responses below the threshold", async () => {
    const response = await requestAsset("/small.txt", "gzip");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.body.toString()).toBe(smallContent);
  });

  it("does not compress responses when the client requests identity", async () => {
    const response = await requestAsset("/large.txt", "identity");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.body.toString()).toBe(largeContent);
  });
});
