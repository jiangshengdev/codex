import type { InitializeResponse } from "@codex-protocol/InitializeResponse";

export const initializeResponse: InitializeResponse = {
  userAgent: "codex-test",
  codexHome: "/codex-home",
  platformFamily: "test",
  platformOs: "test",
};

export class RecordingSocket {
  sent: string[] = [];
  closed: { code: number | undefined; reason: string | undefined }[] = [];
  readyState: number = WebSocket.OPEN;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
  }
}
