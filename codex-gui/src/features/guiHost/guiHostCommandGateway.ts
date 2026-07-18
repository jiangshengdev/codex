import { requestDescriptors } from "@/generated/appServerProtocol";
import type { RequestParams, RequestResponse } from "./appServerProtocol";
import type { AppServerRequestSender } from "./guiHostTransportSession";

export type GuiHostCommands = {
  startTurn: (params: RequestParams<"turn/start">) => Promise<RequestResponse<"turn/start">>;
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
      startTurn: (params) =>
        this.withReadyGateway(() =>
          this.requests.request(requestDescriptors["turn/start"], params),
        ),
      interruptTurn: (params) =>
        this.withReadyGateway(() =>
          this.requests.request(requestDescriptors["turn/interrupt"], params),
        ),
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

  private withReadyGateway<T>(startRequest: () => Promise<T>): Promise<T> {
    if (this.state !== "ready") {
      return Promise.reject(new Error("GUI host WebSocket is not available"));
    }

    return startRequest();
  }
}
