import { createContext, use, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import "./appShellNotices.css";

const NoticeTarget = createContext<HTMLDivElement | null>(null);

export function AppShellNotices({
  children,
  notices,
  floating,
  contained,
}: Readonly<{
  children: ReactNode;
  notices: ReactNode;
  floating: boolean;
  contained: boolean;
}>) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const { t } = useLingui();
  return (
    <NoticeTarget value={target}>
      <div
        className={`app-shell-notices${contained ? "" : " app-shell-content-boundary"}`}
        data-app-shell-top-notices=""
        data-floating={floating}
      >
        <div
          className="app-shell-notices__items"
          ref={setTarget}
          role="region"
          aria-label={t({
            message: "Page notices",
            comment:
              "Accessible name of the scrollable area for page-wide status and recovery actions",
          })}
          tabIndex={floating ? 0 : undefined}
        >
          {notices}
        </div>
      </div>
      {children}
    </NoticeTarget>
  );
}

// Only the DOM destination is shared. The caller still owns its state and actions.
export function AppShellNotice({ children }: Readonly<{ children: ReactNode }>) {
  const target = use(NoticeTarget);
  return target == null ? null : createPortal(children, target);
}
