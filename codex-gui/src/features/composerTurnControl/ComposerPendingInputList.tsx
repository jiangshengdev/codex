import { Button, Chip, Disclosure, Dropdown, Label, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type {
  ComposerPendingInputDetailResult,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import { ComposerInputPreviewContent } from "./ComposerInputPreviewContent";
import type { ComposerPendingInputPrefixes } from "./composerPendingInputPages";

export type ComposerPendingInputListPages = ComposerPendingInputPrefixes &
  Readonly<{
    composerRole: ActiveThreadComposerRole;
  }>;

export function ComposerPendingInputList({
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
  pages: ComposerPendingInputListPages | null;
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
