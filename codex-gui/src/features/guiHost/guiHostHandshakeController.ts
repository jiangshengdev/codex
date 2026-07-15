import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import { isThreadProjectionAttachResponse } from "./guiHostProtocol";
import {
  getGuiHostRequestFailureSource,
  type GuiHostRequestClient,
} from "./guiHostTransportSession";

type HandshakeCallbacks = {
  token: string;
  threadId: string;
  onAuthenticated: () => void;
  onInitialized: () => void;
  onAttached: (response: ThreadProjectionAttachResponse) => void;
  onTerminalError: (message: string, closeReason: string) => void;
};

type AuthenticateResult = {
  authenticated?: boolean;
};

export class GuiHostHandshakeController {
  private readonly requestClient: GuiHostRequestClient;
  private readonly callbacks: HandshakeCallbacks;
  private started = false;
  private active = true;

  constructor(requestClient: GuiHostRequestClient, callbacks: HandshakeCallbacks) {
    this.requestClient = requestClient;
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.started || !this.active) {
      return;
    }
    this.started = true;
    void this.run();
  }

  stop(): void {
    this.active = false;
  }

  private async run(): Promise<void> {
    try {
      const authentication = await this.requestClient.request<AuthenticateResult>(
        "gui/authenticate",
        { token: this.callbacks.token },
      );
      if (!this.active) {
        return;
      }
      if (authentication.result?.authenticated !== true) {
        this.active = false;
        return;
      }

      this.callbacks.onAuthenticated();
      if (!this.active) {
        return;
      }
      const initialization = await this.requestClient.request<Record<string, unknown>>(
        "initialize",
        {
          clientInfo: { name: "codex-gui", version: "0.0.0" },
          capabilities: {},
        },
      );
      if (!this.active) {
        return;
      }
      if (!initialization.result) {
        this.failProtocol("initialize returned no result payload");
        return;
      }

      this.callbacks.onInitialized();
      if (!this.active) {
        return;
      }
      const attachment = await this.requestClient.request<ThreadProjectionAttachResponse>(
        "thread/projection/attach",
        { threadId: this.callbacks.threadId },
      );
      if (!this.active) {
        return;
      }
      if (!attachment.result) {
        this.failProtocol("thread/projection/attach returned no result payload");
        return;
      }
      if (!isThreadProjectionAttachResponse(attachment.result)) {
        this.failProtocol("thread/projection/attach returned malformed result payload");
        return;
      }

      this.active = false;
      this.callbacks.onAttached(attachment.result);
    } catch (error) {
      if (!this.active) {
        return;
      }
      this.active = false;
      if (getGuiHostRequestFailureSource(error) === "rpc" && error instanceof Error) {
        this.callbacks.onTerminalError(error.message, "handshake error");
      }
    }
  }

  private failProtocol(message: string): void {
    this.active = false;
    this.callbacks.onTerminalError(message, "protocol error");
  }
}
