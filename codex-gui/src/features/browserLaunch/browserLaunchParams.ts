export type BrowserLaunchParams = {
  threadId: string;
  token: string;
};

const launchTokenStorageKey = "codex-gui.launchToken";

export function consumeBrowserLaunchParams({
  location,
  replaceState,
  tokenStorage,
}: {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
}): BrowserLaunchParams {
  replaceState(null, "", `${location.pathname}${location.search}`);
  const resolvedTokenStorage = tokenStorage ?? readSessionStorage();
  const threadId = location.searchParams.get("threadId");
  const fragmentToken = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");

  if (!threadId) {
    throw new Error("Missing threadId query parameter");
  }

  if (fragmentToken) {
    try {
      resolvedTokenStorage?.setItem(launchTokenStorageKey, fragmentToken);
    } catch {
      // The fragment token is still valid for this connection if storage is unavailable.
    }
    return { threadId, token: fragmentToken };
  }

  const storedToken = resolvedTokenStorage?.getItem(launchTokenStorageKey);
  if (!storedToken) {
    throw new Error("Missing launch token fragment");
  }

  return { threadId, token: storedToken };
}

function readSessionStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
