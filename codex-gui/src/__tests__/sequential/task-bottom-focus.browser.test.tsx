import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TaskBottomRegion } from "@/features/taskLayout/TaskBottomRegion";
import "@/index.css";

const originalViewport = { width: window.innerWidth, height: window.innerHeight };

afterEach(async () => {
  await page.viewport(originalViewport.width, originalViewport.height);
  window.scrollTo({ top: 0, behavior: "instant" });
});

function Fixture({ placement, height = 160 }: { placement: "sticky" | "fixed"; height?: number }) {
  return (
    <main>
      <div style={{ height: 1000 }} />
      <button type="button" tabIndex={0} style={{ display: "block", height: 40 }}>
        Previous action
      </button>
      <button type="button" tabIndex={0} style={{ display: "block", height: 40 }}>
        History action
      </button>
      <div style={{ height: 800 }} />
      <TaskBottomRegion placement={placement} label="Bottom actions">
        <div style={{ height, background: "white" }}>
          <button type="button">Bottom action</button>
        </div>
      </TaskBottomRegion>
    </main>
  );
}

async function settleLayout() {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resolve();
      }),
    ),
  );
}

async function arrange(placement: "sticky" | "fixed", targetTop: number) {
  await page.viewport(1000, 720);
  const screen = await render(<Fixture placement={placement} />);
  await settleLayout();
  const previous = screen.getByRole("button", { name: "Previous action" }).element();
  const target = screen.getByRole("button", { name: "History action" }).element();
  const bottom = screen.getByRole("region", { name: "Bottom actions" }).element();
  window.scrollBy({ top: target.getBoundingClientRect().top - targetTop, behavior: "instant" });
  previous.focus({ preventScroll: true });
  await settleLayout();
  return { screen, target, bottom };
}

test.each(["sticky", "fixed"] as const)(
  "%s bottom region reveals a keyboard-focused history control",
  async (placement) => {
    const { target, bottom } = await arrange(placement, 660);
    await userEvent.tab();
    await expect.element(target).toHaveFocus();
    await expect
      .poll(() => bottom.getBoundingClientRect().top - target.getBoundingClientRect().bottom)
      .toBeGreaterThanOrEqual(8);
    expect(target.getBoundingClientRect().top).toBeGreaterThan(0);
  },
);

test.each(["sticky", "fixed"] as const)(
  "%s bottom region leaves visible focus and manual scrolling alone",
  async (placement) => {
    const { target } = await arrange(placement, 200);
    const before = window.scrollY;
    await userEvent.tab();
    await expect.element(target).toHaveFocus();
    await settleLayout();
    expect(window.scrollY).toBe(before);
    window.scrollBy({ top: -450, behavior: "instant" });
    const manualPosition = window.scrollY;
    await settleLayout();
    expect(window.scrollY).toBe(manualPosition);
  },
);

test.each(["sticky", "fixed"] as const)(
  "%s bottom region reveals retained history focus when its height grows",
  async (placement) => {
    const { screen, target, bottom } = await arrange(placement, 480);
    await userEvent.tab();
    await expect.element(target).toHaveFocus();
    await screen.rerender(<Fixture placement={placement} height={300} />);
    await expect
      .poll(() => bottom.getBoundingClientRect().top - target.getBoundingClientRect().bottom)
      .toBeGreaterThanOrEqual(8);
  },
);

test.each(["sticky", "fixed"] as const)(
  "%s bottom region does not scroll its own focused controls",
  async (placement) => {
    const { screen } = await arrange(placement, 200);
    const before = window.scrollY;
    screen.getByRole("button", { name: "Bottom action" }).element().focus();
    await settleLayout();
    expect(window.scrollY).toBe(before);
  },
);

function TopFixture({ noticeHeight = 180 }: { noticeHeight?: number }) {
  return (
    <div data-app-shell-content-layout="reading">
      <header style={{ position: "fixed", top: 0, height: 56, width: "100%", zIndex: 30 }} />
      <div
        data-app-shell-top-notices=""
        data-floating="true"
        style={{ position: "sticky", top: 56, height: noticeHeight, zIndex: 20 }}
      />
      <Fixture placement="sticky" />
    </div>
  );
}

test.each([0, 180])(
  "reverse tab reveals history focus below the header and %s px of notices",
  async (noticeHeight) => {
    await page.viewport(1000, 720);
    const screen = await render(<TopFixture noticeHeight={noticeHeight} />);
    await settleLayout();
    const target = screen.getByRole("button", { name: "History action" }).element();
    window.scrollBy({ top: target.getBoundingClientRect().top - 40, behavior: "instant" });
    screen.getByRole("button", { name: "Bottom action" }).element().focus({ preventScroll: true });
    await userEvent.tab({ shift: true });
    await expect.element(target).toHaveFocus();
    await expect
      .poll(() => target.getBoundingClientRect().top)
      .toBeGreaterThanOrEqual(56 + noticeHeight + 8);
  },
);

test("growing top notices keep retained history focus visible without fighting manual scroll", async () => {
  await page.viewport(1000, 720);
  const screen = await render(<TopFixture noticeHeight={100} />);
  await settleLayout();
  const target = screen.getByRole("button", { name: "History action" }).element();
  window.scrollBy({ top: target.getBoundingClientRect().top - 200, behavior: "instant" });
  target.focus({ preventScroll: true });
  await settleLayout();
  await screen.rerender(<TopFixture noticeHeight={240} />);
  await expect.poll(() => target.getBoundingClientRect().top).toBeGreaterThanOrEqual(304);
  const corrected = window.scrollY;
  window.scrollBy({ top: 100, behavior: "instant" });
  await settleLayout();
  expect(window.scrollY).toBe(corrected + 100);
});
