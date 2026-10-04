import { createContext, type RefObject } from "react";

// The mounted primary composer owns availability and the editor's public focus handle.
export const ComposerFocusContext = createContext<RefObject<(() => boolean) | null> | null>(null);
