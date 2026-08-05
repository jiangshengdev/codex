import { requestDescriptors } from "@/generated/appServerProtocol";
import type { RequestParams, RequestResponse } from "./appServerProtocol";
import type {
  AppServerRequestSender,
  GuiRequestMethod,
  RequestDescriptor,
  TransportRequestFailure,
} from "./guiHostTransportSession";

export type GuiHostCommandFailureSource = TransportRequestFailure["source"];

export class GuiHostCommandError extends Error {
  readonly source: GuiHostCommandFailureSource;

  constructor(failure: TransportRequestFailure) {
    super(failure.error.message, { cause: failure.error });
    this.name = "GuiHostCommandError";
    this.source = failure.source;
  }
}

export function isGuiHostCommandError(error: unknown): error is GuiHostCommandError {
  return error instanceof GuiHostCommandError;
}

export type GuiHostCommands = {
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
