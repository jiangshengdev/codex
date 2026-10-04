import { Spinner } from "@heroui/react";
import type { ReactNode } from "react";

export function TaskLoading({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className="mx-auto flex w-fit max-w-full items-center gap-2 py-6 text-sm text-muted"
      role="status"
    >
      <Spinner aria-hidden="true" size="sm" />
      <span>{children}</span>
    </div>
  );
}
