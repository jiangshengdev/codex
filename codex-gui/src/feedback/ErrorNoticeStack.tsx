import { Button, Surface } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type ErrorNotice = Readonly<{ id: string; content: ReactNode }>;

/** Notices are ordered by their owners, with recovery blockers first. */
export function ErrorNoticeStack({ notices }: Readonly<{ notices: readonly ErrorNotice[] }>) {
  return notices.length === 0 ? null : <ActiveErrorNoticeStack notices={notices} />;
}

function ActiveErrorNoticeStack({ notices }: Readonly<{ notices: readonly ErrorNotice[] }>) {
  const { t } = useLingui();
  const listId = useId();
  const region = useRef<HTMLElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const firstCard = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<"auto" | "open" | "closed">("auto");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const expanded =
    notices.length > 1 && (mode === "open" || (mode === "auto" && (hovered || focused)));
  const firstId = notices[0]?.id;

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      region.current?.style.setProperty(
        "--error-notice-collapsed-height",
        `${String((header.current?.offsetHeight ?? 0) + (firstCard.current?.offsetHeight ?? 0))}px`,
      );
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    if (header.current) observer.observe(header.current);
    if (firstCard.current) observer.observe(firstCard.current);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [firstId]);

  return (
    <section
      aria-label={t({
        message: "Active issues",
        comment: "Persistent unresolved errors and recovery notices above the conversation",
      })}
      className="error-notice-stack"
      data-app-shell-top-notices=""
      ref={region}
    >
      <Surface
        className="error-notice-stack-panel"
        variant="default"
        onPointerEnter={(event) => {
          if (notices.length > 1 && event.pointerType !== "touch") {
            setHovered(true);
            if (mode === "closed") setMode("auto");
          }
        }}
        onPointerLeave={() => {
          setHovered(false);
        }}
        onFocusCapture={(event) => {
          const inCard = notices.length > 1 && !toggle.current?.contains(event.target);
          setFocused(inCard);
          if (inCard && mode === "closed") setMode("auto");
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
        onClickCapture={(event) => {
          // Keep secondary diagnostic triggers mounted and visible while their modal owns focus.
          if (event.target instanceof Element) {
            const button = event.target.closest("button");
            if (expanded && button != null && button !== toggle.current) setMode("open");
          }
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-1" ref={header}>
          <span className="text-sm text-muted" aria-live="polite">
            <Plural
              value={notices.length}
              one="# active issue"
              other="# active issues"
              comment="Number of unresolved errors in the persistent notice stack"
            />
          </span>
          {notices.length > 1 ? (
            <Button
              aria-controls={listId}
              aria-expanded={expanded}
              ref={toggle}
              size="sm"
              variant="ghost"
              onPress={() => {
                setMode(expanded ? "closed" : "open");
              }}
            >
              {expanded ? (
                <Trans comment="Collapse the error list, leaving its first notice visible">
                  Collapse issues
                </Trans>
              ) : (
                <Trans comment="Expand the persistent error list">Show all issues</Trans>
              )}
            </Button>
          ) : null}
        </div>
        <div className="error-notice-stack-list" id={listId}>
          {notices.map((notice, index) => (
            <div
              key={notice.id}
              ref={index === 0 ? firstCard : undefined}
              hidden={index > 0 && !expanded}
            >
              {notice.content}
            </div>
          ))}
        </div>
      </Surface>
    </section>
  );
}
