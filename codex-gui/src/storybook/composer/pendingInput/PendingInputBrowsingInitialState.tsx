import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { within } from "storybook/test";
import { initializeWhenReady } from "../../environment/initializeWhenReady";
import { useComposerPendingInput } from "@/features/composerTurnControl/composerPendingInputHost";
import type { ComposerPendingInputGroup } from "@/features/composerTurnControl/composerPendingInputSession";

export function PendingInputBrowsingInitialState({
  detail,
  targetGroup,
}: Readonly<{
  detail?: "ordinary" | "guiding" | "priority";
  targetGroup?: ComposerPendingInputGroup;
}>) {
  const host = useComposerPendingInput();
  const { t } = useLingui();
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const label = t`View full message`;
  useEffect(() => {
    const binding = host.getSnapshot().connection?.binding;
    if (binding == null) throw new Error("Pending preview binding is required");
    if (host.getSnapshot().pending.phase === "closed") host.session.open(binding, targetGroup);
    if (detail != null) {
      // Observe the real portal without entering a testing-library act scope
      // from a running React effect.
      return initializeWhenReady(
        document.body,
        () => {
          const dialog = within(document.body).queryByRole("dialog");
          if (dialog == null) return false;
          const row =
            detail === "priority"
              ? within(dialog).queryAllByRole("region")[0]
              : within(dialog).queryByRole("group", {
                  name: detail === "ordinary" ? /^Ordinary message 1\s/ : /^Guide message 1\s/,
                });
          if (row == null) return false;
          const [button] = within(row).queryAllByRole("button", { name: label });
          if (button == null) return false;
          button.click();
          return true;
        },
        setFailure,
        "Pending preview full message button was not mounted",
      );
    }
  }, [detail, host, label, targetGroup]);
  if (failure != null) throw failure.error;
  return null;
}
