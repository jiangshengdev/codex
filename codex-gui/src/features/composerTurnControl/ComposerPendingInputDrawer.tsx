import { Button, Chip, Disclosure, Drawer, Separator } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type {
  ComposerPendingInputCursor,
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputPreview } from "@/features/composerInputQueue/composerInputPreview";
import type { ComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";

const PENDING_INPUT_PAGE_SIZE = 20;

type PendingInputPages = Readonly<{
  controller: ComposerInputQueueCoordinator;
  revision: number;
  ordinary: readonly ComposerPendingInputPageItem[];
  ordinaryCursor: ComposerPendingInputCursor | null;
  steer: readonly ComposerPendingInputPageItem[];
  steerCursor: ComposerPendingInputCursor | null;
}>;

export type ComposerPendingInputDrawerProps = Readonly<{
  controller: ComposerInputQueueCoordinator | null;
  detailRevision: number;
  guidingCount: number;
  onFocusComposer: () => void;
  onPresenceChange: (isPresent: boolean) => void;
  ordinaryQueuedCount: number;
}>;

export function ComposerPendingInputDrawer({
  controller,
  detailRevision,
  guidingCount,
  onFocusComposer,
  onPresenceChange,
  ordinaryQueuedCount,
}: ComposerPendingInputDrawerProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [isInvalidClosing, setIsInvalidClosing] = useState(false);
  const [pages, setPages] = useState<PendingInputPages | null>(null);
  const focusAfterCloseRef = useRef<"composer" | "trigger" | null>(null);
  const previousControllerRef = useRef(controller);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const hasPendingInputs = controller != null && (guidingCount > 0 || ordinaryQueuedCount > 0);
  const visiblePages =
    pages?.controller === controller && pages.revision === detailRevision ? pages : null;
  const closeInvalidDrawer = useCallback((): void => {
    focusAfterCloseRef.current = "composer";
    setIsInvalidClosing(true);
    onPresenceChange(true);
    setIsOpen(false);
    setPages(null);
  }, [onPresenceChange]);
  const onDrawerPresenceRef = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element != null) {
        return;
      }
      const focusTarget = focusAfterCloseRef.current;
      focusAfterCloseRef.current = null;
      if (focusTarget === "composer") {
        queueMicrotask(() => {
          onFocusComposer();
          setIsInvalidClosing(false);
          onPresenceChange(false);
        });
        return;
      }
      if (focusTarget === "trigger") {
        queueMicrotask(() => {
          triggerRef.current?.focus();
        });
      }
    },
    [onFocusComposer, onPresenceChange],
  );

  useEffect(() => {
    const ownerChanged = previousControllerRef.current !== controller;
    previousControllerRef.current = controller;
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      if (!hasPendingInputs || ownerChanged) {
        closeInvalidDrawer();
        return;
      }
      const nextPages = readInitialPages(
        controller,
        detailRevision,
        guidingCount,
        ordinaryQueuedCount,
      );
      if (nextPages == null) {
        closeInvalidDrawer();
        return;
      }
      setPages(nextPages);
    });
    return () => {
      cancelled = true;
    };
  }, [
    controller,
    detailRevision,
    guidingCount,
    hasPendingInputs,
    isOpen,
    closeInvalidDrawer,
    ordinaryQueuedCount,
  ]);

  const openDrawer = (): void => {
    if (!hasPendingInputs) {
      return;
    }
    setPages(null);
    focusAfterCloseRef.current = null;
    onPresenceChange(true);
    setIsOpen(true);
  };

  const onOpenChange = (open: boolean): void => {
    if (open) {
      onPresenceChange(true);
    } else if (focusAfterCloseRef.current !== "composer") {
      focusAfterCloseRef.current = "trigger";
      onPresenceChange(false);
    }
    setIsOpen(open);
  };

  const showMore = (lane: ComposerPendingInputLane): void => {
    if (visiblePages == null) {
      return;
    }
    const cursor = lane === "steer" ? visiblePages.steerCursor : visiblePages.ordinaryCursor;
    if (cursor == null) {
      return;
    }
    const result = visiblePages.controller.readPendingInputPage({
      lane,
      revision: visiblePages.revision,
      cursor,
      limit: PENDING_INPUT_PAGE_SIZE,
    });
    if (result.type !== "page") {
      closeInvalidDrawer();
      return;
    }
    setPages((current) => {
      if (
        current?.controller !== visiblePages.controller ||
        current.revision !== visiblePages.revision
      ) {
        return current;
      }
      return lane === "steer"
        ? {
            ...current,
            steer: [...current.steer, ...result.items],
            steerCursor: result.nextCursor,
          }
        : {
            ...current,
            ordinary: [...current.ordinary, ...result.items],
            ordinaryCursor: result.nextCursor,
          };
    });
  };

  const triggerLabel =
    guidingCount > 0 && ordinaryQueuedCount > 0
      ? t`Pending: Guide ${guidingCount}, Queued ${ordinaryQueuedCount}`
      : guidingCount > 0
        ? t`Pending: Guide ${guidingCount}`
        : t`Pending: Queued ${ordinaryQueuedCount}`;
  const renderTrigger = hasPendingInputs || isOpen || isInvalidClosing;

  return (
    <>
      {renderTrigger ? (
        <Button ref={triggerRef} aria-label={triggerLabel} onPress={openDrawer} variant="secondary">
          <Trans>Pending</Trans>
          {guidingCount > 0 ? (
            <Chip size="sm" variant="secondary">
              <Trans>Guide {guidingCount}</Trans>
            </Chip>
          ) : null}
          {ordinaryQueuedCount > 0 ? (
            <Chip size="sm" variant="tertiary">
              <Trans>Queued {ordinaryQueuedCount}</Trans>
            </Chip>
          ) : null}
        </Button>
      ) : null}
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <span ref={onDrawerPresenceRef} aria-hidden="true" hidden />
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>
                <Trans>Pending details</Trans>
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {visiblePages == null ? null : (
                <div className="grid min-w-0 gap-4">
                  {guidingCount > 0 ? (
                    <PendingInputGroup
                      controller={visiblePages.controller}
                      count={guidingCount}
                      items={visiblePages.steer}
                      lane="steer"
                      nextCursor={visiblePages.steerCursor}
                      onInvalid={closeInvalidDrawer}
                      onShowMore={showMore}
                      revision={visiblePages.revision}
                    />
                  ) : null}
                  {guidingCount > 0 && ordinaryQueuedCount > 0 ? (
                    <Separator variant="tertiary" />
                  ) : null}
                  {ordinaryQueuedCount > 0 ? (
                    <PendingInputGroup
                      controller={visiblePages.controller}
                      count={ordinaryQueuedCount}
                      items={visiblePages.ordinary}
                      lane="ordinary"
                      nextCursor={visiblePages.ordinaryCursor}
                      onInvalid={closeInvalidDrawer}
                      onShowMore={showMore}
                      revision={visiblePages.revision}
                    />
                  ) : null}
                </div>
              )}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
}

function PendingInputGroup({
  controller,
  count,
  items,
  lane,
  nextCursor,
  onInvalid,
  onShowMore,
  revision,
}: Readonly<{
  controller: ComposerInputQueueCoordinator;
  count: number;
  items: readonly ComposerPendingInputPageItem[];
  lane: ComposerPendingInputLane;
  nextCursor: ComposerPendingInputCursor | null;
  onInvalid: () => void;
  onShowMore: (lane: ComposerPendingInputLane) => void;
  revision: number;
}>) {
  const { t } = useLingui();
  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          {lane === "steer" ? <Trans>Guiding</Trans> : <Trans>Queued</Trans>}
        </h3>
        <Chip size="sm" variant={lane === "steer" ? "secondary" : "tertiary"}>
          {count}
        </Chip>
      </div>
      <ul className="grid min-w-0 gap-2">
        {items.map((item) => (
          <li className="min-w-0" key={`${String(revision)}:${item.key}`}>
            <PendingInputItem
              controller={controller}
              item={item}
              onInvalid={onInvalid}
              revision={revision}
            />
          </li>
        ))}
      </ul>
      {nextCursor == null ? null : (
        <Button
          aria-label={
            lane === "steer" ? t`Show more guiding messages` : t`Show more queued messages`
          }
          onPress={() => {
            onShowMore(lane);
          }}
          variant="tertiary"
        >
          <Trans>Show more</Trans>
        </Button>
      )}
    </section>
  );
}

function PendingInputItem({
  controller,
  item,
  onInvalid,
  revision,
}: Readonly<{
  controller: ComposerInputQueueCoordinator;
  item: ComposerPendingInputPageItem;
  onInvalid: () => void;
  revision: number;
}>) {
  const { t } = useLingui();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detailText, setDetailText] = useState<string | null>(null);
  const preview = item.preview;
  if (preview.type !== "text" || !preview.truncated) {
    return <ComposerInputPreviewContent preview={preview} />;
  }
  const previewText = preview.text;

  const onExpandedChange = (expanded: boolean): void => {
    if (!expanded) {
      setIsExpanded(false);
      setDetailText(null);
      return;
    }
    const detail = controller.readPendingInputDetail({ key: item.key, revision });
    if (detail.type === "missing") {
      setIsExpanded(false);
      setDetailText(null);
      return;
    }
    if (detail.type !== "detail") {
      setIsExpanded(false);
      setDetailText(null);
      onInvalid();
      return;
    }
    setDetailText(detail.text);
    setIsExpanded(true);
  };

  return (
    <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
      <Disclosure.Heading>
        <Button
          aria-label={
            isExpanded
              ? t`Collapse pending message: ${previewText}`
              : t`Expand pending message: ${previewText}`
          }
          className="h-auto min-w-0 justify-between whitespace-normal"
          slot="trigger"
          variant="tertiary"
        >
          <ComposerInputPreviewContent preview={preview} />
          <span>{isExpanded ? <Trans>Collapse</Trans> : <Trans>Expand</Trans>}</span>
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="pt-2">
          {detailText == null ? null : (
            <p className="min-w-0 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
              {detailText}
            </p>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

export function ComposerInputPreviewContent({
  preview,
}: Readonly<{ preview: ComposerInputPreview }>) {
  if (preview.type === "text") {
    return (
      <p className="min-w-0 line-clamp-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {preview.text}
      </p>
    );
  }

  const counts: ReactNode[] = [];
  if (preview.imageCount > 0) {
    counts.push(<Plural key="images" value={preview.imageCount} one="# image" other="# images" />);
  }
  if (preview.audioCount > 0) {
    counts.push(
      <Plural key="audio" value={preview.audioCount} one="# audio item" other="# audio items" />,
    );
  }
  if (preview.skillCount > 0) {
    counts.push(<Plural key="skills" value={preview.skillCount} one="# skill" other="# skills" />);
  }
  if (preview.mentionCount > 0) {
    counts.push(
      <Plural key="mentions" value={preview.mentionCount} one="# mention" other="# mentions" />,
    );
  }

  return (
    <p className="flex min-w-0 flex-wrap gap-x-2 text-sm [overflow-wrap:anywhere]">
      {counts.length === 0 ? <Trans>Structured input</Trans> : counts}
    </p>
  );
}

function readInitialPages(
  controller: ComposerInputQueueCoordinator,
  revision: number,
  guidingCount: number,
  ordinaryQueuedCount: number,
): PendingInputPages | null {
  const steer = readInitialLane(controller, "steer", revision, guidingCount);
  const ordinary = readInitialLane(controller, "ordinary", revision, ordinaryQueuedCount);
  if (steer == null || ordinary == null) {
    return null;
  }
  return {
    controller,
    revision,
    steer: steer.items,
    steerCursor: steer.nextCursor,
    ordinary: ordinary.items,
    ordinaryCursor: ordinary.nextCursor,
  };
}

function readInitialLane(
  controller: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
  revision: number,
  count: number,
): Readonly<{
  items: readonly ComposerPendingInputPageItem[];
  nextCursor: ComposerPendingInputCursor | null;
}> | null {
  if (count === 0) {
    return { items: [], nextCursor: null };
  }
  const result = controller.readPendingInputPage({
    lane,
    revision,
    cursor: null,
    limit: PENDING_INPUT_PAGE_SIZE,
  });
  return result.type === "page" ? { items: result.items, nextCursor: result.nextCursor } : null;
}
