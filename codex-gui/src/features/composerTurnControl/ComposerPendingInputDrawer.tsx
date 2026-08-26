import { Alert, Button, Chip, Disclosure, Drawer, Dropdown, Label, Separator } from "@heroui/react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type { ComposerEditorController } from "@/features/composerEditor/ComposerEditor";
import type {
  ComposerPendingInputDetailResult,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { ComposerInputPreview } from "@/features/composerInputQueue/composerInputPreview";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import { ComposerPendingInputEditor } from "./ComposerPendingInputEditor";
import type { ComposerPendingInputPrefixes } from "./composerPendingInputPages";
import type {
  ComposerPendingInputAlert,
  ComposerPendingInputCurrentFacts,
  ComposerPendingInputSession,
  ComposerPendingInputSessionSnapshot,
} from "./composerPendingInputSession";

type PendingInputPages = ComposerPendingInputPrefixes &
  Readonly<{
    composerRole: ActiveThreadComposerRole;
  }>;

export type ComposerPendingInputDrawerProps = Readonly<{
  composerRole: ActiveThreadComposerRole;
  guardCompositionEndEnter: boolean;
  mutationsEnabled: boolean;
  onFocusComposer: () => void;
  onRetrySkillCatalog: () => void;
  pendingInputSession: ComposerPendingInputSession;
  pendingInputSnapshot: ComposerPendingInputSessionSnapshot;
  sessionRevision: number;
  skillCatalog: SkillCatalogState;
  snapshot: ComposerInputQueueCoordinatorSnapshot;
}>;

export function ComposerPendingInputDrawer({
  composerRole,
  guardCompositionEndEnter,
  mutationsEnabled,
  onFocusComposer,
  onRetrySkillCatalog,
  pendingInputSession,
  pendingInputSnapshot,
  sessionRevision,
  skillCatalog,
  snapshot,
}: ComposerPendingInputDrawerProps) {
  const { t } = useLingui();
  const { guidingCount, ordinaryQueuedCount } = snapshot;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const editorControllerRef = useRef<Readonly<{
    preparationToken: number;
    controller: ComposerEditorController;
  }> | null>(null);
  const itemFocusTargetsRef = useRef(new Map<string, HTMLElement>());
  const laneHeadingRefs = useRef(new Map<ComposerPendingInputLane, HTMLHeadingElement>());
  const scheduledEffectIdsRef = useRef(new Set<number>());
  const adapterMountedRef = useRef(false);
  const presenceGenerationRef = useRef(pendingInputSnapshot.ownerGeneration);
  const hasPendingInputs = guidingCount > 0 || ordinaryQueuedCount > 0;
  const facts: ComposerPendingInputCurrentFacts = {
    composerRole,
    sessionRevision,
    mutationsEnabled,
    snapshot,
  };
  const view = pendingInputSnapshot.view;
  const edit = view?.edit ?? null;
  const visiblePages: PendingInputPages | null =
    view?.pages == null ? null : { composerRole, ...view.pages };
  const displayedIsOpen = pendingInputSnapshot.phase === "open";
  const onDrawerPresenceRef = useCallback(
    (element: HTMLSpanElement | null): void => {
      if (element == null) {
        pendingInputSession.drawerPresenceEnded(presenceGenerationRef.current);
      }
    },
    [pendingInputSession],
  );

  useEffect(() => {
    presenceGenerationRef.current = pendingInputSnapshot.ownerGeneration;
  }, [pendingInputSnapshot.ownerGeneration]);

  useEffect(() => {
    adapterMountedRef.current = true;
    return () => {
      adapterMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    for (const effect of pendingInputSnapshot.effects) {
      if (scheduledEffectIdsRef.current.has(effect.id)) continue;
      scheduledEffectIdsRef.current.add(effect.id);
      queueMicrotask(() => {
        scheduledEffectIdsRef.current.delete(effect.id);
        if (!adapterMountedRef.current) return;
        const current = pendingInputSession.getSnapshot();
        if (current.ownerGeneration !== effect.ownerGeneration) {
          pendingInputSession.consumeEffect(effect.id);
          return;
        }
        const { target } = effect;
        if (target.type === "composer") {
          onFocusComposer();
        } else if (target.type === "trigger") {
          const trigger = triggerRef.current;
          if (trigger == null) onFocusComposer();
          else trigger.focus();
        } else if (target.type === "drawerHeading") {
          headingRef.current?.focus();
        } else if (target.type === "editor") {
          const attached = editorControllerRef.current;
          if (attached?.preparationToken === target.preparationToken) attached.controller.focus();
          else headingRef.current?.focus();
        } else if (target.type === "laneHeading") {
          (laneHeadingRefs.current.get(target.lane) ?? headingRef.current)?.focus();
        } else {
          const itemTarget = itemFocusTargetsRef.current.get(target.key);
          const laneTarget = laneHeadingRefs.current.get(target.fallbackLane);
          (itemTarget ?? laneTarget ?? headingRef.current)?.focus();
        }
        pendingInputSession.consumeEffect(effect.id);
      });
    }
  }, [onFocusComposer, pendingInputSession, pendingInputSnapshot.effects]);

  const openDrawer = (): void => {
    pendingInputSession.open(facts);
  };

  const onOpenChange = (open: boolean): void => {
    if (open) pendingInputSession.open(facts);
    else pendingInputSession.requestClose(facts);
  };

  const beginEdit = (item: ComposerPendingInputPageItem): void => {
    pendingInputSession.beginEdit(facts, item);
  };

  const saveEdit = (): void => {
    if (edit == null) return;
    pendingInputSession.saveEdit(facts, edit.preparationToken);
  };

  const cancelEdit = (): void => {
    if (edit == null) return;
    pendingInputSession.cancelEdit(facts, edit.preparationToken);
  };

  const deleteItem = (item: ComposerPendingInputPageItem): boolean =>
    pendingInputSession.deleteItem(facts, item).type === "applied";

  const handleDetailFailure = (
    result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>,
  ): void => {
    pendingInputSession.detailFailed(facts, result);
  };

  const showMore = (lane: ComposerPendingInputLane): void => {
    pendingInputSession.showMore(facts, lane);
  };

  const moveItem = (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ): void => {
    pendingInputSession.moveItem(facts, item, destination);
  };

  const triggerLabel =
    guidingCount > 0 && ordinaryQueuedCount > 0
      ? t`Pending: Guide ${guidingCount}, Queued ${ordinaryQueuedCount}`
      : guidingCount > 0
        ? t`Pending: Guide ${guidingCount}`
        : t`Pending: Queued ${ordinaryQueuedCount}`;
  const renderTrigger =
    pendingInputSnapshot.phase !== "closing" && (hasPendingInputs || displayedIsOpen);
  const movedPosition = pendingInputSnapshot.announcement?.position ?? 0;
  const movedCount = pendingInputSnapshot.announcement?.count ?? 0;

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
      <Drawer.Backdrop isOpen={displayedIsOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <span ref={onDrawerPresenceRef} aria-hidden="true" hidden />
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading ref={headingRef} tabIndex={-1}>
                {edit?.phase !== "active" ? (
                  <Trans>Pending details</Trans>
                ) : (
                  <Trans>Edit pending message</Trans>
                )}
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {pendingInputSnapshot.alert == null ? null : (
                <PendingManagementAlert alert={pendingInputSnapshot.alert} />
              )}
              {pendingInputSnapshot.announcement == null ? null : (
                <p aria-live="polite" role="status">
                  {pendingInputSnapshot.announcement.lane === "ordinary" ? (
                    <Trans>
                      Queued message moved to position {movedPosition} of {movedCount}.
                    </Trans>
                  ) : (
                    <Trans>
                      Guiding message moved to position {movedPosition} of {movedCount}.
                    </Trans>
                  )}
                </p>
              )}
              {edit?.phase !== "active" ? (
                <PendingInputList
                  actionsDisabled={!pendingInputSnapshot.actionsEnabled}
                  deleteItem={deleteItem}
                  guidingCount={guidingCount}
                  onBeginEdit={beginEdit}
                  onDetailFailure={handleDetailFailure}
                  onMove={moveItem}
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
              {edit == null ? null : (
                <div hidden={edit.phase === "preparing"}>
                  <PendingInputEditorAdapter
                    controllerRef={editorControllerRef}
                    edit={edit}
                    facts={facts}
                    guardCompositionEndEnter={guardCompositionEndEnter}
                    onRetrySkillCatalog={onRetrySkillCatalog}
                    pendingInputSession={pendingInputSession}
                    skillCatalog={skillCatalog}
                  />
                </div>
              )}
            </Drawer.Body>
            {edit?.phase !== "active" ? null : (
              <Drawer.Footer>
                <Button onPress={cancelEdit} variant="secondary">
                  <Trans>Cancel</Trans>
                </Button>
                <Button isDisabled={!edit.valid} onPress={saveEdit} variant="primary">
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

function PendingInputEditorAdapter({
  controllerRef,
  edit,
  facts,
  guardCompositionEndEnter,
  onRetrySkillCatalog,
  pendingInputSession,
  skillCatalog,
}: Readonly<{
  controllerRef: {
    current: Readonly<{
      preparationToken: number;
      controller: ComposerEditorController;
    }> | null;
  };
  edit: NonNullable<NonNullable<ComposerPendingInputSessionSnapshot["view"]>["edit"]>;
  facts: ComposerPendingInputCurrentFacts;
  guardCompositionEndEnter: boolean;
  onRetrySkillCatalog: () => void;
  pendingInputSession: ComposerPendingInputSession;
  skillCatalog: SkillCatalogState;
}>) {
  const factsRef = useRef(facts);
  useLayoutEffect(() => {
    factsRef.current = facts;
  }, [facts]);
  const handleControllerChange = useCallback(
    (controller: ComposerEditorController | null): void => {
      const currentFacts = factsRef.current;
      if (controller == null) {
        if (controllerRef.current?.preparationToken === edit.preparationToken) {
          controllerRef.current = null;
        }
        pendingInputSession.detachEditor(currentFacts, edit.preparationToken);
        return;
      }
      controllerRef.current = { preparationToken: edit.preparationToken, controller };
      pendingInputSession.attachEditor({
        facts: currentFacts,
        preparationToken: edit.preparationToken,
        itemKey: edit.item.key,
        restore: controller.restore,
        capture: () => controller.capture(),
      });
    },
    [controllerRef, edit.item.key, edit.preparationToken, pendingInputSession],
  );
  const handleValidityChange = useCallback(
    (valid: boolean): void => {
      pendingInputSession.setEditorValidity(factsRef.current, edit.preparationToken, valid);
    },
    [edit.preparationToken, pendingInputSession],
  );
  const handleSave = useCallback((): void => {
    pendingInputSession.saveEdit(factsRef.current, edit.preparationToken);
  }, [edit.preparationToken, pendingInputSession]);

  return (
    <ComposerPendingInputEditor
      guardCompositionEndEnter={guardCompositionEndEnter}
      onControllerChange={handleControllerChange}
      onRetrySkillCatalog={onRetrySkillCatalog}
      onSave={handleSave}
      onValidityChange={handleValidityChange}
      skillCatalog={skillCatalog}
    />
  );
}

function PendingManagementAlert({ alert }: Readonly<{ alert: ComposerPendingInputAlert }>) {
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
          ) : alert === "moveNotApplied" || alert === "moveNotAppliedRefreshFailed" ? (
            <Trans>Pending message was not reordered</Trans>
          ) : alert === "moveRefreshFailed" ? (
            <Trans>Updated pending order could not be loaded</Trans>
          ) : (
            <Trans>Pending message changed</Trans>
          )}
        </Alert.Title>
        <Alert.Description>
          {alert === "invalidDraft" ? (
            <Trans>This pending message cannot be edited.</Trans>
          ) : alert === "moveNotApplied" ? (
            <Trans>The pending-message order did not change. Refresh complete; try again.</Trans>
          ) : alert === "moveNotAppliedRefreshFailed" ? (
            <Trans>
              The pending-message order did not change, and the refreshed order could not be loaded
              because the queue kept changing.
            </Trans>
          ) : alert === "moveRefreshFailed" ? (
            <Trans>
              The message was moved, but repeated queue changes prevented the updated order from
              loading.
            </Trans>
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
  onMove,
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
  onMove: (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ) => void;
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
          composerRole={pages.composerRole}
          count={guidingCount}
          items={pages.steer.items}
          lane="steer"
          nextCursorAvailable={pages.steer.nextCursor != null}
          onBeginEdit={onBeginEdit}
          onDetailFailure={onDetailFailure}
          onDelete={deleteItem}
          onMove={onMove}
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
          composerRole={pages.composerRole}
          count={ordinaryQueuedCount}
          items={pages.ordinary.items}
          lane="ordinary"
          nextCursorAvailable={pages.ordinary.nextCursor != null}
          onBeginEdit={onBeginEdit}
          onDetailFailure={onDetailFailure}
          onDelete={deleteItem}
          onMove={onMove}
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
  composerRole,
  count,
  items,
  lane,
  nextCursorAvailable,
  onBeginEdit,
  onDetailFailure,
  onDelete,
  onMove,
  onShowMore,
  registerItemFocusTarget,
  registerLaneHeading,
  revision,
}: Readonly<{
  actionsDisabled: boolean;
  composerRole: ActiveThreadComposerRole;
  count: number;
  items: readonly ComposerPendingInputPageItem[];
  lane: ComposerPendingInputLane;
  nextCursorAvailable: boolean;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onDelete: (item: ComposerPendingInputPageItem) => boolean;
  onMove: (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ) => void;
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
          ref={(element) => {
            registerLaneHeading(lane, element);
          }}
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
              composerRole={composerRole}
              item={item}
              onBeginEdit={onBeginEdit}
              onDetailFailure={onDetailFailure}
              onDelete={onDelete}
              onMove={onMove}
              registerItemFocusTarget={registerItemFocusTarget}
              revision={revision}
            />
          </li>
        ))}
      </ul>
      {!nextCursorAvailable ? null : (
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
  actionsDisabled,
  composerRole,
  item,
  onBeginEdit,
  onDetailFailure,
  onDelete,
  onMove,
  registerItemFocusTarget,
  revision,
}: Readonly<{
  actionsDisabled: boolean;
  composerRole: ActiveThreadComposerRole;
  item: ComposerPendingInputPageItem;
  onBeginEdit: (item: ComposerPendingInputPageItem) => void;
  onDetailFailure: (result: Exclude<ComposerPendingInputDetailResult, { type: "detail" }>) => void;
  onDelete: (item: ComposerPendingInputPageItem) => boolean;
  onMove: (
    item: ComposerPendingInputPageItem,
    destination: ComposerPendingInputMoveDestination,
  ) => void;
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
    const detail = composerRole.readPendingInputDetail({ key: item.key, revision });
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
      ref={(element) => {
        registerItemFocusTarget(item.key, element);
      }}
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
            <Button
              onPress={() => {
                setConfirmingDelete(false);
              }}
              size="sm"
              variant="secondary"
            >
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
          <div className="flex flex-wrap justify-end gap-2">
            {!actionsDisabled && item.movement != null ? (
              <>
                <Button
                  aria-label={t`Move up pending message: ${previewText}`}
                  isDisabled={!item.movement.canMoveEarlier}
                  onPress={() => {
                    onMove(item, "earlier");
                  }}
                  size="sm"
                  variant="tertiary"
                >
                  <Trans>Move up</Trans>
                </Button>
                <Button
                  aria-label={t`Move down pending message: ${previewText}`}
                  isDisabled={!item.movement.canMoveLater}
                  onPress={() => {
                    onMove(item, "later");
                  }}
                  size="sm"
                  variant="tertiary"
                >
                  <Trans>Move down</Trans>
                </Button>
                <Dropdown>
                  <Button
                    aria-label={t`More move options for pending message: ${previewText}`}
                    size="sm"
                    variant="tertiary"
                  >
                    <Trans>Move to</Trans>
                  </Button>
                  <Dropdown.Popover>
                    <Dropdown.Menu
                      disabledKeys={[
                        ...(item.movement.canMoveEarlier ? [] : ["first"]),
                        ...(item.movement.canMoveLater ? [] : ["last"]),
                      ]}
                      onAction={(key) => {
                        if (key === "first" || key === "last") onMove(item, key);
                      }}
                    >
                      <Dropdown.Item id="first" textValue={t`Move pending message to first`}>
                        <Label>
                          <Trans>Move to first</Trans>
                        </Label>
                      </Dropdown.Item>
                      <Dropdown.Item id="last" textValue={t`Move pending message to last`}>
                        <Label>
                          <Trans>Move to last</Trans>
                        </Label>
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </>
            ) : null}
            <Button
              isDisabled={actionsDisabled}
              onPress={() => {
                onBeginEdit(item);
              }}
              size="sm"
              variant="tertiary"
            >
              <Trans>Edit</Trans>
            </Button>
            <Button
              isDisabled={actionsDisabled}
              onPress={() => {
                setConfirmingDelete(true);
              }}
              size="sm"
              variant="danger-soft"
            >
              <Trans>Delete</Trans>
            </Button>
          </div>
        )
      ) : (
        <p className="text-sm text-muted">
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
