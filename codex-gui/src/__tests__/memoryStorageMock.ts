import { vi } from "vitest";

export class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem = vi.fn<(key: string) => string | null>((key) => this.values.get(key) ?? null);
  setItem = vi.fn<(key: string, value: string) => void>((key, value) => {
    this.values.set(key, value);
  });
}
