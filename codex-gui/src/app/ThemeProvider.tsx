import type { JSX, ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createThemePreferenceStore, ThemeContext } from "./themePreference";

const applyTheme = (isDark: boolean): void => {
  const root = document.documentElement;
  const theme = isDark ? "dark" : "light";

  root.classList.toggle("dark", isDark);
  root.classList.toggle("light", !isDark);
  root.dataset.theme = theme;
};

export const ThemeProvider = ({
  children,
  preferenceStore,
}: {
  children: ReactNode;
  preferenceStore?: ReturnType<typeof createThemePreferenceStore>;
}): JSX.Element => {
  const [defaultStore] = useState(createThemePreferenceStore);
  const store = preferenceStore ?? defaultStore;
  const preference = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    applyTheme(preference === "system" ? mediaQuery.matches : preference === "dark");

    const handleChange = (event: MediaQueryListEvent) => {
      if (preference === "system") applyTheme(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [preference]);

  return (
    <ThemeContext value={{ preference, setPreference: store.setPreference }}>
      {children}
    </ThemeContext>
  );
};
