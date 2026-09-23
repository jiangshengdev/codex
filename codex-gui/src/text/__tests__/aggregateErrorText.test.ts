import { describe, expect, it } from "vitest";
import { aggregateErrorText } from "../aggregateErrorText";
import { errorText } from "../errorText";

describe("aggregateErrorText", () => {
  it("shows nested failure details in order instead of aggregate summaries", () => {
    const error = new AggregateError(
      [new Error("initialize failed"), new AggregateError(["detach failed", 42], "cleanup failed")],
      "activation failed",
    );

    expect(aggregateErrorText(error)).toBe("initialize failed; detach failed; 42");
    expect(errorText(error)).toBe("activation failed");
  });

  it.each([
    [new Error("failure"), "failure"],
    ["plain failure", "plain failure"],
    [null, "null"],
    [undefined, "undefined"],
    [{ reason: "failure" }, "[object Object]"],
  ])("preserves leaf conversion for %s", (error, expected) => {
    expect(aggregateErrorText(error)).toBe(expected);
  });

  it("keeps an empty aggregate empty without falling back to its summary", () => {
    expect(aggregateErrorText(new AggregateError([], "summary"))).toBe("");
  });

  it("preserves separators around empty details", () => {
    expect(
      aggregateErrorText(new AggregateError([new Error(""), new AggregateError([]), "last"])),
    ).toBe("; ; last");
  });
});
