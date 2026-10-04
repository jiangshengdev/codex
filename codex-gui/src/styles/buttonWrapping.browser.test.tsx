import { Button, ButtonGroup } from "@heroui/react";
import { Plus } from "lucide-react";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderWithProviders } from "@/utils/test-utils";

test("text buttons fit narrow containers without shrinking icon buttons", async () => {
  const screen = await renderWithProviders(
    <div style={{ width: 73 }}>
      <Button size="sm">移除本地记录</Button>
      <Button>abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz</Button>
      <Button>
        <Plus />
        <span>Confirm this long action</span>
      </Button>
      <Button isIconOnly aria-label="Add">
        <Plus />
      </Button>
    </div>,
  );
  for (const button of screen.getByRole("button").elements()) {
    expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(73);
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    expect(button.scrollHeight).toBeLessThanOrEqual(button.clientHeight + 1);
  }
  const icon = screen.getByRole("button", { name: "Add", exact: true }).element();
  expect(icon.getBoundingClientRect().width).toBe(icon.getBoundingClientRect().height);
  expect(
    screen.getByRole("button", { name: "移除本地记录" }).element().getBoundingClientRect().height,
  ).toBeGreaterThan(36);
});

test("button groups contain wrapped labels and short buttons retain their sizes", async () => {
  await page.viewport(1280, 900);
  const screen = await renderWithProviders(
    <>
      <ButtonGroup style={{ width: 200 }}>
        <Button>重新尝试保存所有消息</Button>
        <Button>abcdefghijklmnopqrstuvwxyz</Button>
      </ButtonGroup>
      <Button size="sm">Small</Button>
      <Button>Medium</Button>
      <Button size="lg">Large</Button>
    </>,
  );
  const group = screen.getByRole("group").element();
  expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth + 1);
  for (const [name, height] of [
    ["Small", 32],
    ["Medium", 36],
    ["Large", 40],
  ] as const) {
    expect(
      screen.getByRole("button", { name, exact: true }).element().getBoundingClientRect().height,
    ).toBe(height);
  }
});
