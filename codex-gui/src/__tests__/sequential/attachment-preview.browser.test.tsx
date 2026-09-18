import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  attachResponse,
  emitProjectionEvent,
  launchThreadId,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "@/__tests__/appBrowserTestSupport";
import {
  attachmentFileInput,
  renderActiveComposerQueueApp,
  steerTurnParamsAt,
} from "@/__tests__/appComposerQueueBrowserTestSupport";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { eventItemCompleted } from "@/features/projection/__tests__/projectionFixtures";
import {
  eventWithEnvelope,
  itemCompleted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));
vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });
const startHost = host.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

beforeEach(() => {
  resetAppBrowserTestSupport(startHost);
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(1280, 720);
});

test.each([
  { width: 2400, height: 1200, name: "landscape.png" },
  { width: 1200, height: 2400, name: "portrait.png" },
  { width: 80, height: 60, name: "small-image-with-a-long-original-filename-".repeat(5) + ".png" },
])(
  "$width × $height images fit and center in draft and sent previews",
  async ({ width, height, name }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context == null) throw new Error("Missing canvas context");
    context.fillStyle = "#287ac4";
    context.fillRect(0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("Missing PNG"));
      }, "image/png");
    });
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) =>
      Promise.resolve(
        options?.method === "POST"
          ? new Response("/tmp/preview.png", { status: 201 })
          : new Response(blob, { headers: { "Content-Type": "image/png" } }),
      ),
    );
    const { screen, composer, steerTurn, activeTurn, options } =
      await renderActiveComposerQueueApp(startHost);
    await attachmentFileInput(screen.container).upload(
      new File([blob], name, { type: "image/png" }),
    );
    for (const viewportWidth of [1600, 400]) {
      await page.viewport(viewportWidth, 876);
      const preview = composer.getByRole("button", { name: `Preview ${name}`, exact: true });
      const remove = composer.getByRole("button", { name: `Remove ${name}`, exact: true });
      await expect.element(preview).toBeVisible();
      const bounds = remove.element().getBoundingClientRect();
      expect(bounds.right).toBeLessThanOrEqual(viewportWidth);
      expect(preview.element().getBoundingClientRect().right).toBeCloseTo(bounds.left, 3);
    }
    for (const entry of ["draft", "sent"]) {
      const owner =
        entry === "draft" ? composer : screen.getByRole("region", { name: "Committed transcript" });
      const trigger = owner.getByRole("button", { name: `Preview ${name}`, exact: true });
      for (const [viewportWidth, viewportHeight] of [
        [1600, 1000],
        [400, 876],
      ] as const) {
        await page.viewport(viewportWidth, viewportHeight);
        await expect.element(trigger).toBeVisible();
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewportWidth);
        await trigger.click();
        const dialog = screen.getByRole("dialog", { name, exact: true });
        const image = dialog.getByRole("img", { name, exact: true });
        await expect.element(image).toBeVisible();
        await expect
          .poll(
            () =>
              dialog
                .element()
                .parentElement?.getAnimations({ subtree: true })
                .filter((animation) => animation.playState === "running").length,
          )
          .toBe(0);
        // WebKit can expose the final composited zoom frame after the animation finishes.
        await expect
          .poll(() => image.element().getBoundingClientRect().width)
          .toBeLessThanOrEqual(width);
        await expect
          .poll(() => image.element().getBoundingClientRect().height)
          .toBeLessThanOrEqual(height);
        await expect
          .poll(() => {
            const rect = image.element().getBoundingClientRect();
            const bounds = dialog.element().getBoundingClientRect();
            return Math.abs(rect.left + rect.width / 2 - bounds.left - bounds.width / 2);
          })
          .toBeLessThanOrEqual(1);
        const rect = image.element().getBoundingClientRect();
        const bounds = dialog.element().getBoundingClientRect();
        const content = image.element().parentElement?.getBoundingClientRect();
        if (content == null) throw new Error("Missing preview content region");
        expect(content.left - bounds.left).toBeCloseTo(24, 0);
        expect(bounds.right - content.right).toBeCloseTo(24, 0);
        expect(bounds.bottom - rect.bottom).toBeCloseTo(24, 0);
        expect(
          Math.abs(rect.top + rect.height / 2 - content.top - content.height / 2),
        ).toBeLessThanOrEqual(1);
        expect(rect.width).toBeLessThanOrEqual(width);
        expect(rect.height).toBeLessThanOrEqual(height);
        expect(rect.width / rect.height).toBeCloseTo(width / height, 2);
        expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
        expect(rect.right).toBeLessThanOrEqual(bounds.right);
        expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom);
        expect(bounds.left).toBeGreaterThanOrEqual(12);
        expect(bounds.right).toBeLessThanOrEqual(viewportWidth - 12);
        expect(bounds.top).toBeGreaterThanOrEqual(12);
        expect(bounds.bottom).toBeLessThanOrEqual(viewportHeight - 12);
        const minimumWidth =
          width === 80 ? 80 : viewportWidth === 1600 && width > height ? 1200 : 250;
        const minimumHeight =
          height === 60 ? 60 : viewportWidth === 1600 && height > width ? 750 : 100;
        expect(rect.width).toBeGreaterThanOrEqual(minimumWidth);
        expect(rect.height).toBeGreaterThanOrEqual(minimumHeight);
        const heading = dialog
          .getByRole("heading", { name, exact: true })
          .element()
          .getBoundingClientRect();
        const close = dialog.getByRole("button", { name: "Close image preview" });
        await expect.element(close).toBeVisible();
        expect(heading.bottom).toBeLessThanOrEqual(rect.top);
        expect(heading.right).toBeLessThanOrEqual(close.element().getBoundingClientRect().left);
        await userEvent.keyboard("{Escape}");
        await expect.element(trigger).toHaveFocus();
      }
      if (entry === "draft") {
        await screen.getByRole("button", { name: "Guide", exact: true }).click();
        await vi.waitFor(() => {
          if (steerTurn.mock.calls.length !== 1) throw new Error("Image submission not received");
        });
        const params = steerTurnParamsAt(steerTurn, 0);
        emitProjectionEvent(
          options,
          eventWithEnvelope(
            itemCompleted(
              eventItemCompleted,
              "preview-commit",
              activeTurn.id,
              userMessage("preview-message", params.input, params.clientUserMessageId),
            ),
            { parentCommitId: attachResponse.snapshot.headCommitId },
          ),
        );
      }
    }
  },
);
