export type SessionRecordStorage = Pick<Storage, "getItem" | "setItem">;

type StorageErrorConstructor = new (
  code: "unavailable" | "read" | "write" | "malformed",
  cause?: unknown,
) => Error;

/** Storage mechanics only; record validation and commit policy belong to each owner. */
export function createSessionRecordOperations(StorageError: StorageErrorConstructor) {
  return {
    readSessionStorage(): SessionRecordStorage {
      try {
        const storage = (globalThis as { sessionStorage?: Storage }).sessionStorage;
        if (storage === undefined) {
          throw new Error("Session storage is unavailable");
        }
        return storage;
      } catch (error: unknown) {
        throw new StorageError("unavailable", error);
      }
    },
    read(storage: SessionRecordStorage, key: string): string | null {
      try {
        return storage.getItem(key);
      } catch (error: unknown) {
        throw new StorageError("read", error);
      }
    },
    write(storage: SessionRecordStorage, key: string, value: string): void {
      try {
        storage.setItem(key, value);
      } catch (error: unknown) {
        throw new StorageError("write", error);
      }
    },
    parseObject(stored: string): Record<string, unknown> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(stored);
      } catch (error: unknown) {
        throw new StorageError("malformed", error);
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new StorageError("malformed");
      }
      return parsed as Record<string, unknown>;
    },
  };
}
