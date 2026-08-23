import { Alert, Button, Chip, Disclosure, Drawer, Separator } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { ComposerEditorController } from "@/features/composerEditor/ComposerEditor";
import type {
  ComposerPendingInputCursor,
  ComposerPendingInputDetailResult,
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputPreview } from "@/features/composerInputQueue/composerInputPreview";
import type {
  ComposerInputQueueCoordinator,
  ComposerInputQueueCoordinatorSnapshot,
  ComposerPendingInputCoordinatorEditReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { ComposerPendingInputEditor } from "./ComposerPendingInputEditor";

const PENDING_INPUT_PAGE_SIZE = 20;

type PendingInputPages = Readonly<{
  controller: ComposerInputQueueCoordinator;
  revision: number;
  ordinary: readonly ComposerPendingInputPageItem[];
  ordinaryCursor: ComposerPendingInputCursor | null;
  steer: readonly ComposerPendingInputPageItem[];
  steerCursor: ComposerPendingInputCursor | null;
}>;

type EditSession =
  | Readonly<{ phase: "preparing"; item: ComposerPendingInputPageItem }>
  | Readonly<{
      phase: "active";
      item: ComposerPendingInputPageItem;
      reservation: ComposerPendingInputCoordinatorEditReservation;
    }>;

type DrawerAlert =
  | "empty"
  | "invalidDraft"
  | "notManageable"
  | "sessionInvalidated"
  | "stale"
  | "targetInvalidated";

export type ComposerPendingInputDrawerProps = Readonly<{
  controller: ComposerInputQueueCoordinator | null;
  guardCompositionEndEnter: boolean;
  onFocusComposer: () => void;
  onPresenceChange: (isPresent: boolean) => void;
  onRetrySkillCatalog: () => void;
  skillCatalog: SkillCatalogState;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
}>;

export function ComposerPendingInputDrawer({
  controller,
  guardCompositionEndEnter,
  onFocusComposer,
  onPresenceChange,
  onRetrySkillCatalog,
  skillCatalog,
  snapshot,
}: ComposerPendingInputDrawerProps) {
  const { t } = useLingui();
  const { detailRevision, guidingCount, ordinaryQueuedCount, pendingInputManagementOutcome } =
    snapshot;
  const [isOpen, setIsOpen] = useState(false);
  const [isInvalidClosing, setIsInvalidClosing] = useState(false);
  const [pages, setPages] = useState<PendingInputPages | null>(null);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const editSessionRef = useRef<EditSession | null>(null);
  editSessionRef.current = editSession;
  const [alert, setAlert] = useState<DrawerAlert | null>(null);
  const [managementCompletionHold, setManagementCompletionHold] = useState(false);
  const [editorValid, setEditorValid] = useState(true);
  const focusAfterCloseRef = useRef<"composer" | "trigger" | null>(null);
  const previousControllerRef = useRef(controller);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const pendingEditorControllerRef = useRef<ComposerEditorController | null>(null);
  const itemFocusTargetsRef = useRef(new Map<string, HTMLElement>());
  const laneHeadingRefs = useRef(new Map<ComposerPendingInputLane, HTMLHeadingElement>());
  const handledOutcomeRef = useRef(pendingInputManagementOutcome);
  const hasPendingInputs = controller != null && (guidingCount > 0 || ordinaryQueuedCount > 0);
  const visiblePages = pages?.controller === controller ? pages : null;

  const closeInvalidDrawer = useCallback((): void => {
    focusAfterCloseRef.current = "composer";
    setIsInvalidClosing(true);
    onPresenceChange(true);
    setIsOpen(false);
    setPages(null);
    editSessionRef.current = null;
    setEditSession(null);
    setAlert(null);
    setManagementCompletionHold(false);
  }, [onPresenceChange]);

  const focusHeading = useCallback((): void => {
    queueMicrotask(() => headingRef.current?.focus());
  }, []);

  const refreshPages = useCallback(
    (revision: number): PendingInputPages | null => {
      if (controller == null) return null;
      const nextPages = readInitialPages(controller, revision, guidingCount, ordinaryQueuedCount);
      if (nextPages == null) return null;
      setPages(nextPages);
      return nextPages;
    },
    [controller, guidingCount, ordinaryQueuedCount],
  );

  const closeAfterExplicitRequest = useCallback((): void => {
    if (hasPendingInputs) {
      focusAfterCloseRef.current = "trigger";
      onPresenceChange(false);
    } else {
      focusAfterCloseRef.current = "composer";
      setIsInvalidClosing(true);
      onPresenceChange(true);
    }
    setIsOpen(false);
  }, [hasPendingInputs, onPresenceChange]);

  const handleLiveFailure = useCallback(
    (nextAlert: Exclude<DrawerAlert, "empty">, revision: number): void => {
      setManagementCompletionHold(true);
      editSessionRef.current = null;
      setEditSession(null);
      setAlert(nextAlert);
      refreshPages(revision);
      focusHeading();
    },
    [focusHeading, refreshPages],
  );

  const settleResult = useCallback(
    (
      result:
        | ReturnType<ComposerPendingInputCoordinatorEditReservation["save"]>
        | ReturnType<ComposerPendingInputCoordinatorEditReservation["cancel"]>,
      closeAfterSettlement: boolean,
      focusKey: string,
    ): boolean => {
      if (result.type === "unavailable") {
        if (result.scope === "ownerGone") {
          closeInvalidDrawer();
          return false;
        }
        handleLiveFailure(
          result.reason === "targetInvalidated" ? "targetInvalidated" : "sessionInvalidated",
          result.revision,
        );
        return false;
      }
      if (result.type === "invalidInput") {
        setAlert("empty");
        return false;
      }
      editSessionRef.current = null;
      setEditSession(null);
      setAlert(null);
      if (closeAfterSettlement) {
        closeAfterExplicitRequest();
      } else {
        const nextPages = refreshPages(result.revision);
        setManagementCompletionHold(nextPages != null && pendingInputPagesAreEmpty(nextPages));
        queueMicrotask(() => {
          const focusTarget = itemFocusTargetsRef.current.get(focusKey);
          if (focusTarget == null) focusHeading();
          else focusTarget.focus();
        });
      }
      return true;
    },
    [closeAfterExplicitRequest, closeInvalidDrawer, focusHeading, handleLiveFailure, refreshPages],
  );

  const cancelEdit = useCallback(
    (closeAfterSettlement: boolean): boolean => {
      if (editSession?.phase !== "active") return false;
      return settleResult(
        editSession.reservation.cancel(),
        closeAfterSettlement,
        editSession.item.key,
      );
    },
    [editSession, settleResult],
  );

  const requestClose = useCallback((): void => {
    if (editSession?.phase === "active" && !cancelEdit(true)) return;
    if (editSession?.phase === "preparing") {
      editSessionRef.current = null;
      setEditSession(null);
    }
    if (editSession?.phase !== "active") closeAfterExplicitRequest();
  }, [cancelEdit, closeAfterExplicitRequest, editSession]);

  const onDrawerPresenceRef = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element != null) return;
      const focusTarget = focusAfterCloseRef.current;
      focusAfterCloseRef.current = null;
      if (focusTarget === "composer") {
        queueMicrotask(() => {
          onFocusComposer();
          setIsInvalidClosing(false);
          onPresenceChange(false);
        });
      } else if (focusTarget === "trigger") {
        queueMicrotask(() => {
          const trigger = triggerRef.current;
          if (trigger != null) {
            trigger.focus();
            return;
          }
          onFocusComposer();
          setIsInvalidClosing(false);
          onPresenceChange(false);
        });
      }
    },
    [onFocusComposer, onPresenceChange],
  );

  useEffect(() => {
    const ownerChanged = previousControllerRef.current !== controller;
    previousControllerRef.current = controller;
    const managementOutcomeChanged = pendingInputManagementOutcome !== handledOutcomeRef.current;
    handledOutcomeRef.current = pendingInputManagementOutcome;
    if (!isOpen) return;
    if (ownerChanged || controller == null) {
      closeInvalidDrawer();
      return;
    }
    if (
      managementOutcomeChanged &&
      pendingInputManagementOutcome != null &&
      editSession != null &&
      pendingInputManagementOutcome.key === editSession.item.key
    ) {
      handleLiveFailure("targetInvalidated", pendingInputManagementOutcome.revision);
      return;
    }
    if (!hasPendingInputs && !managementCompletionHold) {
      closeInvalidDrawer();
      return;
    }
    if (editSession == null && refreshPages(detailRevision) == null) closeInvalidDrawer();
  }, [
    closeInvalidDrawer,
    controller,
    detailRevision,
    editSession,
    hasPendingInputs,
    handleLiveFailure,
    isOpen,
    managementCompletionHold,
    pendingInputManagementOutcome,
    refreshPages,
  ]);

  const openDrawer = (): void => {
    if (!hasPendingInputs) return;
    setPages(null);
    setAlert(null);
    setManagementCompletionHold(false);
    focusAfterCloseRef.current = null;
    onPresenceChange(true);
    setIsOpen(true);
  };

  const onOpenChange = (open: boolean): void => {
    if (open) {
      onPresenceChange(true);
      setIsOpen(true);
    } else {
      requestClose();
    }
  };

  const beginEdit = (item: ComposerPendingInputPageItem): void => {
    if (editSessionRef.current != null) return;
    setAlert(null);
    setEditorValid(true);
    setEditSession({ phase: "preparing", item });
  };

  const onEditorControllerChange = (editor: ComposerEditorController | null): void => {
    pendingEditorControllerRef.current = editor;
    const currentEditSession = editSessionRef.current;
    if (editor == null || currentEditSession?.phase !== "preparing" || controller == null) return;
    const result = controller.beginPendingInputEdit(
      { key: currentEditSession.item.key, revision: pages?.revision ?? detailRevision },
      editor.restore,
    );
    if (result.type === "begun") {
      const activeSession: EditSession = {
        phase: "active",
        item: currentEditSession.item,
        reservation: result.reservation,
      };
      editSessionRef.current = activeSession;
      setEditSession(activeSession);
      setPages((current) =>
        current == null ? current : { ...current, revision: result.revision },
      );
      queueMicrotask(() => editor.focus());
      return;
    }
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      closeInvalidDrawer();
      return;
    }
    const nextAlert: Exclude<DrawerAlert, "empty"> =
      result.type === "stale"
        ? "stale"
        : result.type === "notManageable"
          ? "notManageable"
          : result.type === "invalidDraft"
            ? "invalidDraft"
            : "sessionInvalidated";
    handleLiveFailure(nextAlert, result.revision);
  };

  const saveEdit = (): void => {
    if (editSession?.phase !== "active" || pendingEditorControllerRef.current == null) return;
    settleResult(
      editSession.reservation.save(pendingEditorControllerRef.current.capture()),
      false,
      editSession.item.key,
    );
  };

  const deleteItem = (item: ComposerPendingInputPageItem): boolean => {
    if (controller == null || pages == null) return false;
    const visibleKeys = pages[item.lane].map(({ key }) => key);
    const deletedIndex = visibleKeys.indexOf(item.key);
    const focusKey =
      visibleKeys[deletedIndex + 1] ?? (deletedIndex > 0 ? visibleKeys[deletedIndex - 1] : null);
    const result = controller.deletePendingInput({ key: item.key, revision: pages.revision });
    if (result.type === "deleted") {
      setAlert(null);
      const nextPages = refreshPages(result.revision);
      setManagementCompletionHold(nextPages != null && pendingInputPagesAreEmpty(nextPages));
      queueMicrotask(() => {
        const itemTarget = focusKey == null ? null : itemFocusTargetsRef.current.get(focusKey);
        const laneHeading = laneHeadingRefs.current.get(item.lane);
        if (itemTarget != null) itemTarget.focus();
        else if (laneHeading != null) laneHeading.focus();
        else focusHeading();
      });
      return true;
    }
    if (result.type === "unavailable" && result.scope === "ownerGone") {
      closeInvalidDrawer();
      return false;
    }
    handleLiveFailure(
      result.type === "stale"
        ? "stale"
        : result.type === "notManageable"
          ? "notManageable"
          : "sessionInvalidated",
      result.revision,
    );
    return false;
  };

  const handleDetailFailure = (
    result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>,
  ): void => {
    if (result.type === "missing") return;
    if (result.type === "unavailable") {
      closeInvalidDrawer();
    } else {
      handleLiveFailure("stale", result.revision);
    }
  };

  const showMore = (lane: ComposerPendingInputLane): void => {
    if (visiblePages == null) return;
    const cursor = lane === "steer" ? visiblePages.steerCursor : visiblePages.ordinaryCursor;
    if (cursor == null) return;
    const result = visiblePages.controller.readPendingInputPage({
      lane,
      revision: visiblePages.revision,
      cursor,
      limit: PENDING_INPUT_PAGE_SIZE,
    });
    if (result.type === "unavailable") {
      closeInvalidDrawer();
      return;
    }
    if (result.type !== "page") {
      handleLiveFailure("stale", result.revision);
      return;
    }
    setPages((current) => {
      if (
        current?.controller !== visiblePages.controller ||
        current.revision !== visiblePages.revision
      )
        return current;
      return lane === "steer"
        ? { ...current, steer: [...current.steer, ...result.items], steerCursor: result.nextCursor }
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
              <Drawer.Heading ref={headingRef} tabIndex={-1}>
                {editSession?.phase !== "active" ? (
                  <Trans>Pending details</Trans>
                ) : (
                  <Trans>Edit pending message</Trans>
                )}
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {alert == null ? null : <PendingManagementAlert alert={alert} />}
              {editSession?.phase !== "active" ? (
                <PendingInputList
                  actionsDisabled={editSession?.phase === "preparing"}
                  deleteItem={deleteItem}
                  guidingCount={guidingCount}
                  onBeginEdit={beginEdit}
                  onDetailFailure={handleDetailFailure}
                  onShowMore={showMore}
                  ordinaryQueuedCount={ordinaryQueuedCount}
                  pages={visiblePages}
                  registerItemFocusTarget={(key, element) => {
                    if (element == null) itemFocusTargetsRef.current.delete(key);
                    else itemFocusTargetsRef.current.set(key, element);
                  }}
                  registerLaneHeading={(lane, element) => {
                    if (element == null) laneHeadingRefs.current.delete(lane);
                    else laneHeadingRefs.current.set(lane, element);
                  }}
                />
              ) : null}
              {editSession == null ? null : (
                <div hidden={editSession.phase === "preparing"}>
                  <ComposerPendingInputEditor
                    guardCompositionEndEnter={guardCompositionEndEnter}
                    onControllerChange={onEditorControllerChange}
                    onRetrySkillCatalog={onRetrySkillCatalog}
                    onSave={saveEdit}
                    onValidityChange={setEditorValid}
                    skillCatalog={skillCatalog}
                  />
                </div>
              )}
            </Drawer.Body>
            {editSession?.phase !== "active" ? null : (
              <Drawer.Footer>
                <Button onPress={() => cancelEdit(false)} variant="secondary">
                  <Trans>Cancel</Trans>
                </Button>
                <Button isDisabled={!editorValid} onPress={saveEdit} variant="primary">
                  <Trans>Save</Trans>
                </Button>
              </Drawer.Footer>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
}

function PendingManagementAlert({ alert }: Readonly<{ alert: DrawerAlert }>) {
  return (
    <Alert
      role="alert"
      status={alert === "empty" || alert === "invalidDraft" ? "danger" : "warning"}
    >
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {alert === "empty" ? (
            <Trans>Message cannot be empty</Trans>
          ) : (
            <Trans>Pending message changed</Trans>
          )}
        </Alert.Title>
        <Alert.Description>
          {alert === "invalidDraft" ? (
            <Trans>This pending message cannot be edited.</Trans>
          ) : alert === "targetInvalidated" ? (
            <Trans>The target turn closed before the edit was saved.</Trans>
          ) : alert === "notManageable" ? (
            <Trans>
              This message has entered the sending process and can no longer be managed.
            </Trans>
          ) : alert === "empty" ? (
            <Trans>Enter a message before saving.</Trans>
          ) : (
            <Trans>Refresh complete. Try the action again.</Trans>
          )}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function PendingInputList({
  actionsDisabled,
  deleteItem,
  guidingCount,
  onBeginEdit,
  onDetailFailure,
  onShowMore,
  ordinaryQueuedCount,
  pages,
  registerItemFocusTarget,
  registerLaneHeading,
}: Readonly<{
  actionsDisabled: boolean;
  deleteItem: (item: ComposerPendingInputPageItem) => boolean;
  guidingCount: number;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onShowMore: (lane: ComposerPendingInputLane) => void;
  ordinaryQueuedCount: number;
  pages: PendingInputPages | null;
  registerItemFocusTarget: (key: string, element: HTMLElement | null) => void;
  registerLaneHeading: (lane: ComposerPendingInputLane, element: HTMLHeadingElement | null) => void;
}>) {
  if (pages == null) return null;
  if (guidingCount === 0 && ordinaryQueuedCount === 0)
    return (
      <p className="text-sm">
        <Trans>No pending messages</Trans>
      </p>
    );
  return (
    <div className="grid min-w-0 gap-4">
      {guidingCount > 0 ? (
        <PendingInputGroup
          actionsDisabled={actionsDisabled}
          controller={pages.controller}
          count={guidingCount}
          items={pages.steer}
          lane="steer"
          nextCursor={pages.steerCursor}
          onBeginEdit={onBeginEdit}
          onDetailFailure={onDetailFailure}
          onDelete={deleteItem}
          onShowMore={onShowMore}
          registerItemFocusTarget={registerItemFocusTarget}
          registerLaneHeading={registerLaneHeading}
          revision={pages.revision}
        />
      ) : null}
      {guidingCount > 0 && ordinaryQueuedCount > 0 ? <Separator variant="tertiary" /> : null}
      {ordinaryQueuedCount > 0 ? (
        <PendingInputGroup
          actionsDisabled={actionsDisabled}
          controller={pages.controller}
          count={ordinaryQueuedCount}
          items={pages.ordinary}
          lane="ordinary"
          nextCursor={pages.ordinaryCursor}
          onBeginEdit={onBeginEdit}
          onDetailFailure={onDetailFailure}
          onDelete={deleteItem}
          onShowMore={onShowMore}
          registerItemFocusTarget={registerItemFocusTarget}
          registerLaneHeading={registerLaneHeading}
          revision={pages.revision}
        />
      ) : null}
    </div>
  );
}

function PendingInputGroup({
  actionsDisabled,
  controller,
  count,
  items,
  lane,
  nextCursor,
  onBeginEdit,
  onDetailFailure,
  onDelete,
  onShowMore,
  registerItemFocusTarget,
  registerLaneHeading,
  revision,
}: Readonly<{
  actionsDisabled: boolean;
  controller: ComposerInputQueueCoordinator;
  count: number;
  items: readonly ComposerPendingInputPageItem[];
  lane: ComposerPendingInputLane;
  nextCursor: ComposerPendingInputCursor | null;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onDelete: (item: ComposerPendingInputPageItem) => boolean;
  onShowMore: (lane: ComposerPendingInputLane) => void;
  revision: number;
  registerItemFocusTarget: (key: string, element: HTMLElement | null) => void;
  registerLaneHeading: (lane: ComposerPendingInputLane, element: HTMLHeadingElement | null) => void;
}>) {
  const { t } = useLingui();
  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-sm font-medium outline-none"
          ref={(element) => registerLaneHeading(lane, element)}
          tabIndex={-1}
        >
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
              actionsDisabled={actionsDisabled}
              controller={controller}
              item={item}
              onBeginEdit={onBeginEdit}
              onDetailFailure={onDetailFailure}
              onDelete={onDelete}
              registerItemFocusTarget={registerItemFocusTarget}
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
          onPress={() => onShowMore(lane)}
          variant="tertiary"
        >
          <Trans>Show more</Trans>
        </Button>
      )}
    </section>
  );
}

function PendingInputItem({
  actionsDisabled,
  controller,
  item,
  onBeginEdit,
  onDetailFailure,
  onDelete,
  registerItemFocusTarget,
  revision,
}: Readonly<{
  actionsDisabled: boolean;
  controller: ComposerInputQueueCoordinator;
  item: ComposerPendingInputPageItem;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onDelete: (item: ComposerPendingInputPageItem) => boolean;
  revision: number;
  registerItemFocusTarget: (key: string, element: HTMLElement | null) => void;
}>) {
  const { t } = useLingui();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detailText, setDetailText] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const preview = item.preview;
  const previewText = preview.type === "text" ? preview.text : t`Structured input`;
  const onExpandedChange = (expanded: boolean): void => {
    if (!expanded) {
      setIsExpanded(false);
      setDetailText(null);
      return;
    }
    const detail = controller.readPendingInputDetail({ key: item.key, revision });
    if (detail.type !== "detail") {
      setIsExpanded(false);
      setDetailText(null);
      onDetailFailure(detail);
      return;
    }
    setDetailText(detail.text);
    setIsExpanded(true);
  };
  const content =
    preview.type === "text" && preview.truncated ? (
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
    ) : (
      <ComposerInputPreviewContent preview={preview} />
    );
  return (
    <div
      aria-label={previewText}
      className="grid min-w-0 gap-2 rounded-medium border border-separator p-3 outline-none"
      ref={(element) => registerItemFocusTarget(item.key, element)}
      role="group"
      tabIndex={-1}
    >
      {content}
      {item.management.type === "manageable" ? (
        confirmingDelete ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-sm">
              <Trans>Delete this pending message?</Trans>
            </span>
            <Button onPress={() => setConfirmingDelete(false)} size="sm" variant="secondary">
              <Trans>Keep</Trans>
            </Button>
            <Button
              isDisabled={actionsDisabled}
              onPress={() => {
                if (!onDelete(item)) setConfirmingDelete(false);
              }}
              size="sm"
              variant="danger"
            >
              <Trans>Delete</Trans>
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              isDisabled={actionsDisabled}
              onPress={() => onBeginEdit(item)}
              size="sm"
              variant="tertiary"
            >
              <Trans>Edit</Trans>
            </Button>
            <Button
              isDisabled={actionsDisabled}
              onPress={() => setConfirmingDelete(true)}
              size="sm"
              variant="danger-soft"
            >
              <Trans>Delete</Trans>
            </Button>
          </div>
        )
      ) : (
        <p className="text-sm text-muted" role="status">
          {item.management.type === "editing" ? (
            <Trans>This message is being edited.</Trans>
          ) : (
            <Trans>This message has entered the sending process.</Trans>
          )}
        </p>
      )}
    </div>
  );
}

export function ComposerInputPreviewContent({
  preview,
}: Readonly<{ preview: ComposerInputPreview }>) {
  if (preview.type === "text")
    return (
      <p className="min-w-0 line-clamp-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {preview.text}
      </p>
    );
  const counts: ReactNode[] = [];
  if (preview.imageCount > 0)
    counts.push(<Plural key="images" value={preview.imageCount} one="# image" other="# images" />);
  if (preview.audioCount > 0)
    counts.push(
      <Plural key="audio" value={preview.audioCount} one="# audio item" other="# audio items" />,
    );
  if (preview.skillCount > 0)
    counts.push(<Plural key="skills" value={preview.skillCount} one="# skill" other="# skills" />);
  if (preview.mentionCount > 0)
    counts.push(
      <Plural key="mentions" value={preview.mentionCount} one="# mention" other="# mentions" />,
    );
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
  if (steer == null || ordinary == null) return null;
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
  if (count === 0) return { items: [], nextCursor: null };
  const result = controller.readPendingInputPage({
    lane,
    revision,
    cursor: null,
    limit: PENDING_INPUT_PAGE_SIZE,
  });
  return result.type === "page" ? { items: result.items, nextCursor: result.nextCursor } : null;
}

function pendingInputPagesAreEmpty(pages: PendingInputPages): boolean {
  return pages.steer.length === 0 && pages.ordinary.length === 0;
}
