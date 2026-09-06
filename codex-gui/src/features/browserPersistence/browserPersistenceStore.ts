/** The feature owner validates and reconstructs its own recoverable domain data. */
export type BrowserPersistenceCodec<T> = Readonly<{
  encode: (value: T) => unknown;
  decode: (value: unknown) => T;
}>;

export type BrowserPersistenceRevision = number;

export type BrowserPersistenceSnapshot<T> = Readonly<{
  revision: BrowserPersistenceRevision;
  value: T;
}>;

export type BrowserPersistenceErrorCode =
  | "unavailable"
  | "read"
  | "malformed"
  | "unsupportedVersion"
  | "payload"
  | "serialize"
  | "write"
  | "revisionConflict";

export class BrowserPersistenceError extends Error {
  readonly code: BrowserPersistenceErrorCode;

  constructor(code: BrowserPersistenceErrorCode, cause?: unknown) {
    super(`Browser persistence failed: ${code}`, { cause });
    this.name = "BrowserPersistenceError";
    this.code = code;
  }
}

type SessionRecordStorage = Pick<Storage, "getItem" | "setItem">;

type RecordEnvelope = Readonly<{
  version: 1;
  authorizationContext: string;
  threadId: string;
  revision: BrowserPersistenceRevision;
  payload: unknown;
}>;

/**
 * One setItem commits the owner's complete candidate (including draft and queue).
 * No live domain state or permission to resume sending is owned here.
 */
export class BrowserPersistenceStore<T> {
  private readonly storage: SessionRecordStorage;
  private readonly codec: BrowserPersistenceCodec<T>;
  private readonly authorizationContext: string;
  private readonly threadId: string;
  private readonly key: string;

  constructor({
    authorizationContext,
    threadId,
    codec,
    storage,
  }: {
    /** Opaque identity supplied by browserLaunch; never pass the launch token. */
    authorizationContext: string;
    threadId: string;
    codec: BrowserPersistenceCodec<T>;
    storage?: SessionRecordStorage;
  }) {
    this.authorizationContext = authorizationContext;
    this.threadId = threadId;
    this.codec = codec;
    this.storage = storage ?? readSessionStorage();
    this.key = `codex-gui.browserPersistence.${encodeURIComponent(threadId)}`;
  }

  read = (): BrowserPersistenceSnapshot<T> | null => {
    let stored: string | null;
    try {
      stored = this.storage.getItem(this.key);
    } catch (error: unknown) {
      throw new BrowserPersistenceError("read", error);
    }
    if (stored === null) {
      return null;
    }
    const envelope = parseEnvelope(stored);
    if (envelope.threadId !== this.threadId) {
      throw new BrowserPersistenceError("malformed");
    }
    const snapshot = this.decode(envelope);
    // A new authorization never consumes an earlier context's business data.
    if (envelope.authorizationContext !== this.authorizationContext) {
      return null;
    }
    return snapshot;
  };

  /**
   * Callers publish memory and run effects only after this returns successfully.
   * expectedRevision is null for an absent record. This checks this page's record;
   * sessionStorage copies are independent and this is not cross-page coordination.
   */
  commit = (
    value: T,
    expectedRevision: BrowserPersistenceRevision | null,
  ): BrowserPersistenceSnapshot<T> => {
    const current = this.read();
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new BrowserPersistenceError("revisionConflict");
    }
    const revision = (expectedRevision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) {
      throw new BrowserPersistenceError("revisionConflict");
    }

    let serialized: string;
    try {
      serialized = JSON.stringify({
        version: 1,
        authorizationContext: this.authorizationContext,
        threadId: this.threadId,
        revision,
        payload: this.codec.encode(value),
      } satisfies RecordEnvelope);
    } catch (error: unknown) {
      throw new BrowserPersistenceError("serialize", error);
    }
    // Verify the JSON representation, not only the pre-serialization value.
    // Failed encoding/import cannot overwrite the last recoverable record.
    const snapshot = this.decode(parseEnvelope(serialized));
    try {
      this.storage.setItem(this.key, serialized);
    } catch (error: unknown) {
      throw new BrowserPersistenceError("write", error);
    }
    return snapshot;
  };

  private decode(envelope: RecordEnvelope): BrowserPersistenceSnapshot<T> {
    try {
      return { revision: envelope.revision, value: this.codec.decode(envelope.payload) };
    } catch (error: unknown) {
      throw new BrowserPersistenceError("payload", error);
    }
  }
}

function readSessionStorage(): SessionRecordStorage {
  try {
    const storage = (globalThis as { sessionStorage?: Storage }).sessionStorage;
    if (storage === undefined) {
      throw new Error("Session storage is unavailable");
    }
    return storage;
  } catch (error: unknown) {
    throw new BrowserPersistenceError("unavailable", error);
  }
}

function parseEnvelope(stored: string): RecordEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch (error: unknown) {
    throw new BrowserPersistenceError("malformed", error);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BrowserPersistenceError("malformed");
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== 1) {
    throw new BrowserPersistenceError("unsupportedVersion");
  }
  if (
    typeof record.authorizationContext !== "string" ||
    record.authorizationContext.length === 0 ||
    typeof record.threadId !== "string" ||
    record.threadId.length === 0 ||
    typeof record.revision !== "number" ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    !Object.hasOwn(record, "payload")
  ) {
    throw new BrowserPersistenceError("malformed");
  }
  return {
    version: 1,
    authorizationContext: record.authorizationContext,
    threadId: record.threadId,
    revision: record.revision,
    payload: record.payload,
  };
}
