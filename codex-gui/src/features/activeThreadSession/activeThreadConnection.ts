import {
  GuiHostCommandError,
  type GuiHostCommands,
} from "@/features/guiHost/guiHostCommandGateway";

export type ActiveThreadConnectionRound<Commands extends Partial<GuiHostCommands>> = Readonly<{
  commands: Commands;
  isCurrent(): boolean;
}>;

/** One replaceable command authority for retained session and child owners. */
export type ActiveThreadConnection<Commands extends Partial<GuiHostCommands> = GuiHostCommands> =
  Readonly<{
    capture(): ActiveThreadConnectionRound<Commands> | null;
    run<Result>(request: (commands: Commands) => Promise<Result>): Promise<Result>;
    replace(commands: Commands): void;
    revoke(): void;
  }>;

export function createActiveThreadConnection<Commands extends Partial<GuiHostCommands>>(
  commands: Commands,
): ActiveThreadConnection<Commands> {
  let current: ActiveThreadConnectionRound<Commands> | null = null;
  const replace = (nextCommands: Commands): void => {
    const round: ActiveThreadConnectionRound<Commands> = {
      commands: nextCommands,
      isCurrent: () => current === round,
    };
    current = round;
  };
  replace(commands);

  return {
    capture: () => current,
    run: (request) => {
      const round = current;
      if (round == null) {
        return Promise.reject(
          new GuiHostCommandError({
            source: "unavailable",
            delivery: "definitelyNotAccepted",
            error: new Error("GUI host connection is not available"),
          }),
        );
      }
      // Settlement belongs to the original request, including deliveryUnknown.
      // Read owners use capture().isCurrent() to reject stale publication.
      return request(round.commands);
    },
    replace,
    revoke: () => {
      current = null;
    },
  };
}
