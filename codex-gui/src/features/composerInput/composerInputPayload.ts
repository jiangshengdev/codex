import type { TurnStartParams, TurnSteerParams } from "@codex-protocol/v2";

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

type ComposerInputPayloadSource = TurnSteerParams["input"] extends TurnStartParams["input"]
  ? TurnStartParams["input"] extends TurnSteerParams["input"]
    ? TurnSteerParams["input"]
    : never
  : never;

export type ReadonlyComposerInputPayload = DeepReadonly<ComposerInputPayloadSource>;

function copyComposerInputPayloadItem(
  item: ReadonlyComposerInputPayload[number],
): ComposerInputPayloadSource[number] {
  switch (item.type) {
    case "text":
      return {
        ...item,
        text_elements: item.text_elements.map((element) => structuredClone(element)),
      };
    case "image":
    case "localImage":
    case "audio":
    case "localAudio":
    case "skill":
    case "mention":
      return { ...item };
    default: {
      const exhaustiveItem: never = item;
      return exhaustiveItem;
    }
  }
}

export function copyComposerInputPayload(
  input: ReadonlyComposerInputPayload,
): ComposerInputPayloadSource {
  return input.map(copyComposerInputPayloadItem);
}
