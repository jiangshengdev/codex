import { createPortal } from "react-dom";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { enableMotionForTest } from "./browserMotion";

function MotionProbe() {
  return (
    <>
      <style>{`
        @keyframes browser-motion-probe {
          from { transform: translateX(0); }
          to { transform: translateX(100px); }
        }
        .browser-motion-probe {
          animation: browser-motion-probe 10s linear;
        }
      `}</style>
      <div className="browser-motion-probe" data-testid="inline-motion">
        Inline
      </div>
      {createPortal(
        <div className="browser-motion-probe" data-testid="portal-motion">
          Portal
        </div>,
        document.body,
      )}
    </>
  );
}

test("does not animate ordinary renders or their portals by default", async () => {
  const screen = await render(<MotionProbe />);
  for (const target of ["inline-motion", "portal-motion"]) {
    const element = screen.getByTestId(target).element();
    expect(element.getAnimations().some((animation) => animation.playState === "running")).toBe(
      false,
    );
  }
});

test("keeps explicit motion enabled across multiple renders", async () => {
  enableMotionForTest();
  for (let renderIndex = 0; renderIndex < 2; renderIndex += 1) {
    const screen = await render(<MotionProbe />);
    for (const target of ["inline-motion", "portal-motion"]) {
      expect(
        screen
          .getByTestId(target)
          .element()
          .getAnimations()
          .some((animation) => animation.playState === "running"),
      ).toBe(true);
    }
    await screen.unmount();
  }
});

// Exercise Vitest's real failure lifecycle; the next test checks its isolation.
test.fails("finishes an opted-in test even when its body throws", async () => {
  enableMotionForTest();
  await render(<MotionProbe />);
  expect.unreachable("Intentional failure to exercise Browser motion cleanup");
});

test("restores the default after an opted-in test fails", async () => {
  const screen = await render(<MotionProbe />);
  expect(
    screen
      .getByTestId("inline-motion")
      .element()
      .getAnimations()
      .some((animation) => animation.playState === "running"),
  ).toBe(false);
});
