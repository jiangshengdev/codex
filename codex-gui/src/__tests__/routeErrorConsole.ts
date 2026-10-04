import { expect, vi } from "vitest";

export async function expectRouteErrorConsole(
  expectedErrors: string[],
  expectedWarnings: string[],
  run: () => Promise<void>,
) {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  try {
    await run();
    expect(consoleError.mock.calls).toEqual(
      expectedErrors.map((message) => [
        "%o\n\n%s\n\n%s\n",
        new Error(message),
        "The above error occurred in the <MatchInnerImpl> component.",
        "React will try to recreate this component tree from scratch using the error boundary you provided, CatchBoundary.",
      ]),
    );
    expect(consoleWarn.mock.calls).toEqual(expectedWarnings.map((warning) => [warning]));
  } finally {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  }
}
