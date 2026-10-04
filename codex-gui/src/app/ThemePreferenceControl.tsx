import { ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Monitor, Moon, Sun } from "lucide-react";
import { useThemePreference } from "./themePreference";

export function ThemePreferenceControl() {
  const { t } = useLingui();
  const { preference, setPreference } = useThemePreference();
  const options = [
    {
      id: "light",
      Icon: Sun,
      label: t({
        message: "Light theme",
        comment: "Accessible name of the explicit light appearance option",
      }),
    },
    {
      id: "dark",
      Icon: Moon,
      label: t({
        message: "Dark theme",
        comment: "Accessible name of the explicit dark appearance option",
      }),
    },
    {
      id: "system",
      Icon: Monitor,
      label: t({
        message: "System theme",
        comment: "Theme preference that follows operating system appearance",
      }),
    },
  ] as const;
  return (
    <ToggleButtonGroup
      aria-label={t({
        message: "Theme preference",
        comment: "Accessible name of the single choice theme control",
      })}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[preference]}
      onSelectionChange={(keys) => {
        const selected = options.find((option) => keys.has(option.id));
        if (selected) setPreference(selected.id);
      }}
    >
      {options.map(({ id, Icon, label }) => (
        <ToggleButton key={id} id={id} isIconOnly aria-label={label}>
          <Icon aria-hidden size={18} />
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
