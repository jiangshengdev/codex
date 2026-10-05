import { expect, test } from "@playwright/test";
import { composer } from "../e2e/persistenceHarness";

test.use({ locale: "en" });

test("aligns question controls with the first text line at desktop and mobile widths", async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const { story, count, multilineCount } of [
      { story: "options", count: 3, multilineCount: 0 },
      { story: "long-text", count: 6, multilineCount: 4 },
    ]) {
      await page.goto(`/iframe.html?id=transcript-async-questions--${story}&viewMode=story`);
      const rows = page.locator('[data-slot="radio-content"]');
      await expect(rows).toHaveCount(count);
      const geometry = await rows.evaluateAll((elements) =>
        elements.map((element) => {
          const row = element.getBoundingClientRect();
          const control = element.querySelector('[data-slot="radio-control"]');
          if (!control) throw new Error("Question option is missing its radio control");
          const circle = control.getBoundingClientRect();
          const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
          return {
            offset: circle.y + circle.height / 2 - (row.y + lineHeight / 2),
            round: circle.width === circle.height && circle.width > 0,
            overflow: element.scrollWidth > element.clientWidth,
            multiline: row.height > lineHeight,
          };
        }),
      );
      for (const row of geometry) {
        expect(Math.abs(row.offset)).toBeLessThan(0.5);
        expect(row.round).toBe(true);
        expect(row.overflow).toBe(false);
      }
      expect(geometry.filter((row) => row.multiline)).toHaveLength(multilineCount);
    }
  }
});

test("keeps ordinary inputs queued while answering behind earlier guidance", async ({ page }) => {
  await page.goto("/iframe.html?id=transcript-async-question-lifecycle--queued&viewMode=story");
  const question = page.getByRole("group", { name: "Which environment?", exact: true });
  await page.getByRole("button", { name: "Queued 1", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ordinary message");
  await page.keyboard.press("Escape");
  await question.getByRole("textbox").fill("Behind guidance");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  const confirm = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  await confirm.click();
  const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
  await transcript.getByRole("button", { name: /Intermediate updates/ }).click();
  await expect(transcript.getByText("Earlier guidance", { exact: true })).toBeVisible();
  await expect(transcript).not.toContainText("> Which environment?");
  await confirm.click();
  await expect(
    transcript.getByText("> Which environment?\n\nBehind guidance", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate turn completion", exact: true }).click();
  await confirm.click();
  await expect(transcript.getByText("Ordinary message", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
  await expect(composer(page)).toHaveText("Keep my bottom draft");
});

test("retains a live question after turn completion and answers in a subsequent turn", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=transcript-async-question-lifecycle--idle&viewMode=story");
  const question = page.getByRole("group", { name: "Which environment?", exact: true });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  await question.getByRole("textbox").fill("After completion");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
  await expect(
    transcript.getByText("> Which environment?\n\nAfter completion", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await expect(composer(page)).toHaveText("Keep my bottom draft");
});

test("answers a live question without sending the bottom draft before runtime confirmation", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=transcript-async-questions--plain-text&viewMode=story");
  const question = page.getByRole("group", { name: "Which environment?", exact: true });
  await expect(question.getByRole("button", { name: "Submit answer", exact: true })).toBeDisabled();
  await expect(composer(page)).toHaveText("Keep my bottom draft");
  await question.getByRole("textbox", { name: "Answer", exact: true }).fill("Staging");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  await expect(question.getByRole("textbox")).toHaveCount(0);
  const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
  await expect(
    transcript.getByText("> Which environment?\n\nStaging", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await transcript.getByRole("button", { name: /Intermediate updates/ }).click();
  await expect(
    transcript.getByText("> Which environment?\n\nStaging", { exact: true }),
  ).toBeVisible();
  await expect(composer(page)).toHaveText("Keep my bottom draft");
});

test("options remain explicit and retain a custom draft while changing selection", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=transcript-async-questions--options&viewMode=story");
  const question = page.getByRole("group", { name: "Which environment?", exact: true });
  const answer = question.getByRole("textbox", { name: "Answer", exact: true });
  const submit = question.getByRole("button", { name: "Submit answer", exact: true });
  await expect(question.getByRole("radio", { name: "Preview", exact: true })).toBeChecked();
  await expect(submit).toBeEnabled();
  const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
  await expect(transcript).not.toContainText("> Which environment?");
  await question.getByText("Custom answer", { exact: true }).click();
  await answer.fill("   ");
  await expect(submit).toBeDisabled();
  await answer.fill("Canary");
  await expect(question.getByRole("radio", { name: "Custom answer", exact: true })).toBeChecked();
  await question.getByText("Production", { exact: true }).click();
  await expect(answer).toHaveValue("Canary");
  await submit.click();
  await expect(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await transcript.getByRole("button", { name: /Intermediate updates/ }).click();
  await expect(
    transcript.getByText("> Which environment?\n\nProduction", { exact: true }),
  ).toBeVisible();
  await expect(transcript).not.toContainText("Canary");
  await expect(composer(page)).toHaveText("Keep my bottom draft");
});

test("answers multiple questions out of order and skips only the selected question", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=transcript-async-questions--multiple&viewMode=story");
  const environment = page.getByRole("group", { name: "Which environment?", exact: true });
  const region = page.getByRole("group", { name: "Which region?", exact: true });
  const notes = page.getByRole("group", { name: "Any extra notes?", exact: true });
  await environment.getByRole("textbox").fill("Canary");
  await environment.getByText("Production", { exact: true }).click();
  await environment.getByText("Custom answer", { exact: true }).click();
  await expect(environment.getByRole("textbox")).toHaveValue("Canary");
  await region.getByRole("textbox").fill("Europe");
  await notes.getByRole("textbox").fill("Do not send this");
  await notes.getByRole("button", { name: "Skip question", exact: true }).click();
  await expect(notes.getByText("Question skipped", { exact: true })).toBeVisible();
  await region.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect(environment.getByRole("textbox")).toHaveValue("Canary");
  await expect(region.getByRole("textbox")).toHaveCount(0);
  await environment.getByRole("button", { name: "Submit answer", exact: true }).click();
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  const transcript = page.getByRole("region", { name: "Committed transcript", exact: true });
  await transcript.getByRole("button", { name: /Intermediate updates/ }).click();
  await expect(transcript.getByText("> Which region?\n\nEurope", { exact: true })).toBeVisible();
  await expect(transcript).not.toContainText("> Which environment?");
  await page.getByRole("button", { name: "Simulate runtime confirmation", exact: true }).click();
  await expect(
    transcript.getByText("> Which environment?\n\nCanary", { exact: true }),
  ).toBeVisible();
  await expect(transcript).not.toContainText("Do not send this");
  await expect(composer(page)).toHaveText("Keep my bottom draft");
});
