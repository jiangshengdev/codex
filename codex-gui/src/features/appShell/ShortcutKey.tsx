import { Kbd } from "@heroui/react";

const macModifiers = [
  { key: "Control", abbreviation: "ctrl", name: "Control" },
  { key: "Alt", abbreviation: "option", name: "Option" },
  { key: "Shift", abbreviation: "shift", name: "Shift" },
  { key: "Meta", abbreviation: "command", name: "Command" },
] as const;

export function ShortcutKey({ aria }: Readonly<{ aria: string }>) {
  const keys = aria.split("+");
  const mac = navigator.platform.startsWith("Mac");
  const modifiers = macModifiers.filter(({ key }) => keys.includes(key));
  const readable = mac
    ? [...modifiers.map(({ name }) => name), keys.at(-1)].join("+")
    : aria.replace("Control", "Ctrl");

  return (
    <Kbd className="shrink-0 whitespace-nowrap" aria-label={readable}>
      {mac ? (
        <>
          {modifiers.map(({ key, abbreviation }) => (
            <Kbd.Abbr key={key} keyValue={abbreviation} />
          ))}
          <Kbd.Content>{keys.at(-1)}</Kbd.Content>
        </>
      ) : (
        <Kbd.Content>{readable}</Kbd.Content>
      )}
    </Kbd>
  );
}
