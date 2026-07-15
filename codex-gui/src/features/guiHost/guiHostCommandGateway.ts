import type { GuiHostCommands } from "./guiHostClient";
import type { GuiHostRequestClient } from "./guiHostTransportSession";

type CommandGatewayState = "inactive" | "ready" | "invalidated";

const unavailableMessage = "GUI host WebSocket is not available";

export class GuiHostCommandGateway {
  private readonly requestClient: GuiHostRequestClient;
  private readonly onUnavailable: () => void;
  private readonly commands: GuiHostCommands;
  private state: CommandGatewayState = "inactive";

  constructor(requestClient: GuiHostRequestClient, onUnavailable: () => void) {
    this.requestClient = requestClient;
    this.onUnavailable = onUnavailable;
    this.commands = {
      startTurn: (params) => this.request("turn/start", params),
      interruptTurn: (params) => this.request("turn/interrupt", params),
    };
  }

  activate(): GuiHostCommands | undefined {
    if (this.state === "invalidated") {
      return undefined;
    }
    this.state = "ready";
    return this.commands;
  }

  invalidate(): void {
    const wasReady = this.state === "ready";
    this.state = "invalidated";
    if (wasReady) {
      this.onUnavailable();
    }
  }

  private async request<TResponse>(method: string, params: unknown): Promise<TResponse> {
    this.assertReady();
    const response = await this.requestClient.request<TResponse>(method, params);
    return response.result ?? ({} as TResponse);
  }

  private assertReady(): void {
    if (this.state !== "ready") {
      throw new Error(unavailableMessage);
    }
  }
}
