import type {
  ComposerPendingInputCursor,
  ComposerPendingInputDisplayKey,
  ComposerPendingInputLane,
} from "./composerInputQueueContracts";

let nextPendingInputDisplaySequence = 0;

const cursorOwner = Symbol("ComposerPendingInputCursor.owner");
const cursorRevision = Symbol("ComposerPendingInputCursor.revision");
const cursorLane = Symbol("ComposerPendingInputCursor.lane");
const cursorOffset = Symbol("ComposerPendingInputCursor.offset");

type OwnedPendingInputCursor = ComposerPendingInputCursor &
  Readonly<{
    [cursorOwner]: object;
    [cursorRevision]: number;
    [cursorLane]: ComposerPendingInputLane;
    [cursorOffset]: number;
  }>;

type PendingInputIdentityResolution =
  | Readonly<{ type: "current"; messageId: string | null }>
  | Readonly<{ type: "stale"; revision: number }>;

type PendingInputPageIdentityResolution =
  | Readonly<{ type: "current"; offset: number }>
  | Readonly<{ type: "stale"; revision: number }>;

export class ComposerPendingInputIdentity {
  private readonly cursorOwner = {};
  private readonly displayKeyByMessageId = new Map<string, ComposerPendingInputDisplayKey>();
  private readonly messageIdByDisplayKey = new Map<ComposerPendingInputDisplayKey, string>();
  private revision = 0;

  public detailRevision(): number {
    return this.revision;
  }

  public advanceRevision(): void {
    this.revision += 1;
  }

  public resolvePage(
    revision: number,
    lane: ComposerPendingInputLane,
    cursor: ComposerPendingInputCursor | null,
  ): PendingInputPageIdentityResolution {
    if (revision !== this.revision) {
      return { type: "stale", revision: this.revision };
    }
    const ownedCursor = cursor as OwnedPendingInputCursor | null;
    if (
      ownedCursor != null &&
      (ownedCursor[cursorOwner] !== this.cursorOwner ||
        ownedCursor[cursorRevision] !== revision ||
        ownedCursor[cursorLane] !== lane)
    ) {
      return { type: "stale", revision: this.revision };
    }
    return { type: "current", offset: ownedCursor?.[cursorOffset] ?? 0 };
  }

  public resolveDisplayKey(
    revision: number,
    key: ComposerPendingInputDisplayKey,
  ): PendingInputIdentityResolution {
    if (revision !== this.revision) {
      return { type: "stale", revision: this.revision };
    }
    return { type: "current", messageId: this.messageIdByDisplayKey.get(key) ?? null };
  }

  public ownDisplayKey(messageId: string): ComposerPendingInputDisplayKey {
    const existing = this.displayKeyByMessageId.get(messageId);
    if (existing != null) {
      return existing;
    }
    nextPendingInputDisplaySequence += 1;
    const key = `composer-pending-input-${String(
      nextPendingInputDisplaySequence,
    )}` as ComposerPendingInputDisplayKey;
    this.displayKeyByMessageId.set(messageId, key);
    this.messageIdByDisplayKey.set(key, messageId);
    return key;
  }

  public requireDisplayKey(messageId: string): ComposerPendingInputDisplayKey {
    const key = this.displayKeyByMessageId.get(messageId);
    if (key == null) {
      throw new Error("Composer pending input is missing its display key");
    }
    return key;
  }

  public forgetDisplayKey(messageId: string): void {
    const key = this.displayKeyByMessageId.get(messageId);
    if (key == null) {
      return;
    }
    this.displayKeyByMessageId.delete(messageId);
    this.messageIdByDisplayKey.delete(key);
  }

  public createCursor(lane: ComposerPendingInputLane, offset: number): ComposerPendingInputCursor {
    const cursor: OwnedPendingInputCursor = {
      [cursorOwner]: this.cursorOwner,
      [cursorRevision]: this.revision,
      [cursorLane]: lane,
      [cursorOffset]: offset,
    } as OwnedPendingInputCursor;
    return cursor;
  }
}
