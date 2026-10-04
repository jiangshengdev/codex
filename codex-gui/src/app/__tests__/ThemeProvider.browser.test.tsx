import { expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";
import { ThemePreferenceControl } from "../ThemePreferenceControl";
import { ThemeProvider } from "../ThemeProvider";
import { createThemePreferenceStore } from "../themePreference";

test("theme selection updates the page and same preferences do not notify subscribers", async () => {
  const root = document.documentElement;
  const originalClass = root.className;
  const originalTheme = root.getAttribute("data-theme");
  const store = createThemePreferenceStore();
  const listener = vi.fn<() => void>();
  const unsubscribe = store.subscribe(listener);
  const screen = await renderWithProviders(
    <ThemeProvider preferenceStore={store}>
      <ThemePreferenceControl />
    </ThemeProvider>,
  );

  try {
    const system = screen.getByRole("radio", { name: "System theme", exact: true });
    await expect.element(system).toHaveAttribute("aria-checked", "true");
    expect(store.getSnapshot()).toBe("system");
    store.setPreference("system");
    expect(listener).not.toHaveBeenCalled();

    for (const preference of ["dark", "light"] as const) {
      const name = preference === "dark" ? "Dark theme" : "Light theme";
      await screen.getByRole("radio", { name, exact: true }).click();
      await expect.element(root).toHaveAttribute("data-theme", preference);
      await expect.element(root).toHaveClass(preference);
      await expect
        .element(screen.getByRole("radio", { name, exact: true }))
        .toHaveAttribute("aria-checked", "true");
      expect(store.getSnapshot()).toBe(preference);
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();
      store.setPreference(preference);
      expect(listener).not.toHaveBeenCalled();
    }

    unsubscribe();
    await system.click();
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    await expect.element(root).toHaveAttribute("data-theme", systemTheme);
    await expect.element(system).toHaveAttribute("aria-checked", "true");
    expect(store.getSnapshot()).toBe("system");
    expect(listener).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
    await screen.unmount();
    root.className = originalClass;
    if (originalTheme === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", originalTheme);
  }
});
