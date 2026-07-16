import type { ClientRequestDefinition } from "@codex-protocol/ClientRequestDefinition";

export type ProtocolValidator<T> = (value: unknown) => value is T;

export type RequestDefinitionFor<M extends ClientRequestDefinition["method"]> = Extract<
  ClientRequestDefinition,
  { method: M }
>;

export type RequestParams<M extends ClientRequestDefinition["method"]> =
  RequestDefinitionFor<M>["params"];

export type RequestResponse<M extends ClientRequestDefinition["method"]> =
  RequestDefinitionFor<M>["response"];

export const APP_SERVER_REQUEST_METHODS = [
  "initialize",
  "thread/projection/attach",
  "turn/start",
  "turn/interrupt",
] as const satisfies readonly ClientRequestDefinition["method"][];
