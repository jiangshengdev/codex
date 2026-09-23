import {
  createSessionRecordOperations,
  type SessionRecordStorage,
} from "@/storage/sessionRecordOperations";
import { isValidThreadId } from "@/features/browserLaunch/guiRouteTarget";

const sessionCollectionStorageKey = "codex-gui.sessionCollection";

type SessionCollectionRecord = Readonly<{
  version: 1;
  authorizationContext: string;
  threadIds: readonly string[];
}>;

export type SessionCollectionReadResult =
  | Readonly<{ type: "absent" }>
  | Readonly<{ type: "contextMismatch" }>
  | Readonly<{ type: "restored"; threadIds: readonly string[] }>;

export type SessionCollectionPersistenceErrorCode =
  | "unavailable"
  | "read"
  | "malformed"
  | "unsupportedVersion"
  | "write";

export class SessionCollectionPersistenceError extends Error {
  readonly code: SessionCollectionPersistenceErrorCode;

  constructor(code: SessionCollectionPersistenceErrorCode, cause?: unknown) {
    super(`Session collection persistence failed: ${code}`, { cause });
    this.name = "SessionCollectionPersistenceError";
    this.code = code;
  }
}

const recordOperations = createSessionRecordOperations(SessionCollectionPersistenceError);

/** Membership only; browserLaunch owns the saved viewing target and authorization. */
export class SessionCollectionPersistenceStore {
  private readonly authorizationContext: string;
  private readonly storage: SessionRecordStorage;

  constructor({
    authorizationContext,
    storage,
  }: {
    /** Opaque identity from browserLaunch, never the launch token. */
    authorizationContext: string;
    storage?: SessionRecordStorage;
  }) {
    this.authorizationContext = authorizationContext;
    this.storage = storage ?? recordOperations.readSessionStorage();
  }

  read = (): SessionCollectionReadResult => {
    const stored = recordOperations.read(this.storage, sessionCollectionStorageKey);
    if (stored === null) {
      return { type: "absent" };
    }
    const record = parseRecord(stored);
    if (record.authorizationContext !== this.authorizationContext) {
      return { type: "contextMismatch" };
    }
    return { type: "restored", threadIds: record.threadIds };
  };

  /** Publish membership only after this succeeds. This does not save the viewing target. */
  commit = (threadIds: readonly string[]): void => {
    // Corruption and blocked reads must not silently discard recoverable membership.
    // A valid record from another authorization can be replaced, never consumed.
    this.read();
    const serialized = JSON.stringify({
      version: 1,
      authorizationContext: this.authorizationContext,
      threadIds: [...new Set(threadIds)],
    } satisfies SessionCollectionRecord);
    parseRecord(serialized);
    recordOperations.write(this.storage, sessionCollectionStorageKey, serialized);
  };
}

function parseRecord(stored: string): SessionCollectionRecord {
  const record = recordOperations.parseObject(stored);
  if (!Object.hasOwn(record, "version")) {
    throw new SessionCollectionPersistenceError("malformed");
  }
  if (record.version !== 1) {
    throw new SessionCollectionPersistenceError("unsupportedVersion");
  }
  if (
    typeof record.authorizationContext !== "string" ||
    record.authorizationContext.length === 0 ||
    !Array.isArray(record.threadIds) ||
    !record.threadIds.every(isValidThreadId)
  ) {
    throw new SessionCollectionPersistenceError("malformed");
  }
  return {
    version: 1,
    authorizationContext: record.authorizationContext,
    threadIds: [...new Set<string>(record.threadIds)],
  };
}
