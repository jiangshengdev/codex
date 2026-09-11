import { Button, Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Folder } from "lucide-react";

export function NewSessionWorkingDirectory({ cwd }: Readonly<{ cwd: string }>) {
  const { t } = useLingui();
  const directoryName =
    cwd
      .split(cwd.startsWith("/") ? "/" : /[/\\]/)
      .filter(Boolean)
      .at(-1) ?? cwd;

  return (
    <div className="min-w-0 px-2 py-1">
      <Popover>
        <Button
          aria-label={t({
            comment: "Accessible name of the new-session directory button; opens the full path",
            message: `Working directory: ${directoryName}`,
          })}
          className="h-auto max-w-full min-w-0 justify-start gap-1 rounded-xl px-2 py-1 text-xs md:h-auto"
          variant="ghost"
        >
          <Folder aria-hidden="true" className="m-0 size-3 shrink-0 sm:my-0 sm:size-3" />
          <span className="truncate">{directoryName}</span>
        </Button>
        <Popover.Content className="max-w-[min(32rem,calc(100vw-24px))]" placement="top start">
          <Popover.Dialog
            aria-label={t({
              comment: "Accessible name of the popover showing the new-session draft's full path",
              message: "Working directory",
            })}
          >
            <p className="wrap-anywhere whitespace-pre-wrap select-text">{cwd}</p>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
