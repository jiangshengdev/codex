export function persistedRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid persisted queue record");
  return value as Record<string, unknown>;
}

export function persistedArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid persisted queue array");
  return value;
}

export function persistedString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error("Invalid persisted queue identity");
  return value;
}

export function persistedInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid persisted queue order");
  return value;
}
