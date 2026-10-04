import type { ReactNode } from "react";
import "./failureLayout.css";

export function FailureLayout({
  children,
  actions,
}: Readonly<{
  children: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <div className="failure-layout">
      <div className="failure-layout__regions">
        <div className="failure-layout__content">{children}</div>
        {actions && <div className="failure-layout__actions">{actions}</div>}
      </div>
    </div>
  );
}
