import { expect, test } from "@playwright/test";
import { composer } from "../e2e/persistenceHarness";

test.use({ locale: "en" });

test("shows snapshot questions and options without activating answer controls", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=transcript-async-question-recovery--history&viewMode=story");
  const question = page.getByRole("group", { name: "Which environment?", exact: true });
  await expect(question).toBeVisible();
  await expect(question.getByRole("listitem")).toHaveText(["Preview", "Production"]);
  await expect(question.getByRole("textbox")).toHaveCount(0);
  await expect(question.getByRole("radio")).toHaveCount(0);
  await expect(question.getByRole("button")).toHaveCount(0);
  await expect(composer(page)).toHaveText("Keep my bottom draft");
});

test("retains a live answer through connection and task recovery without sending it", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=transcript-async-question-recovery--disconnected&viewMode=story",
  );
  const question = page.getByRole("group", { name: "Which environment?", exact: true });
  const answer = question.getByRole("textbox");
  await expect(answer).toHaveValue("Retained answer draft");
  await expect(answer).toHaveAttribute("readonly", "");
  await expect(question.getByRole("radio", { name: "Production", exact: true })).toBeDisabled();
  await expect(question.getByRole("button", { name: "Submit answer", exact: true })).toBeDisabled();
  await expect(question.getByRole("button", { name: "Skip question", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reconnect", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restoring task…", exact: true })).toBeVisible();
  await expect(answer).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Simulate task attachment", exact: true }).click();
  await expect(answer).not.toHaveAttribute("readonly", "");
  await expect(answer).toHaveValue("Retained answer draft");
  await expect(question.getByRole("radio", { name: "Custom answer", exact: true })).toBeChecked();
  await expect(question.getByRole("button", { name: "Submit answer", exact: true })).toBeEnabled();
  await expect(question.getByText("Question skipped", { exact: true })).toHaveCount(0);
  const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
  await expect(transcript).not.toContainText("> Which environment?");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await transcript.getByRole("button", { name: /Intermediate updates/ }).click();
  await expect(
    transcript.getByText("> Which environment?\n\nRetained answer draft", { exact: true }),
  ).toBeVisible();
  await expect(composer(page)).toHaveText("Keep my bottom draft");
});
