import { Alert, Button } from "@heroui/react";
import { expect, test } from "vitest";
import { FailureLayout } from "@/feedback/FailureLayout";
import { renderWithProviders } from "@/utils/test-utils";

for (const wrapped of [false, true]) {
  for (const width of [150, 200, 400]) {
    test(`alert uses its own width ${String(width)}, failure layout ${String(wrapped)}`, async () => {
      const content = (
        <Alert.Content>
          <Alert.Title>发送结果未知</Alert.Title>
          <Alert.Description>这些消息不会自动重发。</Alert.Description>
          <Button size="sm">移除本地记录</Button>
        </Alert.Content>
      );
      const screen = await renderWithProviders(
        <div style={{ width }}>
          <Alert status="warning">
            <Alert.Indicator />
            {wrapped ? <FailureLayout>{content}</FailureLayout> : content}
          </Alert>
        </div>,
      );
      const title = screen.getByText("发送结果未知").element();
      const alert = title.closest(".alert");
      const indicatorElement = alert?.querySelector(".alert__indicator");
      if (!alert || !indicatorElement) throw new Error("Alert or indicator is missing");
      const indicator = indicatorElement.getBoundingClientRect();
      const bounds = title.getBoundingClientRect();
      expect(bounds.top >= indicator.bottom).toBe(width < 400);
      expect(bounds.left > indicator.right).toBe(width === 400);
      expect(width < 400 ? bounds.left : bounds.top).toBeCloseTo(
        width < 400 ? indicator.left : indicator.top,
        0,
      );
      expect(alert.scrollWidth).toBeLessThanOrEqual(alert.clientWidth + 1);
    });
  }
}
