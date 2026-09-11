import { Button, Card } from "@heroui/react";
import { assert, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  itemCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { disableMotionForTest } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";
import { transcriptIdentity, renderTranscriptWithProviders } from "./transcriptSurfaceFixtures";

test.for(["light", "dark"])("uses HeroUI surfaces for table headers in %s theme", async (theme) => {
  const previousTheme = document.documentElement.getAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", theme);
  try {
    const { store, ...screen } = await renderTranscriptWithProviders(
      transcriptIdentity,
      <>
        <div data-testid="surface-reference" className="bg-surface-secondary" />
        <CommittedTranscriptSurface identity={transcriptIdentity} />
      </>,
    );
    store.dispatch(
      activeThreadReadModelTransitionApplied({
        identity: transcriptIdentity,
        sessionRevision: 1,
        facts: [
          {
            type: "baselineAttached",
            response: attachWithTurns(attachBaseline, [
              baseTurn("theme-turn", [
                agentMessage(
                  "theme-message",
                  "| Name | Value |\n| --- | --- |\n| sample | result |",
                ),
              ]),
            ]),
          },
        ],
      }),
    );
    await expect.element(screen.getByText("Name", { exact: true })).toBeVisible();
    const header = document.querySelector("thead");
    assert(header);
    expect(getComputedStyle(header).backgroundColor).toBe(
      getComputedStyle(screen.getByTestId("surface-reference").element()).backgroundColor,
    );
  } finally {
    if (previousTheme === null) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", previousTheme);
  }
});

test.for(["light", "dark"])(
  "keeps rich text local through streaming and fullscreen in %s theme",
  async (theme) => {
    const restoreMotion = disableMotionForTest();
    const previousTheme = document.documentElement.getAttribute("data-theme");
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };
    document.documentElement.setAttribute("data-theme", theme);
    try {
      await page.viewport(390, 844);
      const { store, ...screen } = await renderTranscriptWithProviders(
        transcriptIdentity,
        <>
          <Card data-testid="outside-card">
            <Card.Content>Outside content</Card.Content>
          </Card>
          <Button variant="secondary" data-testid="outside-button">
            Outside action
          </Button>
          <div data-testid="outside-colors" className="bg-muted text-muted border border-border" />
          <div data-testid="surface" className="bg-surface text-foreground border-border" />
          <div data-testid="secondary" className="bg-surface-secondary text-muted" />
          <div data-testid="focus" className="text-focus" />
          <CommittedTranscriptSurface identity={transcriptIdentity} />
        </>,
      );
      const style = (node: Element) => {
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, color: css.color, border: css.borderColor };
      };
      const reference = (name: string) => style(screen.getByTestId(name).element());
      const outside = () => ["outside-card", "outside-button", "outside-colors"].map(reference);
      const before = outside();
      const surface = reference("surface");
      const secondary = reference("secondary");
      const outsideColors = before[2];
      assert(outsideColors);
      expect(outsideColors.background).toBe(outsideColors.color);
      expect(outsideColors.color).toBe(secondary.color);
      let revision = 0;
      const dispatch = (
        facts: Parameters<typeof activeThreadReadModelTransitionApplied>[0]["facts"],
      ) =>
        store.dispatch(
          activeThreadReadModelTransitionApplied({
            identity: transcriptIdentity,
            sessionRevision: ++revision,
            facts,
          }),
        );
      dispatch([{ type: "baselineAttached", response: attachWithTurns(attachBaseline, []) }]);
      const source = [
        "Before `inline value` after.\nKeep this newline.",
        "> Quoted note",
        "```js\nconst message = 'a deliberately long code line that should scroll within its own container';\nconsole.log(message);\n```",
        `| ${"LongColumn".repeat(8)} | Value |\n| --- | --- |\n| sample | result |`,
      ].join("\n\n");
      dispatch([
        {
          type: "eventAccepted",
          payload: {
            replay: "live",
            notification: itemStarted(
              eventItemStarted,
              "style-start",
              "style-turn",
              agentMessage("style-message", ""),
            ),
          },
        },
      ]);
      dispatch([
        {
          type: "deltasAccepted",
          notifications: [
            agentMessageDelta(eventAgentMessageDelta, "style-turn", "style-message", source),
          ],
        },
      ]);
      await expect.element(screen.getByText("inline value", { exact: true })).toBeVisible();
      const element = (selector: string) => {
        const node = document.querySelector<HTMLElement>(selector);
        assert(node, `Expected rendered ${selector}`);
        return node;
      };
      const markdown = ".committed-transcript-entry-markdown";
      const verifyRichText = async () => {
        const inline = element(`${markdown} p code`);
        expect(inline.dataset.streamdown).toBe("inline-code");
        expect(style(inline).background).toBe(secondary.background);
        expect(getComputedStyle(inline).borderTopWidth).toBe("0px");
        expect(getComputedStyle(element(`${markdown} p`)).whiteSpace).toBe("pre-wrap");
        expect(style(element(`${markdown} blockquote`)).color).toBe(secondary.color);
        for (const name of ["code-block", "code-block-actions", "table-wrapper"]) {
          expect(style(element(`${markdown} [data-streamdown="${name}"]`)).background).toBe(
            secondary.background,
          );
        }
        expect(style(element(`${markdown} [data-streamdown="code-block-header"]`)).color).toBe(
          secondary.color,
        );
        const code = element(`${markdown} [data-streamdown="code-block-body"]`);
        const table = element(`${markdown} table`);
        assert(table.parentElement);
        for (const scroller of [code, table.parentElement]) {
          expect(style(scroller).background).toBe(surface.background);
          expect(style(scroller).border).toBe(surface.border);
          expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
          scroller.scrollTo({ left: scroller.scrollWidth, behavior: "instant" });
          await expect.poll(() => scroller.scrollLeft).toBeGreaterThan(0);
        }
        expect(getComputedStyle(element(`${markdown} pre code > span`), "::before").content).toBe(
          "none",
        );
        expect(element(`${markdown} pre`).textContent).toContain("console.log(message)");
        expect(document.querySelector("[data-sd-animate]")).toBeNull();
        expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
        expect(outside()).toEqual(before);
      };
      await verifyRichText();
      await expect.element(screen.getByRole("button", { name: "View fullscreen" })).toBeDisabled();
      dispatch([
        {
          type: "eventAccepted",
          payload: {
            replay: "live",
            notification: itemCompleted(
              eventItemCompleted,
              "style-complete",
              "style-turn",
              agentMessage("style-message", source),
            ),
          },
        },
      ]);
      await expect
        .poll(() => document.querySelector(".committed-transcript-live-markdown"))
        .toBeNull();
      await verifyRichText();

      const codeDownload = page.elementLocator(
        element(`${markdown} [data-streamdown="code-block-download-button"]`),
      );
      expect(style(codeDownload.element()).color).toBe(secondary.color);
      await codeDownload.hover();
      await expect.poll(() => style(codeDownload.element()).color).toBe(surface.color);
      // Enter keyboard modality, then focus the native control. WebKit's Tab policy skips
      // native buttons by default; that platform preference is not a rich-text contract.
      await userEvent.tab();
      codeDownload.element().focus();
      await expect.element(codeDownload).toHaveFocus();
      await expect
        .poll(() => getComputedStyle(codeDownload.element()).outlineColor)
        .toBe(reference("focus").color);
      expect(getComputedStyle(codeDownload.element()).outlineStyle).toBe("solid");

      const verifyMenu = async (root: typeof screen | ReturnType<typeof page.getByRole>) => {
        const download = root.getByRole("button", { name: "Download table", exact: true });
        expect(style(download.element()).color).toBe(secondary.color);
        await download.hover();
        await expect.poll(() => style(download.element()).color).toBe(surface.color);
        await download.click();
        const csv = root.getByRole("button", { name: "CSV", exact: true });
        await expect.element(csv).toBeVisible();
        const menu = csv.element().parentElement;
        assert(menu);
        expect(style(menu).background).toBe(surface.background);
        expect(style(csv.element()).color).toBe(surface.color);
        await csv.hover();
        await expect.poll(() => style(csv.element()).background).toBe(secondary.background);
        await download.click();
      };
      await verifyMenu(screen);
      await screen.getByRole("button", { name: "View fullscreen" }).click();
      const dialog = page.getByRole("dialog", { name: "View fullscreen" });
      await expect.element(dialog).toBeVisible();
      expect(style(dialog.element()).background).toBe(surface.background);
      expect(style(element('[data-streamdown="table-fullscreen"] thead')).background).toBe(
        secondary.background,
      );
      expect(outside()).toEqual(before);
      await verifyMenu(dialog);
      const exit = dialog.getByRole("button", { name: "Exit fullscreen" });
      await exit.hover();
      await expect.poll(() => style(exit.element()).background).toBe(secondary.background);
      await dialog.getByRole("button", { name: "Download table", exact: true }).click();
      const csv = dialog.getByRole("button", { name: "CSV", exact: true });
      await userEvent.tab();
      csv.element().focus();
      await expect.element(csv).toHaveFocus();
      expect(getComputedStyle(csv.element()).outlineStyle).toBe("solid");
      await expect
        .poll(() => getComputedStyle(csv.element()).outlineColor)
        .toBe(reference("focus").color);
      await dialog.getByRole("button", { name: "Download table", exact: true }).click();
      await userEvent.tab();
      exit.element().focus();
      await expect.element(exit).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await expect.element(dialog).not.toBeInTheDocument();
      expect(outside()).toEqual(before);
      dispatch([{ type: "baselineAttached", response: attachWithTurns(attachBaseline, []) }]);
      await expect
        .element(screen.getByText("inline value", { exact: true }))
        .not.toBeInTheDocument();
      expect(outside()).toEqual(before);
    } finally {
      restoreMotion();
      if (previousTheme === null) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", previousTheme);
      await page.viewport(originalViewport.width, originalViewport.height);
    }
  },
);
