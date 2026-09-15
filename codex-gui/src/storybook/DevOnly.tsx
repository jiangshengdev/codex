import { Badge } from "@heroui/react";
import { useId, type PropsWithChildren } from "react";

/** Marks preview-only UI, never the product component being demonstrated. */
export function DevOnly({ children }: PropsWithChildren) {
  const labelId = useId();
  return (
    <Badge.Anchor<"div">
      render={(props) => <div {...props} />}
      role="group"
      aria-labelledby={labelId}
      className="my-2 grid min-w-0 gap-2 rounded-none border border-accent p-3"
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
