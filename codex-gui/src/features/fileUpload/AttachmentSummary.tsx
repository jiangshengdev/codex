import type { ReactNode } from "react";

export function AttachmentSummary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2 rounded-s-xl bg-default px-2 py-1 text-sm">
      <span className="min-w-0 max-w-48 truncate" title={name}>
        {name}
      </span>
      {children}
    </span>
  );
}
