import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

export function ShortcutInstructions({
  keys,
  children,
  hasFixedHeader = false,
}: Readonly<{ keys: string; children: ReactNode; hasFixedHeader?: boolean }>) {
  const { t } = useLingui();
  return (
    <section
      aria-label={t({
        message: "Shortcut instructions",
        comment: "Accessible name of the Storybook keyboard shortcut instructions section.",
      })}
      className={`grid gap-2 px-4 pb-4 text-sm text-muted ${hasFixedHeader ? "pt-18" : "pt-4"}`}
    >
      <p>macOS · {keys}</p>
      <p>{children}</p>
      <p>
        <Trans>
          Click inside the preview before pressing keys. This story waits for manual input. Local
          simulation only; reload or restart to restore the preset. Safari system shortcuts, native
          focus and real IME behavior require separate manual acceptance.
        </Trans>
      </p>
    </section>
  );
}
