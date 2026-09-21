export const guiPort = 5174;
export const storybookPort = 6007;

export const guiOrigin = `http://localhost:${String(guiPort)}`;
export const storybookOrigin = `http://localhost:${String(storybookPort)}`;
export const storybookHost = new URL(storybookOrigin).host;
