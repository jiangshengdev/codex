import { expect, test, type Page } from "@playwright/test";
import type { UserInput } from "@codex-protocol/v2";
import { FILE_PREVIEW_PATH, UPLOAD_PATH, WEBSOCKET_PATH } from "@codex-gui-host-contract";

test.use({ locale: "en" });

test("local file selection and the skill menu feed the real first send without business network", async ({
  page,
}) => {
  const businessRequests: string[] = [];
  page.on("request", (request) => {
    if (
      [FILE_PREVIEW_PATH, UPLOAD_PATH, WEBSOCKET_PATH].some(
        (path) => path === new URL(request.url()).pathname,
      )
    )
      businessRequests.push(request.url());
  });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname === WEBSOCKET_PATH) businessRequests.push(socket.url());
  });
  await page.goto("/iframe.html?id=new-session-flow--interactive&viewMode=story");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("$preview");
  await page.getByRole("option", { name: /preview-review/ }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "fictional-local.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Fictional notes"),
  });
  await expect(editor.getByRole("status")).toHaveText(["Uploaded"]);
  await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
    "data-new-session-input",
    /fictional-local\.txt/,
  );
  await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
    "data-new-session-input",
    /"type":"skill","name":"preview-review"/,
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
  expect(businessRequests).toEqual([]);
});

test("mixed initial input waits for uploads and sends text, file, image and skill once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/iframe.html?id=new-session-inputs--mixed-uploading&viewMode=story");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("review-notes.txt");
  await expect(editor).toContainText("sample.png");
  await expect(editor).toContainText("preview-review");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await editor.press("Enter");
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "0",
  );
  await page.getByRole("button", { name: "Complete upload review-notes.txt", exact: true }).click();
  await page.getByRole("button", { name: "Complete upload sample.png", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
  await expectMixedInput(page);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

async function expectMixedInput(page: Page) {
  await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
    "data-new-session-input",
    /review-notes\.txt/,
  );
  const input = JSON.parse(
    (await page.locator("[data-new-session-input]").getAttribute("data-new-session-input")) ??
      "null",
  ) as UserInput[];
  expect(input).toEqual([
    {
      type: "text",
      text: expect.stringMatching(
        /^Review the fictional project\.\$preview-review\s*\/storybook\/attachments\/[^/]+\/review-notes\.txt \/storybook\/attachments\/[^/]+\/sample\.png$/,
      ),
      text_elements: [
        {
          byteRange: { start: expect.any(Number), end: expect.any(Number) },
          placeholder: "review-notes.txt",
        },
        {
          byteRange: { start: expect.any(Number), end: expect.any(Number) },
          placeholder: "sample.png",
        },
      ],
    },
    {
      type: "localImage",
      path: expect.stringMatching(/^\/storybook\/attachments\/[^/]+\/sample\.png$/),
    },
    { type: "skill", name: "preview-review", path: "/storybook/skills/preview-review/SKILL.md" },
  ]);
  const text = input[0];
  if (text?.type !== "text") throw new Error("Expected the first input to be text");
  const bytes = new TextEncoder().encode(text.text);
  for (const [element, path] of [
    [text.text_elements[0], /^\/storybook\/attachments\/[^/]+\/review-notes\.txt$/],
    [text.text_elements[1], /^\/storybook\/attachments\/[^/]+\/sample\.png$/],
  ] as const) {
    if (element == null) throw new Error("Expected an attachment text element");
    expect(
      new TextDecoder().decode(bytes.slice(element.byteRange.start, element.byteRange.end)),
    ).toMatch(path);
  }
}

async function expectRetainedMixedInput(page: Page) {
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("review-notes.txt");
  await expect(editor).toContainText("sample.png");
  await expect(editor).toContainText("preview-review");
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "0",
  );
}

async function expectMixedRetryResult(page: Page, starts: string) {
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    starts,
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
  await expectMixedInput(page);
}

for (const failure of ["creation-failed", "creation-unknown", "activation-failed"]) {
  test(`mixed ${failure} retains all input through explicit retry`, async ({ page }) => {
    await page.goto(`/iframe.html?id=new-session-mixed-recovery--${failure}&viewMode=story`);
    await expect(page.getByRole("alert")).toContainText(
      failure === "creation-unknown"
        ? "The creation result is unknown. Retrying may leave an extra empty session."
        : "Your input is retained. Retry to continue.",
    );
    await expectRetainedMixedInput(page);
    await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
    await expectMixedRetryResult(page, failure.startsWith("creation") ? "2" : "1");
  });
}

test("mixed handoff-rejected retains all input through explicit retry", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-mixed-recovery--handoff-rejected&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("Your input is retained. Retry to continue.");
  await expectRetainedMixedInput(page);
  await page.getByRole("button", { name: "Simulate storage recovery", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
  await expectMixedRetryResult(page, "1");
});

test("mixed unknown handoff blocks another send and opens the existing task", async ({ page }) => {
  await page.goto("/iframe.html?id=new-session-mixed-recovery--handoff-unknown&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("Input handoff could not be confirmed.");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect(editor).toContainText("review-notes.txt");
  await expect(editor).toContainText("sample.png");
  await expect(editor).toContainText("preview-review");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Open session", exact: true }).press("Enter");
  await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
    "data-new-session-route",
    "/task/00000000-0000-0000-0000-000000000138",
  );
  await expect(page.locator("[data-new-session-starts]")).toHaveAttribute(
    "data-new-session-starts",
    "1",
  );
  await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
    "data-new-session-sends",
    "1",
  );
});

for (const [kind, tokens] of [
  ["skill", ["preview-review"]],
  ["file", ["review-notes.txt"]],
  ["image", ["sample.png"]],
  ["mixed", ["preview-review", "review-notes.txt", "sample.png"]],
] as const) {
  test(`${kind} preset is ready for the real new-session send`, async ({ page }) => {
    await page.goto(`/iframe.html?id=new-session-inputs--${kind}&viewMode=story`);
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect(editor).toContainText("Review the fictional project.");
    for (const token of tokens) await expect(editor).toContainText(token);
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
    await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
      "data-new-session-route",
      "/task/00000000-0000-0000-0000-000000000138",
    );
    await expect(page.locator("[data-new-session-sends]")).toHaveAttribute(
      "data-new-session-sends",
      "1",
    );
    for (const token of tokens)
      await expect(page.locator("[data-new-session-input]")).toHaveAttribute(
        "data-new-session-input",
        new RegExp(token.replace(".", "\\.")),
      );
  });
}

test.describe("Chinese mixed recovery", () => {
  test.use({ locale: "zh-CN", colorScheme: "dark" });

  test("narrow recovery retains attachments and reaches the task page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/iframe.html?id=new-session-mixed-recovery--activation-failed&viewMode=story");
    await expect(page.getByRole("alert")).toContainText("输入内容已保留。重试以继续。");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.getByRole("button", { name: "发送", exact: true }).press("Enter");
    await expect(page.locator("[data-new-session-route]")).toHaveAttribute(
      "data-new-session-route",
      "/task/00000000-0000-0000-0000-000000000138",
    );
    await expectMixedInput(page);
  });
});
