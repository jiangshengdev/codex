import { createContext } from "react";
import type { ThreadForkOwner } from "./threadForkOwner";

export const ThreadForkContext = createContext<Readonly<{
  owner: ThreadForkOwner;
  available: boolean;
}> | null>(null);

export const ThreadForkSourceContext = createContext<string | null>(null);
