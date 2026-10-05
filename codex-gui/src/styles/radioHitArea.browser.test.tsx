import { Description, Radio, RadioGroup } from "@heroui/react";
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";

for (const width of [320, 704]) {
  for (const disabled of [false, true]) {
    test(`radio row trailing space at width ${String(width)}, disabled ${String(disabled)}`, async () => {
      const onChange = vi.fn<(value: string) => void>();
      const screen = await renderWithProviders(
        <div data-testid="radio-host" style={{ width }}>
          <RadioGroup aria-label="Environment" defaultValue="preview" onChange={onChange}>
            <Radio value="preview">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Preview
              </Radio.Content>
            </Radio>
            <Radio value="production" isDisabled={disabled}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Production
              </Radio.Content>
              <Description>Release to all users</Description>
            </Radio>
          </RadioGroup>
        </div>,
      );
      const host = screen.getByTestId("radio-host");
      const content = screen.getByText("Production", { exact: true }).element();
      const row = content.closest('[data-slot="radio"]');
      if (!row) throw new Error("Radio row is missing");
      const rowBounds = row.getBoundingClientRect();
      const contentBounds = content.getBoundingClientRect();
      expect(contentBounds.width).toBeCloseTo(rowBounds.width, 0);
      const hostBounds = host.element().getBoundingClientRect();
      await host.click({
        position: {
          x: rowBounds.right - hostBounds.left - 8,
          y: contentBounds.top - hostBounds.top + contentBounds.height / 2,
        },
      });
      const production = screen.getByRole("radio", { name: "Production", exact: true });
      await expect.poll(() => (production.element() as HTMLInputElement).checked).toBe(!disabled);
      expect(onChange).toHaveBeenCalledTimes(disabled ? 0 : 1);
      const description = screen
        .getByText("Release to all users", { exact: true })
        .element()
        .getBoundingClientRect();
      await host.click({
        position: {
          x: description.left - hostBounds.left + description.width / 2,
          y: description.top - hostBounds.top + description.height / 2,
        },
      });
      expect(onChange).toHaveBeenCalledTimes(disabled ? 0 : 1);
    });
  }
}
