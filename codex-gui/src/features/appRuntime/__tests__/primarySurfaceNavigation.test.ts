import { describe, expect, it, vi } from "vitest";
import {
  createPrimarySurfaceNavigation,
  type PrimarySurfaceNavigate,
} from "../primarySurfaceNavigation";

describe("createPrimarySurfaceNavigation", () => {
  it("replaces the primary surface while preserving search and clearing hash", () => {
    const historyBack = vi.fn<() => void>();
    const historyStateRead = vi.fn<() => void>();
    const referrerRead = vi.fn<() => void>();
    const previousHistory = Object.getOwnPropertyDescriptor(globalThis, "history");
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

    Object.defineProperty(globalThis, "history", {
      configurable: true,
      value: {
        back: historyBack,
        get state() {
          historyStateRead();
          return { returnTo: "/unexpected" };
        },
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        get referrer() {
          referrerRead();
          return "https://example.com/unexpected";
        },
      },
    });

    try {
      const navigate = vi.fn<PrimarySurfaceNavigate>(() => Promise.resolve());
      const navigation = createPrimarySurfaceNavigation(navigate);

      void navigation.openSettings();
      void navigation.returnToChat();

      expect(navigate).toHaveBeenNthCalledWith(1, {
        to: "/settings",
        search: true,
        hash: "",
        replace: true,
      });
      expect(navigate).toHaveBeenNthCalledWith(2, {
        to: "/",
        search: true,
        hash: "",
        replace: true,
      });
      expect(historyBack).not.toHaveBeenCalled();
      expect(historyStateRead).not.toHaveBeenCalled();
      expect(referrerRead).not.toHaveBeenCalled();
    } finally {
      if (previousHistory) {
        Object.defineProperty(globalThis, "history", previousHistory);
      } else {
        Reflect.deleteProperty(globalThis, "history");
      }
      if (previousDocument) {
        Object.defineProperty(globalThis, "document", previousDocument);
      } else {
        Reflect.deleteProperty(globalThis, "document");
      }
    }
  });
});
