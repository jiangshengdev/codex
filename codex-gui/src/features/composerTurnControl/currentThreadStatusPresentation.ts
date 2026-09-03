import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { Thread, ThreadActiveFlag } from "@codex-protocol/v2";

export type CurrentThreadStatusPresentation = Readonly<{
  accessibleName: MessageDescriptor;
  dotColor: "default" | "accent" | "warning" | "danger";
  label: MessageDescriptor;
}>;

const presentations = {
  unknown: {
    accessibleName: msg`Current task status is unknown`,
    dotColor: "default",
    label: msg({
      comment: "Short label for an unknown current task status beside the composer QR button",
      message: "Unknown",
    }),
  },
  notLoaded: {
    accessibleName: msg`Current task is not loaded`,
    dotColor: "default",
    label: msg({
      comment: "Short label for a current task that is not loaded beside the composer QR button",
      message: "Not loaded",
    }),
  },
  idle: {
    accessibleName: msg`Current task is idle`,
    dotColor: "default",
    label: msg({
      comment: "Short idle-state label for the current task beside the composer QR button",
      message: "Idle",
    }),
  },
  active: {
    accessibleName: msg`Current task is in progress`,
    dotColor: "accent",
    label: msg({
      comment: "Short in-progress label for the current task beside the composer QR button",
      message: "In progress",
    }),
  },
  waitingOnApproval: {
    accessibleName: msg`Current task is waiting for approval`,
    dotColor: "warning",
    label: msg({
      comment: "Short label for a current task awaiting approval beside the composer QR button",
      message: "Waiting for approval",
    }),
  },
  waitingOnUserInput: {
    accessibleName: msg`Current task is waiting for input`,
    dotColor: "warning",
    label: msg({
      comment: "Short label for a current task awaiting user input beside the composer QR button",
      message: "Waiting for input",
    }),
  },
  waitingOnApprovalAndInput: {
    accessibleName: msg`Current task is waiting for approval and input`,
    dotColor: "warning",
    label: msg({
      comment: "Short label for a current task awaiting approval and input beside the QR button",
      message: "Waiting",
    }),
  },
  systemError: {
    accessibleName: msg`Current task has a system error`,
    dotColor: "danger",
    label: msg({
      comment: "Short system-error label for the current task beside the composer QR button",
      message: "Error",
    }),
  },
} as const satisfies Record<string, CurrentThreadStatusPresentation>;

export function currentThreadStatusPresentation(
  status: Thread["status"] | null,
): CurrentThreadStatusPresentation {
  if (status == null) return presentations.unknown;

  switch (status.type) {
    case "notLoaded":
      return presentations.notLoaded;
    case "idle":
      return presentations.idle;
    case "systemError":
      return presentations.systemError;
    case "active":
      return activeStatusPresentation(status.activeFlags);
  }
}

function activeStatusPresentation(
  activeFlags: readonly ThreadActiveFlag[],
): CurrentThreadStatusPresentation {
  let waitingOnApproval = false;
  let waitingOnUserInput = false;

  for (const activeFlag of activeFlags) {
    switch (activeFlag) {
      case "waitingOnApproval":
        waitingOnApproval = true;
        break;
      case "waitingOnUserInput":
        waitingOnUserInput = true;
        break;
      default:
        activeFlag satisfies never;
    }
  }

  if (waitingOnApproval && waitingOnUserInput) {
    return presentations.waitingOnApprovalAndInput;
  }
  if (waitingOnApproval) return presentations.waitingOnApproval;
  if (waitingOnUserInput) return presentations.waitingOnUserInput;
  return presentations.active;
}
