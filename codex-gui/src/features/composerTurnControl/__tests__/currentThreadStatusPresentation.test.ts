import { describe, expect, it } from "vitest";
import type { Thread } from "@codex-protocol/v2";
import { currentThreadStatusPresentation } from "../currentThreadStatusPresentation";

const cases = [
  [null, "Unknown", "Current task status is unknown", "default"],
  [{ type: "notLoaded" }, "Not loaded", "Current task is not loaded", "default"],
  [{ type: "idle" }, "Idle", "Current task is idle", "default"],
  [{ type: "active", activeFlags: [] }, "In progress", "Current task is in progress", "accent"],
  [
    { type: "active", activeFlags: ["waitingOnApproval"] },
    "Waiting for approval",
    "Current task is waiting for approval",
    "warning",
  ],
  [
    { type: "active", activeFlags: ["waitingOnUserInput"] },
    "Waiting for input",
    "Current task is waiting for input",
    "warning",
  ],
  [
    { type: "active", activeFlags: ["waitingOnApproval", "waitingOnUserInput"] },
    "Waiting",
    "Current task is waiting for approval and input",
    "warning",
  ],
  [
    { type: "active", activeFlags: ["waitingOnUserInput", "waitingOnApproval"] },
    "Waiting",
    "Current task is waiting for approval and input",
    "warning",
  ],
  [{ type: "systemError" }, "Error", "Current task has a system error", "danger"],
] as const satisfies readonly (readonly [
  Thread["status"] | null,
  string,
  string,
  "default" | "accent" | "warning" | "danger",
])[];

describe("current thread status presentation", () => {
  it.each(cases)("presents $label", (status, label, accessibleName, dotColor) => {
    const presentation = currentThreadStatusPresentation(status);

    expect(presentation).toMatchObject({
      accessibleName: { message: accessibleName },
      dotColor,
      label: { message: label },
    });
  });
});
