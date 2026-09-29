import { Surface } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

export function TaskDetailPage(props: Omit<ComponentProps<"main">, "className">) {
  return <main {...props} className="task-page" />;
}

export function TaskDetailBody({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Surface className="grid min-w-0 flex-1 content-start" variant="transparent">
      {children}
    </Surface>
  );
}
