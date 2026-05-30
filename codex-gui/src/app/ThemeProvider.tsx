import type { JSX, ReactNode } from "react";
import { useEffect } from "react";

const applyTheme = (isDark: boolean): void => {
  const root = document.documentElement;
  const theme = isDark ? "dark" : "light";

  root.classList.toggle("dark", isDark);
  root.classList.toggle("light", !isDark);
  root.dataset.theme = theme;
};

export const ThemeProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    applyTheme(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyTheme(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return <>{children}</>;
};
