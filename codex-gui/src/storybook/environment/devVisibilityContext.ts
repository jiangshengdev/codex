import { createContext } from "react";
import { defaultDevVisibility } from "./devVisibility";

export const DevVisibilityContext = createContext(defaultDevVisibility);
