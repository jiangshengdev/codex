import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { userEvent, within } from "storybook/test";
import { useComposerPendingInput } from "@/features/composerTurnControl/composerPendingInputHost";

export function PendingInputBrowsingInitialState({
  detail,
}: Readonly<{ detail?: "ordinary" | "guiding" }>) {
  const host = useComposerPendingInput();
  const { t } = useLingui();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const label = t`View full message`;
  useEffect(() => {
    let current = true;
    const isCurrent = () => current;
    const binding = host.getSnapshot().connection?.binding;
    if (binding == null) throw new Error("Pending preview binding is required");
    if (host.getSnapshot().pending.phase === "closed") host.session.open(binding);
    if (detail != null) {
      const initialize = async () => {
        const dialog = await within(document.body).findByRole("dialog");
        if (!isCurrent()) return;
        const row = await within(dialog).findByRole("group", {
          name: detail === "ordinary" ? /^Ordinary message 1\s/ : /^Guide message 1\s/,
        });
        if (!isCurrent()) return;
        await userEvent.click(within(row).getByRole("button", { name: label }));
      };
      void initialize().catch((error: unknown) => {
        if (current) setFailure({ error });
      });
    }
    return () => {
      current = false;
    };
  }, [detail, host, label]);
  if (failure != null) throw failure.error;
  return null;
}
