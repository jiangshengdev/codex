import type { ReactNode } from "react";

export function ShortcutInstructions({
  keys,
  children,
}: Readonly<{ keys: string; children: ReactNode }>) {
  return (
    <section aria-label="Shortcut instructions" className="grid gap-2 p-4 text-sm text-muted">
      <p>macOS · {keys}</p>
      <p>{children}</p>
      <p>
        Click inside the preview before pressing keys. This story waits for manual input. Local
        simulation only; reload or restart to restore the preset. Safari system shortcuts, native
        focus and real IME behavior require separate manual acceptance.
      </p>
    </section>
  );
}
