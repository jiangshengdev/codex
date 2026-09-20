import {
  Button,
  Card,
  Chip,
  Disclosure,
  DisclosureGroup,
  Dropdown,
  Label,
  Modal,
  Separator,
} from "@heroui/react";
import { ArrowDown, ArrowUp, Ellipsis, Pencil, Trash2 } from "lucide-react";
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
    <DisclosureGroup
      allowsMultipleExpanded
      className="min-w-0"
      defaultExpandedKeys={["steer", "ordinary"]}
    >
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
      {guidingCount > 0 && ordinaryQueuedCount > 0 ? <Separator className="my-2" /> : null}
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
    </DisclosureGroup>
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
    <Disclosure id={lane}>
      {({ isExpanded }) => (
        <>
          <Disclosure.Heading
            level={3}
            ref={(element) => {
              registerLaneHeading(lane, element);
            }}
            tabIndex={-1}
          >
            <Button
              slot="trigger"
              size="sm"
              variant={isExpanded ? "secondary" : "tertiary"}
              className={`w-full border-none ${isExpanded ? "" : "bg-transparent"}`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {lane === "steer" ? <Trans>Guiding</Trans> : <Trans>Queued</Trans>}
                <Chip color="accent" size="sm" variant="soft">
                  {count}
                </Chip>
              </span>
              <Disclosure.Indicator className="text-muted" />
            </Button>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="grid min-w-0 gap-3">
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
                  className="justify-self-center"
                  onPress={() => {
                    onShowMore(lane);
                  }}
                  variant="tertiary"
                >
                  <Trans>Show more</Trans>
                </Button>
              )}
            </Disclosure.Body>
          </Disclosure.Content>
        </>
      )}
    </Disclosure>
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
  const [detailText, setDetailText] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const preview = item.preview;
  const previewText = preview.type === "text" ? preview.text : t`Structured input`;
  const onDetailOpenChange = (isOpen: boolean): void => {
    if (!isOpen) {
      setDetailText(null);
      return;
    }
    const detail = composerRole.readPendingInputDetail({ key: item.key, revision });
    if (detail.type !== "detail") {
      setDetailText(null);
      onDetailFailure(detail);
      return;
    }
    setDetailText(detail.text);
  };
  const content =
    preview.type === "text" && preview.truncated ? (
      <>
        <ComposerInputPreviewContent preview={preview} />
        <Modal isOpen={detailText != null} onOpenChange={onDetailOpenChange}>
          <Button className="self-end" size="sm" variant="tertiary">
            <Trans comment="Open a dialog containing the complete pending message">
              View full message
            </Trans>
          </Button>
          <Modal.Backdrop>
            <Modal.Container scroll="inside" size="lg">
              <Modal.Dialog>
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>
                    <Trans>Pending details</Trans>
                  </Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <p className="min-w-0 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {detailText}
                  </p>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </>
    ) : (
      <ComposerInputPreviewContent preview={preview} />
    );
  return (
    <Card
      aria-label={previewText}
      className="min-w-0"
      ref={(element) => {
        registerItemFocusTarget(item.key, element);
      }}
      role="group"
      tabIndex={-1}
    >
      <Card.Content>{content}</Card.Content>
      {item.management.type === "manageable" ? (
        confirmingDelete ? (
          <Card.Footer className="flex-wrap justify-end gap-2">
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
          </Card.Footer>
        ) : (
          <Card.Footer className="flex-wrap justify-end gap-2">
            {!actionsDisabled && item.movement != null ? (
              <>
                <Button
                  aria-label={t`Move up pending message: ${previewText}`}
                  isIconOnly
                  isDisabled={!item.movement.canMoveEarlier}
                  onPress={() => {
                    onMove(item, "earlier");
                  }}
                  size="sm"
                  variant="tertiary"
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  aria-label={t`Move down pending message: ${previewText}`}
                  isIconOnly
                  isDisabled={!item.movement.canMoveLater}
                  onPress={() => {
                    onMove(item, "later");
                  }}
                  size="sm"
                  variant="tertiary"
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </Button>
                <Dropdown>
                  <Button
                    aria-label={t`More move options for pending message: ${previewText}`}
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                  >
                    <Ellipsis aria-hidden="true" className="size-4" />
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
              aria-label={t`Edit`}
              isIconOnly
              isDisabled={actionsDisabled}
              onPress={() => {
                onBeginEdit(item);
              }}
              size="sm"
              variant="tertiary"
            >
              <Pencil aria-hidden="true" className="size-4" />
            </Button>
            <Button
              aria-label={t`Delete`}
              isIconOnly
              isDisabled={actionsDisabled}
              onPress={() => {
                setConfirmingDelete(true);
              }}
              size="sm"
              variant="danger-soft"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </Card.Footer>
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
    </Card>
  );
}
