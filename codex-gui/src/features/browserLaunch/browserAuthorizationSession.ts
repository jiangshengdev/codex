import { TOKEN_FRAGMENT_KEY } from "@codex-gui-host-contract";
import { randomUuid } from "@/identity/randomUuid";
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
  private readonly persistenceContext: string;

  constructor(
    storage: AuthorizationSessionStorage,
    snapshot: BrowserAuthorizationSessionSnapshot,
    persistenceContext: string,
  ) {
    this.storage = storage;
    this.snapshot = snapshot;
    this.persistenceContext = persistenceContext;
  }

  getSnapshot = (): BrowserAuthorizationSessionSnapshot => this.snapshot;

  getPersistenceContext = (): string => this.persistenceContext;

  commitActiveThread = (threadId: string): void => {
    if (!isValidThreadId(threadId)) {
      throw new Error("Active thread ID must be a UUID");
    }
    const next = { token: this.snapshot.token, activeThreadId: threadId };
    writeStoredSession(this.storage, next, this.persistenceContext);
    this.snapshot = next;
  };

  clearActiveThread = (): void => {
    const next = { token: this.snapshot.token, activeThreadId: null };
    writeStoredSession(this.storage, next, this.persistenceContext);
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
    const persistenceContext = randomUuid();
    writeStoredSession(resolvedStorage, snapshot, persistenceContext);
    replaceState(readHistoryState(), "", `${location.pathname}${location.search}`);
    return new BrowserAuthorizationSession(resolvedStorage, snapshot, persistenceContext);
  }

  const { snapshot, persistenceContext: storedContext } = readStoredSession(resolvedStorage);
  const persistenceContext = storedContext ?? randomUuid();
  if (storedContext == null) {
    writeStoredSession(resolvedStorage, snapshot, persistenceContext);
  }
  if (fragmentToken != null) {
    replaceState(readHistoryState(), "", `${location.pathname}${location.search}`);
  }
  return new BrowserAuthorizationSession(resolvedStorage, snapshot, persistenceContext);
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
): ReturnType<typeof parseStoredSession> {
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

function parseStoredSession(value: unknown): {
  snapshot: BrowserAuthorizationSessionSnapshot;
  persistenceContext: string | null;
} {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error("Stored browser authorization session is malformed");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const hasActiveThreadId = Object.hasOwn(record, "activeThreadId");
  const hasPersistenceContext = Object.hasOwn(record, "persistenceContext");
  if (
    keys.some(
      (key) => key !== "token" && key !== "activeThreadId" && key !== "persistenceContext",
    ) ||
    typeof record.token !== "string" ||
    record.token.length === 0 ||
    (hasActiveThreadId && !isValidThreadId(record.activeThreadId)) ||
    (hasPersistenceContext && !isValidThreadId(record.persistenceContext))
  ) {
    throw new Error("Stored browser authorization session is malformed");
  }

  return {
    snapshot: {
      token: record.token,
      activeThreadId: hasActiveThreadId ? (record.activeThreadId as string) : null,
    },
    persistenceContext: hasPersistenceContext ? (record.persistenceContext as string) : null,
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
  persistenceContext: string,
): void {
  const stored =
    snapshot.activeThreadId == null
      ? { token: snapshot.token, persistenceContext }
      : { token: snapshot.token, activeThreadId: snapshot.activeThreadId, persistenceContext };
  try {
    storage.setItem(authorizationSessionStorageKey, JSON.stringify(stored));
  } catch (error: unknown) {
    throw new Error("Unable to write browser authorization session", { cause: error });
  }
}
