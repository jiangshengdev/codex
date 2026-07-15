# Codex GUI Browser Launch Params Owner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**状态：** 待确认

**设计依据：** [Codex GUI Browser Launch Params Owner 设计](../specs/2026-07-15-codex-gui-browser-launch-params-owner-design.md)

**Goal:** 在不改变启动 URL、token storage、fragment 清理、认证、App handoff、QR、scroll 或渲染行为的前提下，将 browser launch params 的类型与生命周期迁移到独立的 `features/browserLaunch` owner。

**Architecture:** 先用一个 tests-only 提交锁定现有 transport lifecycle，再在单一原子提交中移动 owner tests、创建 `browserLaunchParams.ts`、删除 `guiHostClient.ts` 中的旧 owner 并迁移全部直接类型消费者。任何已提交状态都只有一个 production owner；`guiHostClient` 不保留兼容转导出，也不改变 WebSocket transport、handshake、request correlation 或 protocol validation。

**Tech Stack:** TypeScript 6、React 19、Vitest Node、Vitest Browser Mode（Chromium）、Vite、oxfmt、oxlint、ESLint、fnm 管理的 Node/pnpm。

---

## 实施前提与范围边界

- 对应设计文档和本计划文档必须在代码实现前作为 docs-only 变更独立提交。后续两个代码提交只能 stage `codex-gui/**`，不得 stage `docs/superpowers/**`。
- 所有 pnpm 命令都在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，并使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不安装依赖、运行时或浏览器二进制，不执行任何 Git 远程命令。
- Task 1 只能修改 `guiHostHandshake.test.ts`，不得创建 `browserLaunch` 目录、移动旧 launch test、修改 production 或迁移类型。
- Task 2 必须在一个无中间 commit 的原子任务内完成 test move、新 owner 创建、旧 owner 删除、production 接线和所有类型迁移；不得提交同时存在新旧 production owner 的状态。
- B01 不修改 B02 的 WebSocket transport、handshake、request correlation、commands，也不修改 B03 的 runtime validation、JSON-RPC decoder 或 generated protocol。
- 不修改 `qrAccessUrl.ts`、QR UI 行为、Rust GUI host、launch URL wire contract、Redux、projection、thread runtime、Transcript State、scroll 或 rendering。
- 不运行全量 `test:unit`、三浏览器矩阵、Playwright e2e 或 production build；只运行聚焦 Node tests、一个 Chromium App regression、format、lint 和 type-check。

## 文件结构与提交边界

- Task 1 only modifies `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts` and commits `test(gui): lock browser launch lifecycle`.
- Task 2 creates `codex-gui/src/features/browserLaunch/browserLaunchParams.ts` as the only production owner.
- Task 2 moves `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts` to `codex-gui/src/features/browserLaunch/__tests__/browserLaunchParams.test.ts` and rewrites it as independent owner contract tests.
- Task 2 modifies `guiHostClient.ts`、App、AppShell、Bridge、Composer、QR、handshake test 和 GUI host test support, then commits all owner migration changes as `refactor(gui): extract browser launch params owner`.
- Task 3 performs non-fix verification only and creates no commit unless a B01-introduced defect must be corrected within the accepted file boundary.

### Task 1: 用 transport characterization tests 锁定现有 launch lifecycle

**Files:**

- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Keep unchanged: `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts`
- No production files

- [ ] **Step 1: 在 handshake test 中加入 storage failure test support import**

Use `apply_patch` to make the existing support import include `ThrowingSetItemStorage`:

```ts
import {
  MemoryStorage,
  RecordingWebSocket,
  ThrowingSetItemStorage,
  recordStatusSummaries,
  readRpcMethod,
  sendAttachResult,
  sendAuthenticateResult,
  sendInitializeResult,
  sendJsonRpcResult,
  startGuiHostConnectionWithSocket,
} from "./guiHostClientTestSupport";
```

- [ ] **Step 2: 增加三个完整 transport characterization tests**

Use `apply_patch` to insert these tests at the beginning of `describe("guiHostClient handshake", ...)`. The first case mirrors the existing transport assertion in `guiHostLaunchParams.test.ts`; the old file remains untouched in Task 1.

```ts
  it("clears the fragment and authenticates when launch token storage fails", () => {
    const socket = new RecordingWebSocket();
    const replaceState = vi.fn<History["replaceState"]>();

    startGuiHostConnection({
      location: new URL(
        "http://127.0.0.1:4567/?threadId=thread-abc#token=secret",
      ),
      replaceState,
      tokenStorage: new ThrowingSetItemStorage(),
      createWebSocket: () => socket as unknown as WebSocket,
    });

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/?threadId=thread-abc",
    );

    socket.onopen?.();

    expect(socket.sent.map(readRpcMethod)).toEqual(["gui/authenticate"]);
  });

  it("calls onLaunchParams synchronously before creating the WebSocket", () => {
    const socket = new RecordingWebSocket();
    const calls: string[] = [];

    startGuiHostConnection({
      location: new URL(
        "http://127.0.0.1:4567/?threadId=thread-abc#token=secret",
      ),
      replaceState: vi.fn<History["replaceState"]>(),
      tokenStorage: new MemoryStorage(),
      onLaunchParams: (params) => {
        calls.push(`launch:${params.threadId}:${params.token}`);
      },
      createWebSocket: () => {
        calls.push("create-websocket");
        return socket as unknown as WebSocket;
      },
    });

    expect(calls).toEqual([
      "launch:thread-abc:secret",
      "create-websocket",
    ]);
  });

  it("does not create a WebSocket when launch params consumption fails", () => {
    const createWebSocket = vi.fn<(url: string) => WebSocket>();

    expect(() =>
      startGuiHostConnection({
        location: new URL("http://127.0.0.1:4567/#token=secret"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: new MemoryStorage(),
        createWebSocket,
      }),
    ).toThrowError(new Error("Missing threadId query parameter"));
    expect(createWebSocket).not.toHaveBeenCalled();
  });
```

These tests must use the existing `guiHostClient` implementation and existing shared test support. Do not add browser launch imports or production code in Task 1.

- [ ] **Step 3: 在旧 implementation 上运行 handshake characterization tests**

Run from `/Users/jiangsheng/cnb/codex/codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: PASS. All three cases characterize current behavior; none is an expected-failure test.

- [ ] **Step 4: 格式化并以非 fix 模式复核唯一改动文件**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/__tests__/guiHostHandshake.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: oxfmt only touches the handshake test; check passes.

- [ ] **Step 5: 再次运行 handshake test**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: PASS after formatting.

- [ ] **Step 6: 创建 tests-only 本地提交**

Run from `/Users/jiangsheng/cnb/codex`:

```bash
git add codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "test(gui): lock browser launch lifecycle"
```

Expected: staged diff contains exactly `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`; no production or docs path is staged. Commit succeeds with message `test(gui): lock browser launch lifecycle`.

### Task 2: 原子迁移 browser launch params owner

- Create: `codex-gui/src/features/browserLaunch/browserLaunchParams.ts`
- Move: `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts` → `codex-gui/src/features/browserLaunch/__tests__/browserLaunchParams.test.ts`
- Modify: `codex-gui/src/features/guiHost/guiHostClient.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- Modify: `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Modify: `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`

- [ ] **Step 1: 创建目标目录并用 Git 移动旧 launch test**

Run from `/Users/jiangsheng/cnb/codex`:

```bash
mkdir -p codex-gui/src/features/browserLaunch/__tests__
git mv codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts codex-gui/src/features/browserLaunch/__tests__/browserLaunchParams.test.ts
```

Expected: the original test path disappears and the new path retains rename history. Do not commit at this point.

- [ ] **Step 2: 将移动后的文件重写为完整 owner contract tests**

Use `apply_patch` to replace the moved test with this complete content. All storage doubles are local to the owner test and do not import GUI host test support.

```ts
import { describe, expect, it, vi } from "vitest";
import { consumeBrowserLaunchParams } from "../browserLaunchParams";

const launchTokenStorageKey = "codex-gui.launchToken";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class ThrowingSetItemStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("sessionStorage unavailable");
  }
}

class ThrowingGetItemStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error("sessionStorage read failed");
  }
}

function installSessionStorageGetter(getter: () => Storage): () => void {
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: getter,
  });

  return () => {
    if (previousDescriptor) {
      Object.defineProperty(globalThis, "sessionStorage", previousDescriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, "sessionStorage");
  };
}

describe("consumeBrowserLaunchParams", () => {
  it("stores a fragment token and restores it after refresh", () => {
    const storage = new MemoryStorage();
    const firstReplaceState = vi.fn<History["replaceState"]>();

    expect(
      consumeBrowserLaunchParams({
        location: new URL(
          "http://127.0.0.1:4567/app?threadId=thread-abc#token=secret",
        ),
        replaceState: firstReplaceState,
        tokenStorage: storage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
    expect(firstReplaceState).toHaveBeenCalledWith(
      null,
      "",
      "/app?threadId=thread-abc",
    );

    expect(
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/app?threadId=thread-abc"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: storage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
  });

  it("prefers a non-empty fragment token over an existing stored token", () => {
    const storage = new MemoryStorage();
    storage.setItem(launchTokenStorageKey, "stale");

    expect(
      consumeBrowserLaunchParams({
        location: new URL(
          "http://127.0.0.1:4567/?threadId=thread-abc#token=fresh",
        ),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: storage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "fresh" });
    expect(storage.getItem(launchTokenStorageKey)).toBe("fresh");
  });

  it("treats an empty token fragment as absent without overwriting storage", () => {
    const tokenStorage = {
      getItem: vi.fn(() => "stored"),
      setItem: vi.fn(),
    };

    expect(
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/?threadId=thread-abc#token="),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage,
      }),
    ).toEqual({ threadId: "thread-abc", token: "stored" });
    expect(tokenStorage.getItem).toHaveBeenCalledWith(launchTokenStorageKey);
    expect(tokenStorage.setItem).not.toHaveBeenCalled();
  });

  it("throws the existing threadId error for missing and empty values", () => {
    for (const url of [
      "http://127.0.0.1:4567/#token=secret",
      "http://127.0.0.1:4567/?threadId=#token=secret",
    ]) {
      expect(() =>
        consumeBrowserLaunchParams({
          location: new URL(url),
          replaceState: vi.fn<History["replaceState"]>(),
          tokenStorage: new MemoryStorage(),
        }),
      ).toThrowError(new Error("Missing threadId query parameter"));
    }
  });

  it("throws the existing token error when fragment and storage are empty", () => {
    for (const url of [
      "http://127.0.0.1:4567/?threadId=thread-abc",
      "http://127.0.0.1:4567/?threadId=thread-abc#token=",
    ]) {
      expect(() =>
        consumeBrowserLaunchParams({
          location: new URL(url),
          replaceState: vi.fn<History["replaceState"]>(),
          tokenStorage: new MemoryStorage(),
        }),
      ).toThrowError(new Error("Missing launch token fragment"));
    }
  });

  it("clears the whole fragment while preserving pathname and query", () => {
    const replaceState = vi.fn<History["replaceState"]>();

    consumeBrowserLaunchParams({
      location: new URL(
        "http://127.0.0.1:4567/nested/path?threadId=thread-abc&mode=compact#token=secret&extra=value",
      ),
      replaceState,
      tokenStorage: new MemoryStorage(),
    });

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/nested/path?threadId=thread-abc&mode=compact",
    );
  });

  it("clears, resolves default storage, then reads the supplied URL snapshot", () => {
    const order: string[] = [];
    const location = new URL(
      "http://127.0.0.1:4567/?threadId=thread-abc#token=secret",
    );
    const originalGet = location.searchParams.get.bind(location.searchParams);
    vi.spyOn(location.searchParams, "get").mockImplementation((name) => {
      order.push("read-url");
      return originalGet(name);
    });
    const restoreSessionStorage = installSessionStorageGetter(() => {
      order.push("resolve-storage");
      return new MemoryStorage() as unknown as Storage;
    });

    try {
      consumeBrowserLaunchParams({
        location,
        replaceState: () => {
          order.push("clear-fragment");
        },
      });
    } finally {
      restoreSessionStorage();
    }

    expect(order.slice(0, 3)).toEqual([
      "clear-fragment",
      "resolve-storage",
      "read-url",
    ]);
  });

  it("does not read URL params or injected storage when replaceState throws", () => {
    const location = new URL(
      "http://127.0.0.1:4567/?threadId=thread-abc#token=secret",
    );
    const searchParamsGet = vi.spyOn(location.searchParams, "get");
    const tokenStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };

    expect(() =>
      consumeBrowserLaunchParams({
        location,
        replaceState: () => {
          throw new Error("replaceState failed");
        },
        tokenStorage,
      }),
    ).toThrowError(new Error("replaceState failed"));

    expect(searchParamsGet).not.toHaveBeenCalled();
    expect(tokenStorage.getItem).not.toHaveBeenCalled();
    expect(tokenStorage.setItem).not.toHaveBeenCalled();
  });

  it("does not roll back fragment clearing when later validation fails", () => {
    const replaceState = vi.fn<History["replaceState"]>();

    expect(() =>
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/app#token=secret"),
        replaceState,
        tokenStorage: new MemoryStorage(),
      }),
    ).toThrowError(new Error("Missing threadId query parameter"));
    expect(replaceState).toHaveBeenCalledWith(null, "", "/app");
  });

  it("uses a fragment token when storage writes fail", () => {
    expect(
      consumeBrowserLaunchParams({
        location: new URL(
          "http://127.0.0.1:4567/?threadId=thread-abc#token=secret",
        ),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: new ThrowingSetItemStorage(),
      }),
    ).toEqual({ threadId: "thread-abc", token: "secret" });
  });

  it("continues to propagate storage read failures", () => {
    expect(() =>
      consumeBrowserLaunchParams({
        location: new URL("http://127.0.0.1:4567/?threadId=thread-abc"),
        replaceState: vi.fn<History["replaceState"]>(),
        tokenStorage: new ThrowingGetItemStorage(),
      }),
    ).toThrowError(new Error("sessionStorage read failed"));
  });

  it("falls back to no storage when default sessionStorage access throws", () => {
    const restoreSessionStorage = installSessionStorageGetter(() => {
      throw new Error("sessionStorage unavailable");
    });

    try {
      expect(
        consumeBrowserLaunchParams({
          location: new URL(
            "http://127.0.0.1:4567/?threadId=thread-abc#token=secret",
          ),
          replaceState: vi.fn<History["replaceState"]>(),
        }),
      ).toEqual({ threadId: "thread-abc", token: "secret" });
    } finally {
      restoreSessionStorage();
    }
  });
});
```

- [ ] **Step 3: 运行新 owner test 并确认因 module 尚不存在而失败**

Run from `/Users/jiangsheng/cnb/codex/codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/browserLaunch/__tests__/browserLaunchParams.test.ts
```

Expected: FAIL with a module resolution error for `../browserLaunchParams`. The failure must not be a syntax or test-type error. Do not commit this red state.

- [ ] **Step 4: 创建完整 browser launch owner**

Use `apply_patch` to create `codex-gui/src/features/browserLaunch/browserLaunchParams.ts`:

```ts
export type BrowserLaunchParams = {
  threadId: string;
  token: string;
};

const launchTokenStorageKey = "codex-gui.launchToken";

export function consumeBrowserLaunchParams({
  location,
  replaceState,
  tokenStorage,
}: {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
}): BrowserLaunchParams {
  replaceState(null, "", `${location.pathname}${location.search}`);
  const resolvedTokenStorage = tokenStorage ?? readSessionStorage();
  const threadId = location.searchParams.get("threadId");
  const fragmentToken = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");

  if (!threadId) {
    throw new Error("Missing threadId query parameter");
  }

  if (fragmentToken) {
    try {
      resolvedTokenStorage?.setItem(launchTokenStorageKey, fragmentToken);
    } catch {
      // The fragment token is still valid for this connection if storage is unavailable.
    }
    return { threadId, token: fragmentToken };
  }

  const storedToken = resolvedTokenStorage?.getItem(launchTokenStorageKey);
  if (!storedToken) {
    throw new Error("Missing launch token fragment");
  }

  return { threadId, token: storedToken };
}

function readSessionStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
```

The public API is exactly `BrowserLaunchParams` plus `consumeBrowserLaunchParams`. Do not export the storage key, options type, storage type, parser helper, clear helper, class, barrel or compatibility alias.

- [ ] **Step 5: 在同一未提交 Task 内立即删除 guiHostClient 的旧 owner 并接入新 owner**

Use `apply_patch` in `codex-gui/src/features/guiHost/guiHostClient.ts`.

Add the direct import:

```ts
import {
  consumeBrowserLaunchParams,
  type BrowserLaunchParams,
} from "@/features/browserLaunch/browserLaunchParams";
```

Delete the complete old `LaunchParams` type, `launchTokenStorageKey`, `readLaunchParams`, `clearLaunchTokenFragment`, and the private `readSessionStorage` function. Change the callback type to:

```ts
onLaunchParams?: (params: BrowserLaunchParams) => void;
```

Replace the launch prelude in `startGuiHostConnection` with:

```ts
  const launchParams = consumeBrowserLaunchParams({
    location,
    replaceState,
    tokenStorage,
  });
  const { threadId, token } = launchParams;
  onLaunchParams?.(launchParams);

  const socket = createWebSocket(`${webSocketProtocol(location)}://${location.host}/ws`);
```

Do not alter `webSocketProtocol`, authentication body, initialize body, attach body, message handling, commands, request IDs or connection status behavior.

- [ ] **Step 6: 迁移所有 production direct type imports**

Use `apply_patch` and keep every value import or JSX body unchanged.

`codex-gui/src/App.tsx` imports and state type:

```ts
import { useState } from "react";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import type { BrowserLaunchParams } from "./features/browserLaunch/browserLaunchParams";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";
```

```ts
const [launchParams, setLaunchParams] = useState<BrowserLaunchParams | null>(null);
```

`codex-gui/src/features/appShell/AppShell.tsx` imports and props:

```ts
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
```

```ts
export type AppShellProps = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
  launchParams: BrowserLaunchParams | null;
};
```

`codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx` imports and props:

```ts
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
```

```ts
export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setLaunchParams: (params: BrowserLaunchParams | null) => void;
};
```

`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` import and prop:

```ts
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
```

```ts
launchParams: BrowserLaunchParams | null;
```

`codex-gui/src/features/qrAccess/QrAccessPopover.tsx` import and prop:

```ts
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
```

```ts
export type QrAccessPopoverProps = {
  launchParams: BrowserLaunchParams | null;
  origin?: string;
};
```

Do not change HeroUI components, variants, semantic tokens, visible copy, QR URL construction or rendering.

- [ ] **Step 7: 迁移 handshake test type owner 并内联 storage-write failure double**

Use `apply_patch` in `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`.

Replace the old combined import with:

```ts
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import { startGuiHostConnection } from "../guiHostClient";
```

Change the typed collection in the existing full-handshake case:

```ts
const launchParams: BrowserLaunchParams[] = [];
```

Remove `ThrowingSetItemStorage` from the support import and replace the storage argument in the characterization test with:

```ts
      tokenStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("sessionStorage unavailable");
        },
      },
```

- [ ] **Step 8: 删除 GUI host test support 中已无消费者的 throwing storage class**

Use `apply_patch` to delete exactly this class from `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`:

```ts
export class ThrowingSetItemStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("sessionStorage unavailable");
  }
}
```

Keep `MemoryStorage`, `RecordingWebSocket`, request helpers and status helpers unchanged.

- [ ] **Step 9: 格式化完整 Task 2 diff**

Run from `/Users/jiangsheng/cnb/codex/codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/App.tsx src/features/browserLaunch/browserLaunchParams.ts src/features/browserLaunch/__tests__/browserLaunchParams.test.ts src/features/appShell/AppShell.tsx src/features/appShell/GuiHostConnectionBridge.tsx src/features/composerTurnControl/ComposerTurnControl.tsx src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/qrAccess/QrAccessPopover.tsx
```

Expected: oxfmt only touches listed B01 files. All formatter changes must be included in the Task 2 atomic commit.

- [ ] **Step 10: 运行聚焦 Node tests**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/browserLaunch/__tests__/browserLaunchParams.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: PASS. Owner tests validate URL/storage/error behavior; handshake tests validate the transport integration boundary.

- [ ] **Step 11: 运行 type-check**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS with all direct type consumers using `BrowserLaunchParams` from the new owner.

- [ ] **Step 12: 搜索旧 owner 符号与新 owner 边界**

Run:

```bash
rg -n '\bLaunchParams\b|readLaunchParams|clearLaunchTokenFragment|ThrowingSetItemStorage' src
rg -n 'launchTokenStorageKey|readSessionStorage' src/features/guiHost/guiHostClient.ts
rg -n 'BrowserLaunchParams|consumeBrowserLaunchParams' src
```

Expected:

- First command has no output and exits 1.
- Second command has no output and exits 1, proving storage ownership left `guiHostClient.ts`.
- Third command shows the new owner, direct production/test type imports, and the `guiHostClient` consumption import; it must not show a re-export from `guiHostClient.ts`.

- [ ] **Step 13: 运行非 fix format check**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/App.tsx src/features/browserLaunch/browserLaunchParams.ts src/features/browserLaunch/__tests__/browserLaunchParams.test.ts src/features/appShell/AppShell.tsx src/features/appShell/GuiHostConnectionBridge.tsx src/features/composerTurnControl/ComposerTurnControl.tsx src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/qrAccess/QrAccessPopover.tsx
```

Expected: PASS with no formatting drift.

- [ ] **Step 14: 创建单一原子 owner migration 提交**

Run from `/Users/jiangsheng/cnb/codex`:

```bash
git add codex-gui/src/App.tsx codex-gui/src/features/browserLaunch/browserLaunchParams.ts codex-gui/src/features/browserLaunch/__tests__/browserLaunchParams.test.ts codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts codex-gui/src/features/appShell/AppShell.tsx codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx codex-gui/src/features/guiHost/guiHostClient.ts codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts codex-gui/src/features/qrAccess/QrAccessPopover.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "refactor(gui): extract browser launch params owner"
```

Expected: staged paths are only the listed `codex-gui/**` files, including the old test deletion/new test addition as a rename when detected. No docs path is staged. The commit contains both new owner creation and old owner removal, so no committed state contains dual production owners.

### Task 3: 非 fix 最终验收

**Files:**

- Verify only: files changed by Tasks 1–2
- No expected edits or new commit

- [ ] **Step 1: 重新运行聚焦 Node tests**

Run from `/Users/jiangsheng/cnb/codex/codex-gui`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/browserLaunch/__tests__/browserLaunchParams.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts
```

Expected: PASS. Do not replace this with the full unit suite.

- [ ] **Step 2: 运行 Chromium App browser regression**

Run the exact command:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/__tests__/App.browser.test.tsx
```

Expected: PASS. Do not run Firefox, WebKit or the full browser suite.

- [ ] **Step 3: 运行限定文件的非 fix oxfmt check**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/App.tsx src/features/browserLaunch/browserLaunchParams.ts src/features/browserLaunch/__tests__/browserLaunchParams.test.ts src/features/appShell/AppShell.tsx src/features/appShell/GuiHostConnectionBridge.tsx src/features/composerTurnControl/ComposerTurnControl.tsx src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostClientTestSupport.ts src/features/qrAccess/QrAccessPopover.tsx
```

Expected: PASS. Task 3 does not run `--write`.

- [ ] **Step 4: 运行 lint 与 type-check**

Run:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: both commands PASS. A B01-introduced failure may only be corrected inside accepted B01 files; touching B02/B03, QR behavior, Rust, Redux or another plan-external file requires returning to plan confirmation.

- [ ] **Step 5: 复核 owner、transport 和 QR exclusion boundaries**

Run:

```bash
rg -n '\bLaunchParams\b|readLaunchParams|clearLaunchTokenFragment|ThrowingSetItemStorage' src
rg -n 'launchTokenStorageKey|readSessionStorage' src/features/guiHost/guiHostClient.ts
rg -n 'BrowserLaunchParams|consumeBrowserLaunchParams' src
rg -n 'gui/authenticate|thread/projection/attach|/ws' src/features/guiHost/guiHostClient.ts
rg -n 'buildQrAccessUrl' src/features/qrAccess
```

Expected:

- Old launch owner symbols are absent.
- Storage key/default storage helper are owned only by `browserLaunchParams.ts`.
- All launch type consumers import directly from `features/browserLaunch/browserLaunchParams`.
- Authentication, attach and `/ws` remain in `guiHostClient.ts`, proving B02 was not implemented.
- `buildQrAccessUrl` remains in `features/qrAccess/qrAccessUrl.ts`, proving QR URL/UI behavior was not migrated.

- [ ] **Step 6: 检查提交顺序与最终工作区**

Run from `/Users/jiangsheng/cnb/codex`:

```bash
git log -2 --oneline
git diff --check HEAD~2..HEAD
git status --short
```

Expected:

- `git log` from newest to oldest shows `refactor(gui): extract browser launch params owner`, then `test(gui): lock browser launch lifecycle`.
- The two-commit whitespace check passes.
- The workspace is clean because design and plan docs were independently committed before implementation.

## 完成标准

- The first code commit is tests-only and locks storage-write failure authentication, callback-before-socket ordering, and launch-failure-no-socket behavior on the old implementation.
- The second code commit atomically creates the new owner and deletes the old production owner; no committed state contains both.
- `BrowserLaunchParams` and `consumeBrowserLaunchParams` are directly exported only by `features/browserLaunch/browserLaunchParams.ts`.
- `consumeBrowserLaunchParams` preserves clear fragment → resolve storage → read URL snapshot → validate/store-or-restore → return ordering.
- `guiHostClient` calls `onLaunchParams` synchronously before WebSocket creation and continues to use token for authentication and threadId for attach.
- Fragment token overrides stale storage; `setItem()` failure does not block the current connection; `getItem()` failure still propagates.
- Missing/empty threadId and token error texts remain unchanged; successful fragment clearing is not rolled back after later validation failure.
- App、AppShell、Bridge、Composer、QR and tests import the type directly from the new owner; no compatibility export or barrel exists.
- Focused Node tests、Chromium App regression、oxfmt check、lint、type-check、source searches and Git checks pass.
- B02/B03、QR URL/UI behavior、Rust、Redux、projection、thread runtime、Transcript State、scroll、rendering、full suites and Git remotes remain out of scope.
