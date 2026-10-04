import { expect, test, type Page } from "@playwright/test";
import {
  activeRow,
  continueSecondTask,
  firstThreadId,
  openMenu,
  secondThreadId,
  selectTask,
} from "./multiSessionHarness";
import {
  createdThreadId,
  createNewSessionHarness,
  openNewSession,
  originalCwd,
  otherCwd,
  retriedThreadId,
  sendNewSession,
} from "./newSessionHarness";
import { composer, ready, settledRender, submit } from "./persistenceHarness";

async function expectOriginalDirectory(page: Page) {
  await page.getByRole("button", { name: /^Working directory:/ }).click();
  const dialog = page.getByRole("dialog", { name: "Working directory", exact: true });
  await expect(dialog.getByText(originalCwd, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

test("opening and editing creates nothing; the first send creates, attaches and transfers input once", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page);
  await host.open();
  await openNewSession(page);
  await expectOriginalDirectory(page);
  await composer(page).fill("First new-session message");
  await settledRender(page);
  expect(host.starts()).toHaveLength(0);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/task/${createdThreadId}$`));
  await ready(page);
  await expect.poll(() => host.sends(createdThreadId).length).toBe(1);
  expect(host.starts()).toHaveLength(1);
  expect(host.starts()[0]?.params).toEqual({ cwd: originalCwd });
  expect(host.resumes(createdThreadId)).toHaveLength(0);
  expect(host.attachments(createdThreadId)).toHaveLength(1);
  expect(host.sends(createdThreadId)[0]?.params).toMatchObject({
    input: [{ type: "text", text: "First new-session message" }],
  });
  await expect(composer(page)).toHaveText("");
  await openNewSession(page);
  await expect(composer(page)).toHaveText("");
  expect(host.starts()).toHaveLength(1);
});

test("one draft keeps its original directory after viewing a task from another directory", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page);
  await host.open();
  await continueSecondTask(page);
  // Model a task introduced by the TUI in another directory, then attach its current state.
  host.setThreadCwd(secondThreadId, otherCwd);
  await page.reload();
  await ready(page);
  await selectTask(page, firstThreadId);
  await openNewSession(page);
  await composer(page).fill("Draft bound to its first directory");
  await selectTask(page, secondThreadId);
  await openNewSession(page);
  await expect(composer(page)).toHaveText("Draft bound to its first directory");
  await expectOriginalDirectory(page);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/task/${createdThreadId}$`));
  expect(host.starts()[0]?.params).toEqual({ cwd: originalCwd });
});

test("reload drops the uncreated draft while restoring both existing collection members", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page);
  await host.open();
  await continueSecondTask(page);
  await openNewSession(page);
  await composer(page).fill("Do not persist this uncreated input");
  await settledRender(page);
  await page.reload();
  await expect(page).toHaveURL(/\/new$/);
  await expect(composer(page)).toHaveText("");
  await expectOriginalDirectory(page);
  await openMenu(page);
  await expect(activeRow(page, firstThreadId)).toBeVisible();
  await expect(activeRow(page, secondThreadId)).toBeVisible();
  expect(host.starts()).toHaveLength(0);
  expect(host.sends(firstThreadId)).toHaveLength(0);
  expect(host.sends(secondThreadId)).toHaveLength(0);
});

test("the old task continues its queued input while the new-session draft stays open", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page, true);
  await host.open();
  await submit(page, "Old task queued message");
  await openNewSession(page);
  await composer(page).fill("Independent new draft");
  host.finish(firstThreadId);
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
  await expect(page).toHaveURL(/\/new$/);
  await expect(composer(page)).toHaveText("Independent new draft");
  expect(host.starts()).toHaveLength(0);
  expect(host.detaches()).toHaveLength(0);
});

test("an unknown creation keeps input and sends no turn until an explicit retry", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page);
  host.setStartMode("invalid");
  await host.open();
  await openNewSession(page);
  await sendNewSession(page, "Retained after unknown creation");
  await expect(
    page.getByText("The creation result is unknown. Retrying may leave an extra empty session.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(composer(page)).toHaveText("Retained after unknown creation");
  expect(host.starts()).toHaveLength(1);
  expect(host.attachments(createdThreadId)).toHaveLength(0);
  expect(host.sends(createdThreadId)).toHaveLength(0);
  host.setStartMode("reply");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/task/${retriedThreadId}$`));
  await expect.poll(() => host.sends(retriedThreadId).length).toBe(1);
  expect(host.starts()).toHaveLength(2);
  expect(host.sends(createdThreadId)).toHaveLength(0);
});

test("an attachment failure retries the known identity without creating again", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page);
  host.setAttachMode(createdThreadId, "error");
  await host.open();
  await openNewSession(page);
  await sendNewSession(page, "Retry the existing new session");
  await expect(
    page.getByText("Your input is retained. Retry to continue.", { exact: true }),
  ).toBeVisible();
  await expect(composer(page)).toHaveText("Retry the existing new session");
  expect(host.starts()).toHaveLength(1);
  expect(host.sends(createdThreadId)).toHaveLength(0);
  host.setAttachMode(createdThreadId, "hold");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending", exact: true })).toBeDisabled();
  await expect(
    page.getByText("Your input is retained. Retry to continue.", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => host.attachments(createdThreadId).length).toBe(2);
  await page.keyboard.press("Enter");
  await settledRender(page);
  expect(host.attachments(createdThreadId)).toHaveLength(2);
  expect(host.starts()).toHaveLength(1);
  host.releaseAttachment(createdThreadId);
  await expect(page).toHaveURL(new RegExp(`/task/${createdThreadId}$`));
  await expect.poll(() => host.sends(createdThreadId).length).toBe(1);
  expect(host.starts()).toHaveLength(1);
  expect(host.attachments(createdThreadId)).toHaveLength(2);
});

test("a lost creation response preserves input across connection replacement and requires explicit retry", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page);
  host.setStartMode("disconnect");
  await host.open();
  await openNewSession(page);
  await sendNewSession(page, "Keep input after the creation socket closes");
  await expect(composer(page)).toHaveText("Keep input after the creation socket closes");
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(
    page.getByText("Connect to Codex to send this draft.", { exact: true }),
  ).toBeHidden();
  expect(host.starts()).toHaveLength(1);
  expect(host.attachments(createdThreadId)).toHaveLength(0);
  expect(host.sends(createdThreadId)).toHaveLength(0);

  const initialized = host.requests.filter(({ method }) => method === "initialize").length;
  host.setStartMode("reply");
  // Exercise production lifecycle reconnection, not browser eligibility for real BFCache.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect
    .poll(() => host.requests.filter(({ method }) => method === "initialize").length)
    .toBe(initialized + 1);
  await expect(composer(page)).toHaveText("Keep input after the creation socket closes");
  await expect(
    page.getByText("The creation result is unknown. Retrying may leave an extra empty session.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  await settledRender(page);
  expect(host.starts()).toHaveLength(1);
  expect(host.sends(createdThreadId)).toHaveLength(0);
  expect(host.sends(retriedThreadId)).toHaveLength(0);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/task/${retriedThreadId}$`));
  await expect.poll(() => host.sends(retriedThreadId).length).toBe(1);
  expect(host.starts()).toHaveLength(2);
  expect(host.sends(createdThreadId)).toHaveLength(0);
  expect(host.sends(retriedThreadId)[0]?.params).toMatchObject({
    input: [{ type: "text", text: "Keep input after the creation socket closes" }],
  });
});

type NewSessionHarness = Awaited<ReturnType<typeof createNewSessionHarness>>;

const delayedResponses = [
  {
    waitingFor: "creation",
    configure: (host: NewSessionHarness) => {
      host.setStartMode("hold");
    },
    requestCount: (host: NewSessionHarness) => {
      return host.starts().length;
    },
    release: (host: NewSessionHarness) => {
      host.releaseStart();
    },
    expectedAttachments: 0,
  },
  {
    waitingFor: "attachment",
    configure: (host: NewSessionHarness) => {
      host.setAttachMode(createdThreadId, "hold");
    },
    requestCount: (host: NewSessionHarness) => {
      return host.attachments(createdThreadId).length;
    },
    release: (host: NewSessionHarness) => {
      host.releaseAttachment(createdThreadId);
    },
    expectedAttachments: 1,
  },
];

for (const {
  waitingFor,
  configure,
  requestCount,
  release,
  expectedAttachments,
} of delayedResponses) {
  test(`leaving during ${waitingFor} prevents late navigation and input delivery`, async ({
    page,
  }) => {
    const host = await createNewSessionHarness(page);
    configure(host);
    await host.open();
    await openNewSession(page);
    await sendNewSession(page, `Keep input during ${waitingFor}`);
    await expect.poll(() => requestCount(host)).toBe(1);
    await selectTask(page, firstThreadId);
    release(host);
    await settledRender(page);
    await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
    expect(host.sends(createdThreadId)).toHaveLength(0);
    expect(host.sends(firstThreadId)).toHaveLength(0);
    expect(host.attachments(createdThreadId)).toHaveLength(expectedAttachments);
    await openNewSession(page);
    await expect(composer(page)).toHaveText(`Keep input during ${waitingFor}`);
    host.setAttachMode(createdThreadId, null);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/task/${createdThreadId}$`));
    await expect.poll(() => host.sends(createdThreadId).length).toBe(1);
    expect(host.starts()).toHaveLength(1);
  });
}

test("an unknown first send belongs to the existing queue and cannot recreate the draft", async ({
  page,
}) => {
  const host = await createNewSessionHarness(page, false, false);
  await host.open();
  await openNewSession(page);
  await sendNewSession(page, "First send acknowledgement is lost");
  await expect(page).toHaveURL(new RegExp(`/task/${createdThreadId}$`));
  await expect.poll(() => host.sends(createdThreadId).length).toBe(1);
  await page.reload();
  await ready(page);
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await openNewSession(page);
  await expect(composer(page)).toHaveText("");
  expect(host.starts()).toHaveLength(1);
  expect(host.sends(createdThreadId)).toHaveLength(1);
});
