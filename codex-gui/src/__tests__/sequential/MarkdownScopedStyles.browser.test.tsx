import { Button, Card } from "@heroui/react";
import { assert, expect, test, vi } from "vitest";
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
import { CommittedTranscriptSurface } from "@/features/committedTranscriptSurface/CommittedTranscriptSurface";
import {
  transcriptIdentity,
  renderTranscriptWithProviders,
} from "@/features/committedTranscriptSurface/__tests__/transcriptSurfaceFixtures";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined),
      write: vi.fn<Clipboard["write"]>().mockResolvedValue(undefined),
    },
  });
});

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
          <Button variant="ghost" size="sm" data-testid="copy-reference">
            Copy reference
          </Button>
          <div data-testid="outside-colors" className="bg-muted text-muted border border-border" />
          <div data-testid="surface" className="bg-surface text-foreground border-border" />
          <div data-testid="secondary" className="bg-surface-secondary text-muted" />
          <div data-testid="focus" className="text-focus" />
          <div data-testid="table-overlay" className="bg-overlay text-foreground" />
          <div data-testid="table-control" className="bg-default text-default-foreground" />
          <div data-testid="table-close-hover" className="bg-default-hover" />
          <div data-testid="table-focus-ring" className="focus-ring" />
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
        for (const name of ["code-block", "table-wrapper"]) {
          expect(style(element(`${markdown} [data-streamdown="${name}"]`)).background).toBe(
            secondary.background,
          );
        }
        expect(
          style(element(`${markdown} [data-streamdown="code-block-actions"]`)).background,
        ).toBe("rgba(0, 0, 0, 0)");
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

      expect(
        document.querySelector(`${markdown} [data-streamdown="code-block-download-button"]`),
      ).toBeNull();
      const codeCopy = screen.getByRole("button", { name: "Copy code", exact: true });
      const actions = [
        codeCopy,
        screen.getByRole("button", { name: "Copy table", exact: true }),
        screen.getByRole("button", { name: "View fullscreen", exact: true }),
      ];
      for (const action of actions) {
        const button = action.element();
        const css = getComputedStyle(button);
        expect(button.textContent).toBe("");
        expect(css.backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(css.borderWidth).toBe("0px");
        expect(css.color).toBe(surface.color);
        expect(css.color).not.toBe(secondary.background);
        expect(button.getBoundingClientRect().width).toBe(
          codeCopy.element().getBoundingClientRect().width,
        );
        expect(button.getBoundingClientRect().height).toBe(
          codeCopy.element().getBoundingClientRect().height,
        );
        const icon = button.querySelector("svg");
        assert(icon);
        expect(getComputedStyle(icon).width).toBe("16px");
        expect(getComputedStyle(icon).height).toBe("16px");
        expect(getComputedStyle(icon).margin).toBe("0px");
        const buttonRect = button.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        expect(iconRect.left + iconRect.width / 2).toBe(buttonRect.left + buttonRect.width / 2);
        expect(iconRect.top + iconRect.height / 2).toBe(buttonRect.top + buttonRect.height / 2);
      }
      const codeActions = element('[data-streamdown="code-block-actions"]');
      expect(getComputedStyle(codeActions).borderWidth).toBe("0px");
      expect(style(codeActions).background).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(element('[data-streamdown="code-block"]')).borderWidth).toBe("1px");
      await userEvent.unhover(document.body);
      await codeCopy.hover();
      await expect.element(page.getByRole("tooltip")).toHaveTextContent("Copy code");
      await expect.poll(() => style(codeCopy.element()).color).toBe(surface.color);
      await expect
        .poll(() => style(codeCopy.element()).background)
        .toBe(reference("table-close-hover").background);
      await userEvent.tab();
      await expect.element(screen.getByTestId("outside-button")).toHaveFocus();
      await userEvent.tab();
      await expect.element(screen.getByTestId("copy-reference")).toHaveFocus();
      const copyFocusRing = getComputedStyle(
        screen.getByTestId("copy-reference").element(),
      ).boxShadow;
      expect(copyFocusRing).not.toBe("none");
      expect(copyFocusRing).toContain(reference("focus").color);
      await userEvent.tab();
      await expect.element(codeCopy).toHaveFocus();
      await expect.poll(() => getComputedStyle(codeCopy.element()).boxShadow).toBe(copyFocusRing);
      await expect.element(page.getByRole("tooltip")).toHaveTextContent("Copy code");
      await expect
        .poll(() => style(codeCopy.element()).background)
        .toBe(reference("table-close-hover").background);

      const verifyMenu = async (root: typeof screen | ReturnType<typeof page.getByRole>) => {
        await expect
          .element(root.getByRole("button", { name: "Download table", exact: true }))
          .not.toBeInTheDocument();
        const copy = root.getByRole("button", { name: "Copy table", exact: true });
        const centeredIcon = () => {
          const button = copy.element();
          const icon = button.querySelector("svg");
          assert(icon);
          const buttonRect = button.getBoundingClientRect();
          const iconRect = icon.getBoundingClientRect();
          return {
            x: iconRect.left + iconRect.width / 2 - (buttonRect.left + buttonRect.width / 2),
            y: iconRect.top + iconRect.height / 2 - (buttonRect.top + buttonRect.height / 2),
          };
        };
        expect(centeredIcon()).toEqual({ x: 0, y: 0 });
        expect(style(copy.element()).color).toBe(surface.color);
        await userEvent.unhover(document.body);
        await copy.hover();
        await expect.element(page.getByRole("tooltip")).toHaveTextContent("Copy table");
        await expect
          .poll(() => style(copy.element()).background)
          .toBe(reference("table-close-hover").background);
        await copy.click();
        const csv = page.getByRole("menuitem", { name: "CSV", exact: true });
        await expect.element(csv).toBeVisible();
        // Firefox rounds transformed DOMRects to float32 while the trigger is scaled.
        expect(centeredIcon().x).toBeCloseTo(0, 4);
        expect(centeredIcon().y).toBeCloseTo(0, 4);
        const menu = page.getByRole("menu", { name: "Copy table", exact: true });
        const popover = menu.element().closest('[data-slot="dropdown-popover"]');
        assert(popover);
        expect(style(popover).background).toBe(reference("table-overlay").background);
        expect(style(csv.element()).color).toBe(reference("table-overlay").color);
        const rect = menu.element().getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
        expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
        await csv.hover();
        await expect.element(csv).toHaveAttribute("data-hovered", "true");
        await expect
          .poll(() => style(csv.element()).background)
          .toBe(reference("table-control").background);
        await userEvent.keyboard("{Escape}");
        await expect.element(menu).not.toBeInTheDocument();
        await expect.element(copy).toHaveFocus();
      };
      await verifyMenu(screen);
      await userEvent.unhover(document.body);
      await screen.getByRole("button", { name: "View fullscreen" }).hover();
      await expect.element(page.getByRole("tooltip")).toHaveTextContent("View fullscreen");
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
      expect(style(exit.element()).color).toBe(secondary.color);
      expect(style(exit.element()).background).toBe(reference("table-control").background);
      await exit.hover();
      await expect.element(exit).toHaveAttribute("data-hovered", "true");
      await expect
        .poll(() => style(exit.element()).background)
        .toBe(reference("table-close-hover").background);
      await userEvent.keyboard("{Enter}");
      await expect
        .element(page.getByRole("menuitem", { name: "Markdown", exact: true }))
        .toHaveFocus();
      await userEvent.keyboard("{ArrowDown}");
      const csv = page.getByRole("menuitem", { name: "CSV", exact: true });
      await expect.element(csv).toHaveFocus();
      await expect.element(csv).toHaveAttribute("data-focus-visible", "true");
      const tableFocusRing = getComputedStyle(
        screen.getByTestId("table-focus-ring").element(),
      ).boxShadow;
      expect(tableFocusRing).toContain(reference("focus").color);
      await expect.poll(() => getComputedStyle(csv.element()).boxShadow).toBe(tableFocusRing);
      await userEvent.keyboard("{Escape}");
      await expect.element(dialog).toBeVisible();
      await expect
        .element(dialog.getByRole("button", { name: "Copy table", exact: true }))
        .toHaveFocus();
      await userEvent.tab({ shift: true });
      await expect.element(exit).toHaveFocus();
      await expect.poll(() => getComputedStyle(exit.element()).boxShadow).toBe(tableFocusRing);
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
