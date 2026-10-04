import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { ShortcutKey } from "./ShortcutKey";
import type { appShortcut } from "./appShortcuts";

type TopBarNavigationItemProps = {
  id: string;
  isCurrent: boolean;
  isDisabled?: boolean;
  label: ReactNode;
  description: ReactNode;
  onPress: () => void;
  shortcut?: ReturnType<typeof appShortcut>;
};

export function TopBarNavigationItem({
  id,
  isCurrent,
  isDisabled,
  label,
  description,
  onPress,
  shortcut,
}: TopBarNavigationItemProps) {
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <Button
      render={(props) => <button {...props} aria-keyshortcuts={shortcut?.aria} />}
      aria-describedby={descriptionId}
      aria-current={isCurrent ? "page" : undefined}
      aria-labelledby={labelId}
      className="h-auto min-h-9 justify-start gap-3 rounded-2xl px-2 py-1.5 text-start whitespace-normal md:h-auto"
      fullWidth
      isDisabled={isDisabled}
      variant="ghost"
      onPress={onPress}
    >
      <span
        aria-hidden="true"
        className="flex w-4 shrink-0 items-center justify-center self-stretch"
      >
        {isCurrent ? (
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-muted"
            data-current-page-indicator="true"
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="text-sm font-medium text-foreground" id={labelId}>
          {label}
        </span>
        <span
          className="text-xs font-normal text-wrap wrap-break-word text-muted"
          id={descriptionId}
        >
          {description}
        </span>
      </span>
      {shortcut ? <ShortcutKey aria={shortcut.aria} variant="light" /> : null}
    </Button>
  );
}
