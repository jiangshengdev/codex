import { useLingui } from "@lingui/react";
import type { Thread } from "@codex-protocol/v2";
import {
  currentThreadStatusPresentation,
  type CurrentThreadStatusPresentation,
} from "./currentThreadStatusPresentation";

export type CurrentThreadStatusProps = Readonly<{
  status: Thread["status"] | null;
}>;

const dotColorClass = {
  default: "bg-default",
  accent: "bg-accent",
  warning: "bg-warning",
  danger: "bg-danger",
} as const satisfies Record<CurrentThreadStatusPresentation["dotColor"], string>;

export function CurrentThreadStatus({ status }: CurrentThreadStatusProps) {
  const { i18n } = useLingui();
  const presentation = currentThreadStatusPresentation(status);

  return (
    <span
      aria-label={i18n._(presentation.accessibleName)}
      aria-live="polite"
      className="current-thread-status inline-flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap text-muted"
      role="status"
    >
      <span
        aria-hidden="true"
        className={`current-thread-status-dot size-2 shrink-0 rounded-full ${dotColorClass[presentation.dotColor]}`}
      />
      {i18n._(presentation.label)}
    </span>
  );
}
