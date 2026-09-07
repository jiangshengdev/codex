import { Alert, Button } from "@heroui/react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderWithProviders } from "@/utils/test-utils";
import { FailureDiagnosticModal } from "../FailureDiagnosticModal";
import { FailureLayout } from "../FailureLayout";

const messages = {
  en: {
    title: "Unable to save changes",
    description:
      "The changes could not be saved. Check the connection before trying again. ".repeat(6),
    retry: "Retry saving the changes to this task",
  },
  "zh-CN": {
    title: "无法保存更改",
    description: "无法保存当前更改，请检查连接后再次尝试。".repeat(12),
    retry: "重新尝试保存此任务的全部更改",
  },
};

function FailureExample({
  locale,
  diagnostic,
  retry,
  width,
  onRetry,
}: Readonly<{
  locale: keyof typeof messages;
  diagnostic: boolean;
  retry: boolean;
  width?: number;
  onRetry?: () => void;
}>) {
  const text = messages[locale];
  return (
    <div style={{ width, maxWidth: "100%" }}>
      <Alert role="alert" status="danger">
        <Alert.Indicator />
        <FailureLayout
          actions={
            retry && (
              <Button variant="secondary" onPress={onRetry}>
                {text.retry}
              </Button>
            )
          }
        >
          <Alert.Content>
            <Alert.Title>{text.title}</Alert.Title>
            <Alert.Description>{text.description}</Alert.Description>
            {diagnostic && (
              <FailureDiagnosticModal>Complete diagnostic details</FailureDiagnosticModal>
            )}
          </Alert.Content>
        </FailureLayout>
      </Alert>
    </div>
  );
}

const sizes = [
  { name: "wide viewport", viewport: 1280, width: undefined, horizontal: true },
  { name: "small viewport", viewport: 375, width: undefined, horizontal: false },
  { name: "narrow container in a wide viewport", viewport: 1280, width: 300, horizontal: false },
];

for (const locale of ["en", "zh-CN"] as const) {
  for (const size of sizes) {
    for (const diagnostic of [false, true]) {
      for (const retry of [false, true]) {
        test(`${locale}: ${size.name}, diagnostic=${String(diagnostic)}, retry=${String(retry)}`, async () => {
          const viewport = { width: window.innerWidth, height: window.innerHeight };
          try {
            await page.viewport(size.viewport, 900);
            const onRetry = vi.fn<() => void>();
            const screen = await renderWithProviders(
              <FailureExample
                locale={locale}
                diagnostic={diagnostic}
                retry={retry}
                width={size.width}
                onRetry={onRetry}
              />,
              { locale },
            );
            const text = messages[locale];
            const title = screen.getByText(text.title).element();
            const description = screen.getByText(text.description).element();
            const buttons = screen.getByRole("button").elements();
            expect(buttons).toHaveLength(Number(diagnostic) + Number(retry));
            const titleBounds = title.getBoundingClientRect();
            expect(description.getBoundingClientRect().top).toBeGreaterThanOrEqual(
              titleBounds.bottom,
            );
            const content = title.parentElement;
            if (!(content instanceof HTMLElement)) throw new Error("Expected error content");
            const contentBounds = content.getBoundingClientRect();

            const diagnosticButtons = buttons.slice(0, Number(diagnostic));
            const retryButtons = buttons.slice(Number(diagnostic));
            expect(diagnosticButtons).toHaveLength(Number(diagnostic));
            expect(retryButtons).toHaveLength(Number(retry));
            for (const trigger of diagnosticButtons) {
              expect(trigger.getBoundingClientRect().top).toBeGreaterThanOrEqual(
                description.getBoundingClientRect().bottom,
              );
              expect(
                Math.abs(trigger.getBoundingClientRect().left - titleBounds.left),
              ).toBeLessThan(1);
              expect(content.contains(trigger)).toBe(true);
            }
            for (const retryButton of retryButtons) {
              const action = screen.getByRole("button", { name: text.retry });
              expect(action.element()).toBe(retryButton);
              const actionBounds = retryButton.getBoundingClientRect();
              const actionStart = size.horizontal ? actionBounds.left : actionBounds.top;
              const contentEnd = size.horizontal ? contentBounds.right : contentBounds.bottom;
              const alignmentOffset = size.horizontal
                ? actionBounds.top - titleBounds.top
                : actionBounds.left - titleBounds.left;
              expect(actionStart).toBeGreaterThanOrEqual(contentEnd);
              expect(Math.abs(alignmentOffset)).toBeLessThan(1);
              for (const trigger of diagnosticButtons) {
                expect(
                  trigger.compareDocumentPosition(action.element()) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
                ).toBeTruthy();
                trigger.focus();
                await userEvent.tab();
                await expect.element(action).toHaveFocus();
              }
              await action.click();
            }
            expect(onRetry).toHaveBeenCalledTimes(Number(retry));
            const layout = content.parentElement?.parentElement;
            if (!(layout instanceof HTMLElement)) throw new Error("Expected error layout");
            const layoutsWithoutActions = retry ? [] : [layout];
            for (const contentOnlyLayout of layoutsWithoutActions) {
              expect(
                Math.abs(contentBounds.width - contentOnlyLayout.getBoundingClientRect().width),
              ).toBeLessThan(1);
              expect(
                Math.abs(contentBounds.height - contentOnlyLayout.getBoundingClientRect().height),
              ).toBeLessThan(1);
            }
            for (const element of [screen.getByRole("alert").element(), content, ...buttons]) {
              expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1);
              expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight + 1);
              expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(size.viewport);
            }
          } finally {
            await page.viewport(viewport.width, viewport.height);
          }
        });
      }
    }
  }
}

test("keeps the same diagnostic trigger in the content when retry availability changes", async () => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  try {
    await page.viewport(1280, 900);
    const screen = await renderWithProviders(<FailureExample locale="en" diagnostic retry />);
    const trigger = screen.getByRole("button", { name: "View diagnostic information" });
    const original = trigger.element();
    const left = original.getBoundingClientRect().left;
    for (const retry of [false, true, false]) {
      await screen.rerender(<FailureExample locale="en" diagnostic retry={retry} />);
      expect(trigger.element()).toBe(original);
      expect(trigger.element().getBoundingClientRect().left).toBe(left);
      expect(screen.getByRole("button").elements()).toHaveLength(retry ? 2 : 1);
      expect(trigger.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(
        screen.getByText(messages.en.description).element().getBoundingClientRect().bottom,
      );
    }
  } finally {
    await page.viewport(viewport.width, viewport.height);
  }
});

test("wraps long compact actions without a card, preserves their order and disabled state", async () => {
  const onRetry = vi.fn<() => void>();
  const screen = await renderWithProviders(
    <div style={{ width: 240 }}>
      <FailureLayout
        actions={
          <>
            <Button isDisabled onPress={onRetry} variant="secondary">
              {"Retry saving this task after checking the connection. ".repeat(4)}
            </Button>
            <Button variant="tertiary">Return to the current task</Button>
          </>
        }
      >
        <p>{"LongUnbrokenErrorIdentifier".repeat(8)}</p>
      </FailureLayout>
    </div>,
  );
  const buttons = screen.getByRole("button").elements();
  const [firstAction, secondAction] = buttons;
  if (!firstAction || !secondAction) throw new Error("Expected both compact actions");
  await expect.element(firstAction).toBeDisabled();
  expect(firstAction.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    screen.getByText("LongUnbrokenErrorIdentifier".repeat(8)).element().getBoundingClientRect()
      .bottom,
  );
  expect(secondAction.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    firstAction.getBoundingClientRect().bottom,
  );
  for (const button of buttons) {
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    expect(button.scrollHeight).toBeLessThanOrEqual(button.clientHeight + 1);
    expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(240);
  }
  expect(onRetry).not.toHaveBeenCalled();
});

for (const viewportWidth of [375, 1280]) {
  for (const buttonSize of ["sm", "md", "lg"] as const) {
    test(`preserves ordinary ${buttonSize} button height at viewport ${String(viewportWidth)}`, async () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      try {
        await page.viewport(viewportWidth, 900);
        const screen = await renderWithProviders(
          <>
            <Button size={buttonSize} variant="secondary">
              Reference action
            </Button>
            <FailureLayout
              actions={
                <Button size={buttonSize} variant="secondary">
                  Retry
                </Button>
              }
            >
              <p>Unable to save changes</p>
              <Button size={buttonSize} variant="secondary">
                Diagnostics
              </Button>
            </FailureLayout>
          </>,
        );
        const referenceHeight = screen
          .getByRole("button", { name: "Reference action" })
          .element()
          .getBoundingClientRect().height;
        for (const name of ["Retry", "Diagnostics"]) {
          const height = screen
            .getByRole("button", { name })
            .element()
            .getBoundingClientRect().height;
          expect(height).toBe(referenceHeight);
        }
      } finally {
        await page.viewport(viewport.width, viewport.height);
      }
    });
  }
}
