import { errorText } from "./errorText";

/** Normalize caught exceptions without discarding Error subclasses or their metadata. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(errorText(error), { cause: error });
}
