import type { UseNavigateResult } from "@tanstack/react-router";

export type PrimarySurfaceNavigation = {
  openSettings(): Promise<void>;
  returnToChat(): Promise<void>;
};

export function createPrimarySurfaceNavigation(
  navigate: UseNavigateResult<string>,
): PrimarySurfaceNavigation {
  return {
    openSettings() {
      return navigate({
        to: "/settings",
        search: true,
        hash: "",
        replace: true,
      });
    },
    returnToChat() {
      return navigate({
        to: "/",
        search: true,
        hash: "",
        replace: true,
        resetScroll: false,
      });
    },
  };
}
