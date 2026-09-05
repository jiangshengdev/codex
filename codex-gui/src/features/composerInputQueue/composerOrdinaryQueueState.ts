import type { ReadonlyComposerInputPayload } from "@/features/composerInput/composerInputPayload";
import type {
  ComposerPendingInputManagement,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputMovement,
  ComposerQueueMessage,
} from "./composerInputQueueContracts";
import { composerPendingInputMoveTargetIndex, moveArrayElement } from "./composerPendingInputMove";

export type OrdinaryEditAcquisition = Readonly<{
  type: "acquiring";
  original: ComposerQueueMessage;
  owner: object;
}>;

export type OrdinaryEditReservation = Readonly<{
  type: "reservation";
  original: ComposerQueueMessage;
  owner: object;
}>;

type OrdinarySlot = ComposerQueueMessage | OrdinaryEditAcquisition | OrdinaryEditReservation;

export type ComposerOrdinaryPendingInput = Readonly<{
  messageId: ComposerQueueMessage["id"];
  input: ReadonlyComposerInputPayload;
  management: ComposerPendingInputManagement;
  movement: ComposerPendingInputMovement | null;
}>;

export type OrdinaryEditAcquisitionResult =
  | Readonly<{ type: "acquired"; acquisition: OrdinaryEditAcquisition }>
  | Readonly<{ type: "notManageable" }>;

export type OrdinaryEditSettlementResult =
  | Readonly<{ type: "settled" }>
  | Readonly<{ type: "unavailable" }>;

export type OrdinaryDeleteResult =
  | Readonly<{ type: "deleted"; messageId: string }>
  | Readonly<{ type: "notManageable" }>;

export type OrdinaryMoveResult =
  | Readonly<{ type: "moved"; position: number; count: number }>
  | Readonly<{ type: "noOp"; reason: "alreadyAtDestination" }>
  | Readonly<{ type: "notManageable" }>;

export type OrdinaryTakeFrontResult =
  | Readonly<{ type: "taken"; message: ComposerQueueMessage }>
  | Readonly<{ type: "empty" }>
  | Readonly<{ type: "blocked" }>;

export type OrdinaryDrainResult =
  | Readonly<{ type: "drained"; messages: readonly ComposerQueueMessage[] }>
  | Readonly<{ type: "blocked" }>;

export type ComposerOrdinaryQueueState = Readonly<{
  count(): number;
  readPendingInputs(
    offset: number,
    limit: number,
    movementBlocked: boolean,
  ): readonly ComposerOrdinaryPendingInput[];
  findPendingInput(messageId: ComposerQueueMessage["id"]): ComposerQueueMessage | null;
  findManageableIndex(messageId: ComposerQueueMessage["id"] | undefined): number;
  acquirePendingInputEdit(index: number): OrdinaryEditAcquisitionResult;
  rollbackPendingInputEdit(acquisition: OrdinaryEditAcquisition): OrdinaryEditSettlementResult;
  reservePendingInputEdit(acquisition: OrdinaryEditAcquisition): OrdinaryEditReservation | null;
  savePendingInputEdit(
    reservation: OrdinaryEditReservation,
    message: ComposerQueueMessage,
  ): OrdinaryEditSettlementResult;
  cancelPendingInputEdit(reservation: OrdinaryEditReservation): OrdinaryEditSettlementResult;
  deletePendingInput(index: number): OrdinaryDeleteResult;
  movePendingInput(
    index: number,
    destination: ComposerPendingInputMoveDestination,
  ): OrdinaryMoveResult;
  enqueue(message: ComposerQueueMessage): void;
  takeFront(): OrdinaryTakeFrontResult;
  drain(): OrdinaryDrainResult;
  restoreFront(messages: readonly ComposerQueueMessage[]): void;
}>;

class ComposerOrdinaryQueueStateImpl implements ComposerOrdinaryQueueState {
  private readonly slots: OrdinarySlot[] = [];

  public count = (): number => this.slots.length;

  public readPendingInputs = (
    offset: number,
    limit: number,
    movementBlocked: boolean,
  ): readonly ComposerOrdinaryPendingInput[] =>
    this.slots.slice(offset, offset + limit).map((slot, pageIndex) => {
      const message = this.slotMessage(slot);
      const index = offset + pageIndex;
      return {
        messageId: message.id,
        input: message.input,
        management: { type: slot.type === "reservation" ? "editing" : "manageable" } as const,
        movement:
          !movementBlocked && slot.type === "recoverable"
            ? {
                position: index + 1,
                count: this.slots.length,
                canMoveEarlier: index > 0,
                canMoveLater: index + 1 < this.slots.length,
              }
            : null,
      };
    });

  public findPendingInput = (
    messageId: ComposerQueueMessage["id"],
  ): ComposerQueueMessage | null => {
    const slot = this.slots.find((candidate) => this.slotMessage(candidate).id === messageId);
    return slot == null ? null : this.slotMessage(slot);
  };

  public findManageableIndex = (messageId: ComposerQueueMessage["id"] | undefined): number =>
    this.slots.findIndex((slot) => slot.type === "recoverable" && slot.id === messageId);

  public acquirePendingInputEdit = (index: number): OrdinaryEditAcquisitionResult => {
    const message = this.slots[index];
    if (message?.type !== "recoverable") {
      return { type: "notManageable" };
    }
    const acquisition: OrdinaryEditAcquisition = {
      type: "acquiring",
      original: message,
      owner: {},
    };
    this.slots[index] = acquisition;
    return { type: "acquired", acquisition };
  };

  public rollbackPendingInputEdit = (
    acquisition: OrdinaryEditAcquisition,
  ): OrdinaryEditSettlementResult => {
    const index = this.slots.findIndex(
      (slot) => slot.type === "acquiring" && slot.owner === acquisition.owner,
    );
    if (index < 0) {
      return { type: "unavailable" };
    }
    this.slots[index] = acquisition.original;
    return { type: "settled" };
  };

  public reservePendingInputEdit = (
    acquisition: OrdinaryEditAcquisition,
  ): OrdinaryEditReservation | null => {
    const index = this.slots.findIndex(
      (slot) => slot.type === "acquiring" && slot.owner === acquisition.owner,
    );
    if (index < 0) {
      return null;
    }
    const reservation: OrdinaryEditReservation = {
      type: "reservation",
      original: acquisition.original,
      owner: acquisition.owner,
    };
    this.slots[index] = reservation;
    return reservation;
  };

  public savePendingInputEdit = (
    reservation: OrdinaryEditReservation,
    message: ComposerQueueMessage,
  ): OrdinaryEditSettlementResult => {
    const index = this.findOwnedReservation(reservation);
    if (index < 0) {
      return { type: "unavailable" };
    }
    this.slots[index] = message;
    return { type: "settled" };
  };

  public cancelPendingInputEdit = (
    reservation: OrdinaryEditReservation,
  ): OrdinaryEditSettlementResult => {
    const index = this.findOwnedReservation(reservation);
    if (index < 0) {
      return { type: "unavailable" };
    }
    this.slots[index] = reservation.original;
    return { type: "settled" };
  };

  public deletePendingInput = (index: number): OrdinaryDeleteResult => {
    const slot = this.slots[index];
    if (slot?.type !== "recoverable") {
      return { type: "notManageable" };
    }
    this.slots.splice(index, 1);
    return { type: "deleted", messageId: slot.id };
  };

  public movePendingInput = (
    index: number,
    destination: ComposerPendingInputMoveDestination,
  ): OrdinaryMoveResult => {
    const slot = this.slots[index];
    if (slot?.type !== "recoverable") {
      return { type: "notManageable" };
    }
    const count = this.slots.length;
    const targetIndex = composerPendingInputMoveTargetIndex(index, count, destination);
    if (targetIndex === index) {
      return { type: "noOp", reason: "alreadyAtDestination" };
    }
    moveArrayElement(this.slots, index, targetIndex);
    return { type: "moved", position: targetIndex + 1, count };
  };

  public enqueue = (message: ComposerQueueMessage): void => {
    this.slots.push(message);
  };

  public takeFront = (): OrdinaryTakeFrontResult => {
    const head = this.slots[0];
    if (head == null) {
      return { type: "empty" };
    }
    if (head.type !== "recoverable") {
      return { type: "blocked" };
    }
    this.slots.shift();
    return { type: "taken", message: head };
  };

  public drain = (): OrdinaryDrainResult => {
    if (this.slots.some((slot) => slot.type !== "recoverable")) {
      return { type: "blocked" };
    }
    const messages = this.slots.map((slot) => {
      if (slot.type !== "recoverable") {
        throw new Error("Composer ordinary queue drain crossed a pending input edit");
      }
      return slot;
    });
    this.slots.splice(0);
    return { type: "drained", messages };
  };

  public restoreFront = (messages: readonly ComposerQueueMessage[]): void => {
    this.slots.unshift(...messages);
  };

  private findOwnedReservation(reservation: OrdinaryEditReservation): number {
    return this.slots.findIndex(
      (slot) => slot.type === "reservation" && slot.owner === reservation.owner,
    );
  }

  private slotMessage(slot: OrdinarySlot): ComposerQueueMessage {
    return slot.type === "recoverable" ? slot : slot.original;
  }
}

export function createComposerOrdinaryQueueState(): ComposerOrdinaryQueueState {
  return new ComposerOrdinaryQueueStateImpl();
}
