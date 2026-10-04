import { errorText } from "./errorText";

export function aggregateErrorText(error: unknown): string {
  return error instanceof AggregateError
    ? error.errors.map(aggregateErrorText).join("; ")
    : errorText(error);
}
