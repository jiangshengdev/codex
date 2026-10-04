import {
  Alert,
  Button,
  Card,
  Chip,
  Disclosure,
  DisclosureGroup,
  Dropdown,
  Label,
  Separator,
} from "@heroui/react";
import { ArrowDown, ArrowUp, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useId, useState, type ReactNode } from "react";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import type {
  ComposerPendingInputDetailResult,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import { ComposerFullMessagePreview } from "./ComposerFullMessagePreview";
import { ComposerInputPreviewContent } from "./ComposerInputPreviewContent";
import type { ComposerPendingInputPrefixes } from "./composerPendingInputPages";
import type { ComposerInputQueueCoordinatorSnapshot } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { ComposerPendingInputGroup } from "./composerPendingInputSession";

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
  rejectedSteers,
  pages,
  registerItemFocusTarget,
  registerLaneTrigger,
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
  rejectedSteers: ComposerInputQueueCoordinatorSnapshot["rejectedSteers"];
  pages: ComposerPendingInputListPages | null;
  registerItemFocusTarget: (key: string, element: HTMLElement | null) => void;
  registerLaneTrigger: (lane: ComposerPendingInputGroup, element: HTMLButtonElement | null) => void;
}>) {
  if (pages == null) return null;
  if (guidingCount === 0 && ordinaryQueuedCount === 0 && rejectedSteers.length === 0)
    return (
      <p className="text-sm">
        <Trans>No pending messages</Trans>
      </p>
    );
  return (
    <DisclosureGroup
      allowsMultipleExpanded
      className="min-w-0"
      defaultExpandedKeys={["priority", "steer", "ordinary"]}
    >
      {rejectedSteers.length > 0 ? (
        <PendingInputSection
          lane="priority"
          count={rejectedSteers.length}
          title={
            <Trans comment="Read-only queue of rejected guidance that will be sent before ordinary queued messages">
              Priority
            </Trans>
          }
          registerLaneTrigger={registerLaneTrigger}
        >
          <Alert status="accent" role="status">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                <Trans>Currently unable to guide; added to queue</Trans>
              </Alert.Title>
            </Alert.Content>
          </Alert>
          <ul className="grid min-w-0 gap-2">
            {rejectedSteers.map((item) => (
              <li className="min-w-0" key={item.key}>
                <Card>
                  <Card.Content className="min-w-0 text-foreground">
                    <ComposerFullMessagePreview
                      fullText={item.text}
                      heading={<Trans>Pending details</Trans>}
                      showFullMessage={item.preview.type === "text" && item.preview.truncated}
                      spacing="compact"
                    >
                      <ComposerInputPreviewContent preview={item.preview} />
                    </ComposerFullMessagePreview>
                  </Card.Content>
                </Card>
              </li>
            ))}
          </ul>
        </PendingInputSection>
      ) : null}
      {rejectedSteers.length > 0 && (guidingCount > 0 || ordinaryQueuedCount > 0) ? (
        <Separator className="my-2" />
      ) : null}
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
          registerLaneTrigger={registerLaneTrigger}
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
          registerLaneTrigger={registerLaneTrigger}
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
  registerLaneTrigger,
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
  registerLaneTrigger: (lane: ComposerPendingInputGroup, element: HTMLButtonElement | null) => void;
}>) {
  const { t } = useLingui();
  return (
    <PendingInputSection
      lane={lane}
      count={count}
      title={lane === "steer" ? <Trans>Guiding</Trans> : <Trans>Queued</Trans>}
      registerLaneTrigger={registerLaneTrigger}
    >
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
          variant="secondary"
        >
          <Trans>Show more</Trans>
        </Button>
      )}
    </PendingInputSection>
  );
}

function PendingInputSection({
  lane,
  count,
  title,
  registerLaneTrigger,
  children,
}: Readonly<{
  lane: ComposerPendingInputGroup;
  count: number;
  title: ReactNode;
  registerLaneTrigger: (lane: ComposerPendingInputGroup, element: HTMLButtonElement | null) => void;
  children: ReactNode;
}>) {
  const headingId = useId();
  const onTriggerMount = useCallback(
    (element: HTMLButtonElement | null) => {
      registerLaneTrigger(lane, element);
    },
    [lane, registerLaneTrigger],
  );
  return (
    <Disclosure id={lane}>
      {({ isExpanded }) => (
        <>
          <Disclosure.Heading id={headingId} level={3}>
            <Button
              ref={onTriggerMount}
              slot="trigger"
              size="sm"
              variant={isExpanded ? "secondary" : "tertiary"}
              className={`w-full scroll-mt-2 border-none ${isExpanded ? "" : "bg-transparent"}`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {title}
                <Chip color="accent" size="sm" variant="soft">
                  {count}
                </Chip>
              </span>
              <Disclosure.Indicator className="text-muted" />
            </Button>
          </Disclosure.Heading>
          <Disclosure.Content role="region" aria-labelledby={headingId}>
            <Disclosure.Body className="grid min-w-0 gap-3">{children}</Disclosure.Body>
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
  const content = (
    <ComposerFullMessagePreview
      footerStart={
        item.management.type !== "manageable" && item.management.type !== "editing" ? (
          <Chip color="default" size="sm" variant="soft">
            <Chip.Label>
              <Trans comment="Status label on a pending message; entered the sending process does not mean delivery succeeded.">
                Entered sending process
              </Trans>
            </Chip.Label>
          </Chip>
        ) : null
      }
      fullText={detailText}
      heading={<Trans>Pending details</Trans>}
      isOpen={detailText != null}
      onOpenChange={onDetailOpenChange}
      showFullMessage={preview.type === "text" && preview.truncated}
      spacing="compact"
    >
      <ComposerInputPreviewContent preview={preview} />
    </ComposerFullMessagePreview>
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
      <Card.Content className="text-foreground">{content}</Card.Content>
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
                  <Dropdown.Popover className="w-max">
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
      ) : item.management.type === "editing" ? (
        <p className="text-sm text-muted">
          <Trans>This message is being edited.</Trans>
        </p>
      ) : null}
    </Card>
  );
}
