import { Badge } from "@heroui/react";
import { use, useId, type PropsWithChildren } from "react";
import { DevVisibilityContext } from "./devVisibilityContext";

/** Marks preview-only UI, never the product component being demonstrated. */
export function DevOnly({ children, className }: PropsWithChildren<{ className?: string }>) {
  const labelId = useId();
  const { visible } = use(DevVisibilityContext);
  if (!visible) return null;
  return (
    <Badge.Anchor<"div">
      render={(props) => <div {...props} />}
      role="group"
      aria-labelledby={labelId}
      className={`my-2 grid min-w-0 gap-2 rounded-none border border-accent p-3 ${className ?? ""}`}
    >
      {children}
      <Badge
        id={labelId}
        color="accent"
        size="sm"
        placement="top-right"
        className="right-3 [transform:translateY(-50%)]"
      >
        DEV
      </Badge>
    </Badge.Anchor>
  );
}
