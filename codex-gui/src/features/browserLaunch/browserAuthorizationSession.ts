import { TOKEN_FRAGMENT_KEY } from "@codex-gui-host-contract";
import { isValidThreadId } from "./guiRouteTarget";

const authorizationSessionStorageKey = "codex-gui.browserAuthorizationSession.v1";

type AuthorizationSessionStorage = Pick<Storage, "getItem" | "setItem">;

export type BrowserAuthorizationSessionSnapshot = Readonly<{
  token: string;
  activeThreadId: string | null;
}>;

export class BrowserAuthorizationSession {
  private readonly storage: AuthorizationSessionStorage;
  private snapshot: BrowserAuthorizationSessionSnapshot;

  constructor(storage: AuthorizationSessionStorage, snapshot: BrowserAuthorizationSessionSnapshot) {
    this.storage = storage;
    this.snapshot = snapshot;
  }

  getSnapshot = (): BrowserAuthorizationSessionSnapshot => this.snapshot;

  commitActiveThread = (threadId: string): void => {
    if (!isValidThreadId(threadId)) {
      throw new Error("Active thread ID must be a UUID");
    }
    const next = { token: this.snapshot.token, activeThreadId: threadId };
    writeStoredSession(this.storage, next);
    this.snapshot = next;
  };

  clearActiveThread = (): void => {
    const next = { token: this.snapshot.token, activeThreadId: null };
    writeStoredSession(this.storage, next);
    this.snapshot = next;
  };
}

export function consumeBrowserAuthorizationSession({
  location,
  replaceState,
  storage,
}: {
  location: URL;
  replaceState: History["replaceState"];
  storage?: AuthorizationSessionStorage;
}): BrowserAuthorizationSession {
  const resolvedStorage = storage ?? readSessionStorage();
  const fragmentToken = new URLSearchParams(location.hash.replace(/^#/, "")).get(
    TOKEN_FRAGMENT_KEY,
  );

  if (fragmentToken != null && fragmentToken.length > 0) {
    const snapshot = { token: fragmentToken, activeThreadId: null };
    writeStoredSession(resolvedStorage, snapshot);
    replaceState(readHistoryState(), "", `${location.pathname}${location.search}`);
    return new BrowserAuthorizationSession(resolvedStorage, snapshot);
  }

  const snapshot = readStoredSession(resolvedStorage);
  if (fragmentToken != null) {
    replaceState(readHistoryState(), "", `${location.pathname}${location.search}`);
  }
  return new BrowserAuthorizationSession(resolvedStorage, snapshot);
}

function readSessionStorage(): AuthorizationSessionStorage {
  try {
    return globalThis.sessionStorage;
  } catch (error: unknown) {
    throw new Error("Browser authorization session storage is unavailable", { cause: error });
  }
}

function readStoredSession(
  storage: AuthorizationSessionStorage,
): BrowserAuthorizationSessionSnapshot {
  let stored: string | null;
  try {
    stored = storage.getItem(authorizationSessionStorageKey);
  } catch (error: unknown) {
    throw new Error("Unable to read browser authorization session", { cause: error });
  }

  if (stored == null) {
    throw new Error("Missing launch token fragment");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch (error: unknown) {
    throw new Error("Stored browser authorization session is malformed", { cause: error });
  }
  return parseStoredSession(parsed);
}

function parseStoredSession(value: unknown): BrowserAuthorizationSessionSnapshot {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error("Stored browser authorization session is malformed");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const hasActiveThreadId = Object.hasOwn(record, "activeThreadId");
  if (
    keys.some((key) => key !== "token" && key !== "activeThreadId") ||
    typeof record.token !== "string" ||
    record.token.length === 0 ||
    (hasActiveThreadId && !isValidThreadId(record.activeThreadId))
  ) {
    throw new Error("Stored browser authorization session is malformed");
  }

  return {
    token: record.token,
    activeThreadId: hasActiveThreadId ? (record.activeThreadId as string) : null,
  };
}

function readHistoryState(): unknown {
  if (typeof window !== "undefined") {
    return window.history.state;
  }
  return typeof globalThis.history === "undefined" ? null : globalThis.history.state;
}

function writeStoredSession(
  storage: AuthorizationSessionStorage,
  snapshot: BrowserAuthorizationSessionSnapshot,
): void {
  const stored =
    snapshot.activeThreadId == null
      ? { token: snapshot.token }
      : { token: snapshot.token, activeThreadId: snapshot.activeThreadId };
  try {
    storage.setItem(authorizationSessionStorageKey, JSON.stringify(stored));
  } catch (error: unknown) {
    throw new Error("Unable to write browser authorization session", { cause: error });
  }
}
