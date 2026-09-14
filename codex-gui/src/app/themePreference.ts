import { createContext, use } from "react";

export type ThemePreference = "light" | "dark" | "system";

export function createThemePreferenceStore() {
  let preference: ThemePreference = "system";
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => preference,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPreference: (next: ThemePreference) => {
      if (preference === next) return;
      preference = next;
      for (const listener of listeners) listener();
    },
  };
}

export const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

export function useThemePreference() {
  const context = use(ThemeContext);
  if (context === null) throw new Error("ThemeProvider is required");
  return context;
}
