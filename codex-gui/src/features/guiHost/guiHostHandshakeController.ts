import { AUTHENTICATE_METHOD } from "@codex-gui-host-contract";
import { requestDescriptors } from "@/generated/appServerProtocol";
import type {
  AppServerRequestSender,
  AuthenticateRequestSender,
  TransportRequestFailure,
} from "./guiHostTransportSession";

export type GuiHostHandshakeTerminalFailure = {
  message: string;
  closeReason: "handshake error" | "protocol error";
};

export type GuiHostHandshakeCallbacks = {
  onAuthenticated: () => void;
  onInitialized: () => void;
  onTerminalFailure: (failure: GuiHostHandshakeTerminalFailure) => void;
};

type GuiHostHandshakeControllerOptions = {
  requests: AppServerRequestSender & AuthenticateRequestSender;
  token: string;
  callbacks: GuiHostHandshakeCallbacks;
};

export class GuiHostHandshakeController {
  private readonly requests: AppServerRequestSender & AuthenticateRequestSender;
  private readonly token: string;
  private readonly callbacks: GuiHostHandshakeCallbacks;
  private started = false;
  private active = false;

  constructor({ requests, token, callbacks }: GuiHostHandshakeControllerOptions) {
    this.requests = requests;
    this.token = token;
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.active = true;
    this.startAuthentication();
  }

  stop(): void {
    this.active = false;
  }

  private startAuthentication(): void {
    const request = this.requests.authenticate({ token: this.token }, (settlement) => {
      if (!this.active) {
        return;
      }
      if (settlement.type === "failure") {
        this.handleFailure(settlement.failure);
        return;
      }
      if (!settlement.response.authenticated) {
        this.fail({
          message: `${AUTHENTICATE_METHOD} returned malformed result payload`,
          closeReason: "protocol error",
        });
        return;
      }

      this.callbacks.onAuthenticated();
      if (this.shouldContinue()) {
        this.startInitialize();
      }
    });
    void request.catch(() => undefined);
  }

  private startInitialize(): void {
    const request = this.requests.request(
      requestDescriptors.initialize,
      {
        clientInfo: { name: "codex-gui", title: null, version: "0.0.0" },
        capabilities: null,
      },
      (settlement) => {
        if (!this.active) {
          return;
        }
        if (settlement.type === "failure") {
          this.handleFailure(settlement.failure);
          return;
        }

        this.active = false;
        this.callbacks.onInitialized();
      },
    );
    void request.catch(() => undefined);
  }

  private handleFailure(failure: TransportRequestFailure): void {
    const terminalFailure = terminalFailureFor(failure);
    this.active = false;
    if (terminalFailure) {
      this.callbacks.onTerminalFailure(terminalFailure);
    }
  }

  private fail(failure: GuiHostHandshakeTerminalFailure): void {
    this.active = false;
    this.callbacks.onTerminalFailure(failure);
  }

  private shouldContinue(): boolean {
    return this.active;
  }
}

function terminalFailureFor(
  failure: TransportRequestFailure,
): GuiHostHandshakeTerminalFailure | undefined {
  switch (failure.source) {
    case "rpc":
      return { message: failure.error.message, closeReason: "handshake error" };
    case "missingResult":
    case "malformedResult":
      return { message: failure.error.message, closeReason: "protocol error" };
    case "send":
    case "unavailable":
      return undefined;
    default:
      failure.source satisfies never;
      return undefined;
  }
}
