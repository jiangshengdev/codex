export type PrimarySurfaceNavigation = {
  openSettings(): Promise<void>;
  returnToChat(): Promise<void>;
};

export type PrimarySurfaceNavigate = (options: {
  to: "/" | "/settings";
  search: true;
  hash: "";
  replace: true;
}) => Promise<void>;

export function createPrimarySurfaceNavigation(
  navigate: PrimarySurfaceNavigate,
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
      });
    },
  };
}
