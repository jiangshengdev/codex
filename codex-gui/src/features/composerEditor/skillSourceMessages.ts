import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export function localizeSkillSourceLabel(i18n: I18n, sourceLabel: string): string {
  switch (sourceLabel) {
    case "User":
      return i18n._(
        msg({
          comment: "Source label for a skill installed by the current user",
          message: "User",
        }),
      );
    case "Repository":
      return i18n._(
        msg({
          comment: "Source label for a skill provided by the current repository",
          message: "Repository",
        }),
      );
    case "System":
      return i18n._(
        msg({
          comment: "Source label for a skill provided by the Codex system",
          message: "System",
        }),
      );
    case "Admin":
      return i18n._(
        msg({
          comment: "Source label for a skill installed by an administrator",
          message: "Admin",
        }),
      );
    default:
      return sourceLabel;
  }
}
