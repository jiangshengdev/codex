import { createContext, use } from "react";
import { createListenerSet } from "@/subscriptions/listenerSet";

export type ThemePreference = "light" | "dark" | "system";

export function createThemePreferenceStore() {
  let preference: ThemePreference = "system";
  const listeners = createListenerSet();
  return {
    getSnapshot: () => preference,
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    setPreference: (next: ThemePreference) => {
      if (preference === next) return;
      preference = next;
      listeners.notify();
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
