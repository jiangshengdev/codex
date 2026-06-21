# 纯文本 Composer UI 实施计划

> **给 agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标:** 新增纯文本 composer 组件, 支持 TextArea、`Send`、`Stop`、Toast 错误和键盘提交行为。

**架构:** Composer 是 App shell 的操作组件, 读取 Redux runtime/identity selectors 和 `GuiHostCommands`, 只在组件本地保存 `draft` 和 `isSending`。组件不写 transcript state, 不 optimistic append。

**技术栈:** React 19, HeroUI `TextArea` / `Button` / `Toast`, Redux selectors, Vitest Browser。

---

## 文件结构

**创建:**

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - 负责 UI、local draft、send/stop handlers、Toast 调用。

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
  - 负责纯函数: `buildPlainTextInput`, `canSend`, `canStop`, `isConnectionUsable`, `errorDescription`。

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
  - 覆盖纯函数。

- `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - 覆盖浏览器交互。

**仅当测试需要时修改:**

- `/Users/jiangsheng/cnb/codex/codex-gui/src/utils/test-utils.tsx`

## 前置条件

先完成 `01-gui-host-command-api.md`, 并已有:

```ts
export type GuiHostCommands = {
  startTurn: (params: TurnStartParams) => Promise<TurnStartResponse>;
  interruptTurn: (params: TurnInterruptParams) => Promise<TurnInterruptResponse>;
};
```

## Task 1: 写模型纯函数测试

**文件:**

- 创建: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- 创建: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`

- [x] **Step 1: 创建空模型文件**

创建:

```ts
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { ThreadRuntimeRecord, ThreadRuntimeSubscription } from "@/features/threadRuntime/threadRuntimeSlice";
import type { UserInput } from "@codex-protocol/v2";

export type ComposerAvailabilityInput = {
  canAdvanceThreadIdentity: boolean;
  guiHostStatus: GuiHostStatus;
  runtime: ThreadRuntimeRecord | null;
  subscription: ThreadRuntimeSubscription | null;
};

export function buildPlainTextInput(text: string): UserInput {
  return { type: "text", text, text_elements: [] };
}

export function isConnectionUsable(input: ComposerAvailabilityInput): boolean {
  return false;
}

export function canSend(input: {
  connectionUsable: boolean;
  activeTurnId: string | null;
  draft: string;
  isSending: boolean;
}): boolean {
  return false;
}

export function canStop(input: {
  connectionUsable: boolean;
  activeTurnId: string | null;
}): boolean {
  return false;
}

export function errorDescription(error: unknown): string | undefined {
  return undefined;
}
```

- [x] **Step 2: 写失败测试**

Create test file:

```ts
import { describe, expect, it } from "vitest";
import type { GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { ThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  buildPlainTextInput,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "../composerTurnControlModel";

const attachedStatus: GuiHostStatus = {
  label: "attached",
  eventCount: 0,
  lastEventType: null,
};

const runtime = {
  threadId: "thread-1",
  sessionId: "session-1",
  thread: {
    id: "thread-1",
    sessionId: "session-1",
    forkedFromId: null,
    preview: "Composer test",
    ephemeral: false,
    modelProvider: "openai",
    createdAt: 1700000000,
    updatedAt: 1700000000,
    status: { type: "idle" },
    path: null,
    cwd: "/tmp",
    cliVersion: "test",
    source: "appServer",
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: "Composer test",
  },
  snapshotTurns: [],
  eventBuffer: [],
  activeTurnId: null,
  subscription: { state: "active" },
} satisfies ThreadRuntimeRecord;

describe("composerTurnControlModel", () => {
  it("builds plain text UserInput with text_elements", () => {
    expect(buildPlainTextInput("Hello")).toEqual({
      type: "text",
      text: "Hello",
      text_elements: [],
    });
  });

  it("requires attached identity, active subscription, runtime, and usable host status", () => {
    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: attachedStatus,
        runtime,
        subscription: { state: "active" },
      }),
    ).toBe(true);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: false,
        guiHostStatus: attachedStatus,
        runtime,
        subscription: { state: "active" },
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: attachedStatus,
        runtime,
        subscription: { state: "manualReconnectRequired", reason: "backpressure", subscriptionId: "sub-1" },
      }),
    ).toBe(false);

    expect(
      isConnectionUsable({
        canAdvanceThreadIdentity: true,
        guiHostStatus: { label: "error", eventCount: 0, lastEventType: null, message: "boom" },
        runtime,
        subscription: { state: "active" },
      }),
    ).toBe(false);
  });

  it("derives send and stop availability", () => {
    expect(
      canSend({
        connectionUsable: true,
        activeTurnId: null,
        draft: "Hello",
        isSending: false,
      }),
    ).toBe(true);
    expect(canSend({ connectionUsable: true, activeTurnId: null, draft: "   ", isSending: false })).toBe(false);
    expect(canSend({ connectionUsable: true, activeTurnId: "turn-1", draft: "Hello", isSending: false })).toBe(false);
    expect(canSend({ connectionUsable: true, activeTurnId: null, draft: "Hello", isSending: true })).toBe(false);

    expect(canStop({ connectionUsable: true, activeTurnId: "turn-1" })).toBe(true);
    expect(canStop({ connectionUsable: true, activeTurnId: null })).toBe(false);
    expect(canStop({ connectionUsable: false, activeTurnId: "turn-1" })).toBe(false);
  });

  it("extracts human-readable error descriptions", () => {
    expect(errorDescription(new Error("failed"))).toBe("failed");
    expect(errorDescription("failed string")).toBe("failed string");
    expect(errorDescription({ message: "structured" })).toBe("structured");
    expect(errorDescription({})).toBeUndefined();
  });
});
```

- [x] **Step 3: 运行测试确认失败**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
```

预期: FAIL, 因为 `isConnectionUsable`、`canSend`、`canStop`、`errorDescription` 返回 stub values。

## Task 2: 实现模型纯函数

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`

- [x] **Step 1: 实现函数**

替换实现:

```ts
export function isConnectionUsable(input: ComposerAvailabilityInput): boolean {
  return (
    input.canAdvanceThreadIdentity &&
    input.runtime != null &&
    input.subscription?.state === "active" &&
    input.guiHostStatus.label !== "error" &&
    input.guiHostStatus.label !== "closed"
  );
}

export function canSend(input: {
  connectionUsable: boolean;
  activeTurnId: string | null;
  draft: string;
  isSending: boolean;
}): boolean {
  return (
    input.connectionUsable &&
    input.activeTurnId == null &&
    input.draft.trim().length > 0 &&
    !input.isSending
  );
}

export function canStop(input: {
  connectionUsable: boolean;
  activeTurnId: string | null;
}): boolean {
  return input.connectionUsable && input.activeTurnId != null;
}

export function errorDescription(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return undefined;
}
```

- [x] **Step 2: 运行模型测试**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
```

预期: PASS。

## Task 3: 写 Composer browser tests

**文件:**

- 创建: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 创建: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

- [x] **Step 1: 创建最小组件 stub**

创建:

```tsx
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";

export type ComposerTurnControlProps = {
  commands: GuiHostCommands | null;
  guiHostStatus: GuiHostStatus;
};

export function ComposerTurnControl(_props: ComposerTurnControlProps) {
  return null;
}
```

- [x] **Step 2: 写 browser tests**

Create test file:

```tsx
import { expect, test, vi } from "vitest";
import { renderWithProviders } from "@/utils/test-utils";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { threadRuntimeAttached, threadRuntimeEventBuffered, threadRuntimeManualReconnectRequired } from "@/features/threadRuntime/threadRuntimeSlice";
import { attachedThreadIdObserved, launchThreadIdRecorded } from "@/features/threadIdentity/threadIdentitySlice";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import type { ThreadProjectionAttachResponse, ThreadProjectionEventNotification } from "@codex-protocol/v2";
import { Toast } from "@heroui/react";
import { ComposerTurnControl } from "../ComposerTurnControl";

const attachedStatus: GuiHostStatus = { label: "attached", eventCount: 0, lastEventType: null };
const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
const threadId = attachResponse.snapshot.thread.id;

function commands(): GuiHostCommands {
  return {
    startTurn: vi.fn().mockResolvedValue({
      turn: {
        id: "turn-started",
        items: [],
        itemsView: "full",
        status: "inProgress",
        error: null,
        startedAt: 1700000100,
        completedAt: null,
        durationMs: null,
      },
    }),
    interruptTurn: vi.fn().mockResolvedValue({}),
  };
}

async function renderAttached(commandHandle: GuiHostCommands | null = commands()) {
  const result = await renderWithProviders(
    <>
      <Toast.Provider placement="top center" />
      <ComposerTurnControl commands={commandHandle} guiHostStatus={attachedStatus} />
    </>,
  );
  result.store.dispatch(launchThreadIdRecorded(threadId));
  result.store.dispatch(attachedThreadIdObserved(threadId));
  result.store.dispatch(threadRuntimeAttached(attachResponse));
  return result;
}

test("disables controls before attach", async () => {
  const screen = await renderWithProviders(
    <>
      <Toast.Provider placement="top center" />
      <ComposerTurnControl commands={commands()} guiHostStatus={{ label: "connecting", eventCount: 0, lastEventType: null }} />
    </>,
  );

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
});

test("sends non-empty draft and clears it after success", async () => {
  const commandHandle = commands();
  const screen = await renderAttached(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Hello Codex");
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  await screen.getByRole("button", { name: "Send" }).click();

  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello Codex", text_elements: [] }],
  });
  await expect.element(screen.getByPlaceholder("Message Codex")).toHaveValue("");
});

test("keeps whitespace-only draft from submitting", async () => {
  const commandHandle = commands();
  const screen = await renderAttached(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("   ");
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await screen.getByPlaceholder("Message Codex").press("Enter");

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("uses Enter to send and Shift Enter to insert newline", async () => {
  const commandHandle = commands();
  const screen = await renderAttached(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Line 1");
  await screen.getByPlaceholder("Message Codex").press("Shift+Enter");
  await expect.element(screen.getByPlaceholder("Message Codex")).toHaveValue("Line 1\n");

  await screen.getByPlaceholder("Message Codex").fill("Line 1");
  await screen.getByPlaceholder("Message Codex").press("Enter");

  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);
});

test("active turn disables Send and enables Stop", async () => {
  const commandHandle = commands();
  const screen = await renderAttached(commandHandle);
  const event = eventTurnStartedJson as ThreadProjectionEventNotification;
  screen.store.dispatch(threadRuntimeEventBuffered(event));

  await screen.getByPlaceholder("Message Codex").fill("Next draft");
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  await screen.getByRole("button", { name: "Stop" }).click();

  if (event.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId,
    turnId: event.event.notification.turn.id,
  });
});

test("manual reconnect disables composer operations", async () => {
  const screen = await renderAttached(commands());
  screen.store.dispatch(
    threadRuntimeManualReconnectRequired({
      reason: "backpressure",
      threadId,
      subscriptionId: attachResponse.subscriptionId,
    }),
  );

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
});
```

- [x] **Step 3: 运行 browser tests 确认失败**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

预期: FAIL, 因为 component 只渲染 `null`。

## Task 4: 实现 Composer 组件

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

- [x] **Step 1: 实现 component**

把 stub 替换为:

```tsx
import { Button, TextArea, toast } from "@heroui/react";
import { useState, type KeyboardEvent } from "react";
import { useAppSelector } from "@/app/hooks";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { selectCanAdvanceThreadIdentity } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeActiveTurnId,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  buildPlainTextInput,
  canSend,
  canStop,
  errorDescription,
  isConnectionUsable,
} from "./composerTurnControlModel";

export type ComposerTurnControlProps = {
  commands: GuiHostCommands | null;
  guiHostStatus: GuiHostStatus;
};

export function ComposerTurnControl({ commands, guiHostStatus }: ComposerTurnControlProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const canAdvanceThreadIdentity = useAppSelector(selectCanAdvanceThreadIdentity);
  const runtime = useAppSelector(selectThreadRuntimeRecord);
  const activeTurnId = useAppSelector(selectThreadRuntimeActiveTurnId);
  const subscription = useAppSelector(selectThreadRuntimeSubscription);

  const connectionUsable =
    commands != null &&
    isConnectionUsable({
      canAdvanceThreadIdentity,
      guiHostStatus,
      runtime,
      subscription,
    });
  const sendEnabled = canSend({
    connectionUsable,
    activeTurnId,
    draft,
    isSending,
  });
  const stopEnabled = canStop({
    connectionUsable,
    activeTurnId,
  });

  const submit = async (): Promise<void> => {
    if (!sendEnabled || runtime == null || commands == null) {
      return;
    }

    setIsSending(true);
    try {
      await commands.startTurn({
        threadId: runtime.threadId,
        clientUserMessageId: null,
        input: [buildPlainTextInput(draft)],
      });
      setDraft("");
    } catch (error) {
      toast.danger("Message failed to send", {
        description: errorDescription(error),
      });
    } finally {
      setIsSending(false);
    }
  };

  const stop = async (): Promise<void> => {
    if (!stopEnabled || runtime == null || activeTurnId == null || commands == null) {
      return;
    }

    try {
      await commands.interruptTurn({
        threadId: runtime.threadId,
        turnId: activeTurnId,
      });
    } catch (error) {
      toast.danger("Stop failed", {
        description: errorDescription(error),
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void submit();
  };

  return (
    <section aria-label="Message composer" className="fixed inset-x-0 bottom-0 z-10 px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-2">
        <TextArea
          disabled={!connectionUsable}
          fullWidth
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Codex"
          value={draft}
          variant="secondary"
        />
        <div className="flex justify-end gap-2">
          <Button isDisabled={!stopEnabled} onPress={() => void stop()} variant="danger">
            Stop
          </Button>
          <Button isDisabled={!sendEnabled} onPress={() => void submit()} variant="outline">
            Send
          </Button>
        </div>
      </div>
    </section>
  );
}
```

`Toast.Provider` intentionally stays outside this component. Standalone component tests wrap the component with
`<Toast.Provider placement="top center" />`; App shell integration mounts the provider once at the page/root level.

- [x] **Step 2: 运行 component tests**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

预期: PASS。

## Task 5: 覆盖失败 Toast 和 pending 防重复提交

**文件:**

- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

- [x] **Step 1: 写发送失败保留草稿测试**

新增测试:

```tsx
test("preserves draft when sending fails", async () => {
  const commandHandle = commands();
  vi.mocked(commandHandle.startTurn).mockRejectedValueOnce(new Error("server rejected"));
  const screen = await renderAttached(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Keep me");
  await screen.getByRole("button", { name: "Send" }).click();

  await expect.element(screen.getByPlaceholder("Message Codex")).toHaveValue("Keep me");
  await expect.element(screen.getByText("Message failed to send")).toBeVisible();
});
```

- [x] **Step 2: 写 pending 禁止重复提交测试**

新增测试:

```tsx
test("disables duplicate send while turn/start is pending", async () => {
  let resolveStart: ((value: Awaited<ReturnType<GuiHostCommands["startTurn"]>>) => void) | undefined;
  const commandHandle = commands();
  vi.mocked(commandHandle.startTurn).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const screen = await renderAttached(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Only once");
  await screen.getByRole("button", { name: "Send" }).click();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await screen.getByPlaceholder("Message Codex").press("Enter");

  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);

  resolveStart?.({
    turn: {
      id: "turn-started",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: 1700000100,
      completedAt: null,
      durationMs: null,
    },
  });
});
```

- [x] **Step 3: 写 Stop 失败 Toast 测试**

新增测试:

```tsx
test("shows toast when stop fails", async () => {
  const commandHandle = commands();
  vi.mocked(commandHandle.interruptTurn).mockRejectedValueOnce(new Error("turn already completed"));
  const screen = await renderAttached(commandHandle);
  const event = eventTurnStartedJson as ThreadProjectionEventNotification;
  screen.store.dispatch(threadRuntimeEventBuffered(event));

  await screen.getByPlaceholder("Message Codex").fill("Draft survives");
  await screen.getByRole("button", { name: "Stop" }).click();

  await expect.element(screen.getByText("Stop failed")).toBeVisible();
  await expect.element(screen.getByPlaceholder("Message Codex")).toHaveValue("Draft survives");
});
```

- [x] **Step 4: 运行测试**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm vitest --run src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
pnpm run test:browser -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

预期: PASS。

## Task 6: 局部验证与提交

- [x] **Step 1: 运行 lint/type-check**

运行:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
pnpm run type-check
```

预期: 两个命令 exit 0。

- [x] **Step 2: 提交**

运行:

```bash
cd /Users/jiangsheng/cnb/codex
git add codex-gui/src/features/composerTurnControl
git commit -m "feat(gui): add plain text composer controls"
```
