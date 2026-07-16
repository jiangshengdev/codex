import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import { isThreadProjectionAttachResponse } from "./guiHostProtocol";
import {
  getGuiHostRequestFailureSource,
  type GuiHostRequestClient,
  type GuiHostRpcResponse,
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
    const authentication = await this.request<AuthenticateResult>("gui/authenticate", {
      token: this.callbacks.token,
    });
    if (!authentication || !this.isActive()) {
      return;
    }
    if (authentication.result?.authenticated !== true) {
      this.active = false;
      return;
    }

    this.callbacks.onAuthenticated();
    if (!this.isActive()) {
      return;
    }
    const initialization = await this.request<Record<string, unknown>>("initialize", {
      clientInfo: { name: "codex-gui", version: "0.0.0" },
      capabilities: {},
    });
    if (!initialization || !this.isActive()) {
      return;
    }
    if (!initialization.result) {
      this.failProtocol("initialize returned no result payload");
      return;
    }

    this.callbacks.onInitialized();
    if (!this.isActive()) {
      return;
    }
    const attachment = await this.request<ThreadProjectionAttachResponse>(
      "thread/projection/attach",
      { threadId: this.callbacks.threadId },
    );
    if (!attachment || !this.isActive()) {
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
  }

  private async request<T>(
    method: string,
    params: unknown,
  ): Promise<GuiHostRpcResponse<T> | undefined> {
    try {
      return await this.requestClient.request<T>(method, params);
    } catch (error) {
      if (this.active) {
        this.active = false;
        if (getGuiHostRequestFailureSource(error) === "rpc" && error instanceof Error) {
          this.callbacks.onTerminalError(error.message, "handshake error");
        }
      }

      return undefined;
    }
  }

  private isActive(): boolean {
    return this.active;
  }

  private failProtocol(message: string): void {
    this.active = false;
    this.callbacks.onTerminalError(message, "protocol error");
  }
}
