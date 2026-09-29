import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { ShortcutKey } from "@/features/appShell/ShortcutKey";

export function ShortcutInstructions({
  keys,
  children,
  hasFixedHeader = false,
}: Readonly<{ keys: string | string[]; children: ReactNode; hasFixedHeader?: boolean }>) {
  const { t } = useLingui();
  return (
    <section
      aria-label={t({
        message: "Shortcut instructions",
        comment: "Accessible name of the Storybook keyboard shortcut instructions section.",
      })}
      className={`grid gap-2 px-4 pb-4 text-sm text-muted ${hasFixedHeader ? "pt-18" : "pt-4"}`}
    >
      <p className="flex flex-wrap items-center gap-2">
        macOS ·
        {(typeof keys === "string" ? [keys] : keys).map((aria) => (
          <ShortcutKey key={aria} aria={aria} platform="MacIntel" />
        ))}
      </p>
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
