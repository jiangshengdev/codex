import { EmptyState } from "@heroui/react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function ThreadHistoryEmptyState({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <EmptyState className="flex flex-col items-center gap-3 py-6 text-center">
      <Inbox aria-hidden="true" className="size-6 text-muted" />
      <span>{children}</span>
    </EmptyState>
  );
}
