import { createContext, use } from "react";

export const HistoryDetailTitleContext = createContext<string | null>(null);

export function useHistoryDetailTitle(): string | null {
  return use(HistoryDetailTitleContext);
}
