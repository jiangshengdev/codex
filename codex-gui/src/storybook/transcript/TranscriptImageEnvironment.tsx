import { FILE_PREVIEW_PATH, type GuiFilePreviewParams } from "@codex-gui-host-contract";
import { useLayoutEffect, useState, type PropsWithChildren } from "react";
import { AppCapabilitiesContext, type AppCapabilities } from "@/features/appShell/AppCapabilities";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { createSampleImage } from "../composer/sampleImage";
import { transcriptImagePath } from "./imageSamples";

const tokenPrefix = "storybook-transcript-image-";
const samples = new Map<string, Blob>();
let installed = false;

function installPreviewRouter() {
  if (installed) return;
  installed = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    const token = headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token?.startsWith(tokenPrefix)) return originalFetch(input, init);
    // Retired story tokens stay local, including requests arriving after unmount.
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const sample = samples.get(token);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const path = url.searchParams.get("path" satisfies keyof GuiFilePreviewParams);
    if (
      url.origin !== location.origin ||
      url.pathname !== FILE_PREVIEW_PATH ||
      method !== "GET" ||
      path !== transcriptImagePath ||
      sample == null
    ) {
      return Promise.resolve(new Response(null, { status: 410 }));
    }
    return Promise.resolve(new Response(sample, { headers: { "Content-Type": "image/png" } }));
  };
}

export function TranscriptImageEnvironment({ children }: PropsWithChildren) {
  const [token] = useState(() => `${tokenPrefix}${crypto.randomUUID()}`);
  const [sample] = useState(createSampleImage);
  const [capabilities] = useState<AppCapabilities>(() => ({
    status: { label: "initialized" },
    authorizationToken: token,
    commands: null,
    routeTarget: { type: "currentTask", threadId: "storybook-transcript-images" },
    activeThreadSession: null,
    newSessionOwner: new NewSessionOwner(),
    connectionRecovery: null,
  }));
  // Register before UploadedImagePreview starts its passive loading effect.
  useLayoutEffect(() => {
    installPreviewRouter();
    samples.set(token, sample);
    return () => {
      samples.delete(token);
    };
  }, [token, sample]);
  return <AppCapabilitiesContext value={capabilities}>{children}</AppCapabilitiesContext>;
}
