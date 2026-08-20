import { requestDescriptors } from "@/generated/appServerProtocol";
import { validateV2TurnError } from "@/generated/appServerProtocol/appServerPayloadValidators.js";
import type { RequestParams, RequestResponse } from "./appServerProtocol";
import type {
  AppServerRequestSender,
  GuiRequestMethod,
  RequestDescriptor,
  TransportRequestDelivery,
  TransportRequestFailure,
} from "./guiHostTransportSession";

export type GuiHostCommandFailureSource = TransportRequestFailure["source"];

export class GuiHostCommandError extends Error {
  readonly source: GuiHostCommandFailureSource;
  readonly delivery: TransportRequestDelivery;
  readonly rpcError?: NonNullable<TransportRequestFailure["rpcError"]>;
  readonly activeTurnNotSteerable: boolean;

  constructor(failure: TransportRequestFailure) {
    super(failure.error.message, { cause: failure.error });
    this.name = "GuiHostCommandError";
    this.source = failure.source;
    this.delivery = failure.delivery;
    if (failure.rpcError !== undefined) {
      this.rpcError = failure.rpcError;
    }
    this.activeTurnNotSteerable = activeTurnNotSteerable(failure.rpcError);
  }
}

function activeTurnNotSteerable(rpcError: TransportRequestFailure["rpcError"]): boolean {
  const data = rpcError?.data;
  if (!validateV2TurnError(data)) {
    return false;
  }
  const codexErrorInfo = data.codexErrorInfo;
  return (
    typeof codexErrorInfo === "object" &&
    codexErrorInfo !== null &&
    "activeTurnNotSteerable" in codexErrorInfo
  );
}

export function isGuiHostCommandError(error: unknown): error is GuiHostCommandError {
  return error instanceof GuiHostCommandError;
}

export type GuiHostCommands = {
  attachThreadProjection: (
    params: RequestParams<"thread/projection/attach">,
  ) => Promise<RequestResponse<"thread/projection/attach">>;
  listSkills: (params: RequestParams<"skills/list">) => Promise<RequestResponse<"skills/list">>;
  listThreads: (params: RequestParams<"thread/list">) => Promise<RequestResponse<"thread/list">>;
  readThread: (params: RequestParams<"thread/read">) => Promise<RequestResponse<"thread/read">>;
  resumeThread: (
    params: RequestParams<"thread/resume">,
  ) => Promise<RequestResponse<"thread/resume">>;
  detachThreadProjection: (
    params: RequestParams<"thread/projection/detach">,
  ) => Promise<RequestResponse<"thread/projection/detach">>;
  startTurn: (params: RequestParams<"turn/start">) => Promise<RequestResponse<"turn/start">>;
  steerTurn: (params: RequestParams<"turn/steer">) => Promise<RequestResponse<"turn/steer">>;
  interruptTurn: (
    params: RequestParams<"turn/interrupt">,
  ) => Promise<RequestResponse<"turn/interrupt">>;
};

type CommandGatewayState = "inactive" | "ready" | "invalidated";

export class GuiHostCommandGateway {
  readonly commands: GuiHostCommands;
  private readonly requests: AppServerRequestSender;
  private state: CommandGatewayState = "inactive";

  constructor(requests: AppServerRequestSender) {
    this.requests = requests;
    this.commands = {
      attachThreadProjection: (params) =>
        this.request(requestDescriptors["thread/projection/attach"], params),
      listSkills: (params) => this.request(requestDescriptors["skills/list"], params),
      listThreads: (params) => this.request(requestDescriptors["thread/list"], params),
      readThread: (params) => this.request(requestDescriptors["thread/read"], params),
      resumeThread: (params) => this.request(requestDescriptors["thread/resume"], params),
      detachThreadProjection: (params) =>
        this.request(requestDescriptors["thread/projection/detach"], params),
      startTurn: (params) => this.request(requestDescriptors["turn/start"], params),
      steerTurn: (params) => this.request(requestDescriptors["turn/steer"], params),
      interruptTurn: (params) => this.request(requestDescriptors["turn/interrupt"], params),
    };
  }

  activate(): boolean {
    if (this.state !== "inactive") {
      return false;
    }

    this.state = "ready";
    return true;
  }

  invalidate(): boolean {
    const wasReady = this.state === "ready";
    this.state = "invalidated";
    return wasReady;
  }

  private request<M extends GuiRequestMethod>(
    descriptor: RequestDescriptor<M>,
    params: RequestParams<M>,
  ): Promise<RequestResponse<M>> {
    return this.withReadyGateway((onFailure) =>
      this.requests.request(descriptor, params, (settlement) => {
        if (settlement.type === "failure") {
          onFailure(settlement.failure);
        }
      }),
    );
  }

  private withReadyGateway<T>(
    startRequest: (onFailure: (failure: TransportRequestFailure) => void) => Promise<T>,
  ): Promise<T> {
    if (this.state !== "ready") {
      return Promise.reject(
        new GuiHostCommandError({
          source: "unavailable",
          delivery: "definitelyNotAccepted",
          error: new Error("GUI host WebSocket is not available"),
        }),
      );
    }

    let commandError: GuiHostCommandError | undefined;
    return startRequest((failure) => {
      commandError = new GuiHostCommandError(failure);
    }).catch((error: unknown) => {
      const rejection = commandError ?? error;
      if (rejection instanceof Error) {
        throw rejection;
      }
      throw new Error("GUI host command failed", { cause: rejection });
    });
  }
}
