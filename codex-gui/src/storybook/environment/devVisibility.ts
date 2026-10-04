export const DEV_VISIBILITY_ADDON = "codex/dev-visibility";
export const DEV_VISIBILITY_REQUEST = `${DEV_VISIBILITY_ADDON}/request`;
export const DEV_VISIBILITY_CHANGED = `${DEV_VISIBILITY_ADDON}/changed`;

export type DevVisibility = Readonly<{ visible: boolean }>;
export const defaultDevVisibility: DevVisibility = { visible: true };
