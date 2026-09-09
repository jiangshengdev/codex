import { Button, Spinner, type ButtonProps } from "@heroui/react";
import type { ReactNode } from "react";

export type RetryActionButtonProps = Omit<ButtonProps, "children" | "isPending"> & {
  children: ReactNode;
  pendingChildren: ReactNode;
  isPending: boolean;
};

export function RetryActionButton({
  children,
  pendingChildren,
  isPending,
  ...props
}: RetryActionButtonProps) {
  return (
    <Button {...props} isPending={isPending}>
      {isPending && <Spinner aria-hidden color="current" size="sm" />}
      {isPending ? pendingChildren : children}
    </Button>
  );
}
