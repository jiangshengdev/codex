import { afterEach, assert, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  itemStarted,
  itemCompleted,
  reasoningItem,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemStarted,
  eventItemCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";
import { transcriptIdentity, renderTranscriptWithProviders } from "./transcriptSurfaceFixtures";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("light", "dark");
});

test.each(["light", "dark"])(
  "uses a surface background for table headings in %s theme",
  async (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.add(theme);
    const { store, ...screen } = await renderTranscriptWithProviders(
      transcriptIdentity,
      <CommittedTranscriptSurface identity={transcriptIdentity} />,
    );
    store.dispatch(
      activeThreadReadModelTransitionApplied({
        identity: transcriptIdentity,
        sessionRevision: 1,
        facts: [
          {
            type: "baselineAttached",
            response: attachWithTurns(attachBaseline, [
              baseTurn("theme", [
                agentMessage(
                  "theme-message",
                  "Use `example`.\nSecond line.\n\n| Name | Value |\n| --- | --- |\n| Theme | HeroUI |",
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
    const reference = document.createElement("div");
    reference.style.backgroundColor =
      "color-mix(in oklab, var(--surface-secondary) 80%, transparent)";
    document.body.append(reference);
    try {
      expect(getComputedStyle(header).backgroundColor).toBe(
        getComputedStyle(reference).backgroundColor,
      );
    } finally {
      reference.remove();
    }
    const inlineCode = document.querySelector("p code");
    assert(inlineCode);
    expect(getComputedStyle(inlineCode).borderTopWidth).toBe("0px");
  },
);

const source = [
  "Use `example`.",
  "Second line.",
  "",
  "```javascript",
  `const longValue = "${"long_code_".repeat(30)}";`,
  "console.log(longValue);",
  "```",
  "",
  `| ${"Wide heading ".repeat(15)} | Value |`,
  "| --- | --- |",
  "| Theme | HeroUI |",
].join("\n");

const requireElement = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  assert(element, `Missing ${selector}`);
  return element;
};

const themeColor = (value: string) => {
  const reference = document.createElement("span");
  reference.style.color = value;
  document.body.append(reference);
  const color = getComputedStyle(reference).color;
  reference.remove();
  return color;
};

test.each(["light", "dark"])(
  "preserves themed code, scrolling and fullscreen across the message lifecycle in %s",
  async (theme) => {
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.add(theme);
    try {
      await page.viewport(390, 844);
      const { store, ...screen } = await renderTranscriptWithProviders(
        transcriptIdentity,
        <CommittedTranscriptSurface identity={transcriptIdentity} />,
      );
      store.dispatch(
        activeThreadReadModelTransitionApplied({
          identity: transcriptIdentity,
          sessionRevision: 1,
          facts: [
            { type: "baselineAttached", response: attachWithTurns(attachBaseline, []) },
            {
              type: "eventAccepted",
              payload: {
                replay: "live",
                notification: itemStarted(
                  eventItemStarted,
                  "theme-start",
                  "theme",
                  agentMessage("theme-message", ""),
                ),
              },
            },
            {
              type: "deltasAccepted",
              notifications: [
                agentMessageDelta(eventAgentMessageDelta, "theme", "theme-message", source),
              ],
            },
          ],
        }),
      );
      await expect.element(screen.getByText("example", { exact: true })).toBeVisible();
      const liveBackground = getComputedStyle(requireElement("thead")).backgroundColor;
      const codeBody = requireElement('[data-streamdown="code-block-body"]');
      expect(getComputedStyle(codeBody).backgroundColor).toBe(themeColor("var(--surface)"));
      expect(getComputedStyle(requireElement('[data-streamdown="code-block-header"]')).color).toBe(
        themeColor("var(--muted)"),
      );
      expect(getComputedStyle(requireElement("p")).whiteSpace).toBe("pre-wrap");
      expect(getComputedStyle(requireElement("p code")).borderTopWidth).toBe("0px");
      expect(getComputedStyle(requireElement("p code")).backgroundColor).toBe(
        themeColor("var(--surface-secondary)"),
      );
      expect(codeBody.scrollWidth).toBeGreaterThan(codeBody.clientWidth);
      codeBody.scrollLeft = 60;
      expect(codeBody.scrollLeft).toBeGreaterThan(0);
      const codeLine = requireElement('[data-streamdown="code-block-body"] code > span');
      expect(getComputedStyle(codeLine).display).toBe("block");
      expect(["none", "normal"]).toContain(getComputedStyle(codeLine, "::before").content);
      const tableScroll = requireElement("table").parentElement;
      assert(tableScroll);
      expect(tableScroll.scrollWidth).toBeGreaterThan(tableScroll.clientWidth);
      tableScroll.scrollLeft = 60;
      expect(tableScroll.scrollLeft).toBeGreaterThan(0);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

      store.dispatch(
        activeThreadReadModelTransitionApplied({
          identity: transcriptIdentity,
          sessionRevision: 2,
          facts: [
            {
              type: "eventAccepted",
              payload: {
                replay: "live",
                notification: itemCompleted(
                  eventItemCompleted,
                  "theme-complete",
                  "theme",
                  agentMessage("theme-message", source),
                ),
              },
            },
          ],
        }),
      );
      await expect
        .poll(() => document.querySelector(".committed-transcript-live-markdown"))
        .toBeNull();
      expect(getComputedStyle(requireElement("thead")).backgroundColor).toBe(liveBackground);
      await screen.getByRole("button", { name: "View fullscreen" }).click();
      const dialog = screen.getByRole("dialog", { name: "View fullscreen" });
      await expect.element(dialog).toBeVisible();
      expect(getComputedStyle(dialog.element()).backgroundColor).toBe(themeColor("var(--surface)"));
      expect(
        getComputedStyle(requireElement('[data-streamdown="table-fullscreen"] thead'))
          .backgroundColor,
      ).toBe(liveBackground);
      const close = screen.getByRole("button", { name: "Exit fullscreen" });
      window.focus();
      close.element().focus();
      await expect.element(close).toHaveFocus();
      await userEvent.keyboard("{Enter}");
      await expect.element(dialog).not.toBeInTheDocument();
      expect(
        getComputedStyle(document.documentElement).getPropertyValue("--streamdown-muted"),
      ).toBe("");
    } finally {
      await page.viewport(originalViewport.width, originalViewport.height);
    }
  },
);

test.each(["light", "dark"])(
  "keeps completed reasoning secondary text and italic styling in %s",
  async (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.add(theme);
    const { store, ...screen } = await renderTranscriptWithProviders(
      transcriptIdentity,
      <CommittedTranscriptSurface identity={transcriptIdentity} />,
    );
    store.dispatch(
      activeThreadReadModelTransitionApplied({
        identity: transcriptIdentity,
        sessionRevision: 1,
        facts: [
          {
            type: "baselineAttached",
            response: attachWithTurns(attachBaseline, [
              baseTurn("reasoning-theme", [
                reasoningItem("reasoning", [source]),
                agentMessage("final", "Done"),
              ]),
            ]),
          },
        ],
      }),
    );
    await screen.getByRole("button", { name: /Intermediate updates/ }).click();
    await expect.element(screen.getByText("example", { exact: true })).toBeVisible();
    const paragraph = requireElement(".committed-transcript-entry-reasoning p");
    expect(getComputedStyle(paragraph).color).toBe(themeColor("var(--muted)"));
    expect(getComputedStyle(paragraph).fontStyle).toBe("italic");
    expect(getComputedStyle(requireElement("p code")).borderTopWidth).toBe("0px");
  },
);
