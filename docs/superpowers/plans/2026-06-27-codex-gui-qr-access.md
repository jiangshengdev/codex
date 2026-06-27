# Codex GUI QR Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a composer-adjacent QR button that opens a HeroUI popover with a `qrcode.react` SVG QR code for the current Codex GUI launch URL.

**Architecture:** Keep GUI launch-token parsing in `guiHostClient`, lift the already parsed `LaunchParams` through `GuiHostConnectionBridge` into `App`, then pass it down to `ComposerTurnControl`. Add a focused `QrAccessPopover` component beside the existing composer action buttons; it builds the QR URL from current `window.location.origin`, `threadId`, and `token`, and renders it with HeroUI `Button` / `Tooltip` / `Popover` plus `QRCodeSVG`.

**Tech Stack:** React 19, TypeScript, HeroUI React v3 `Button` / `Tooltip` / `Popover`, `lucide-react`, `qrcode.react`, Vitest Browser Mode, existing `codex-gui` Redux/test utilities.

---

## File Structure

- Modify: `codex-gui/package.json`
  - Add runtime dependency `qrcode.react`.
- Modify: `codex-gui/pnpm-lock.yaml`
  - Update through `pnpm add qrcode.react`; do not edit by hand.
- Create: `codex-gui/src/features/qrAccess/qrAccessUrl.ts`
  - Pure URL builder for the QR payload.
- Create: `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`
  - HeroUI + `qrcode.react` QR popover component.
- Create: `codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts`
  - Unit coverage for QR URL construction.
- Modify: `codex-gui/src/App.tsx`
  - Store `LaunchParams | null` and pass it through to `AppShell`.
- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
  - Accept `setLaunchParams` and call it from the existing `onLaunchParams` hook.
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
  - Accept `launchParams` and pass it to `ComposerTurnControl`.
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
  - Add left/right action-row layout and render `QrAccessPopover` left of `Stop`.
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`
  - Add browser coverage for QR access behavior and preserve existing composer tests.
- Do not modify: `codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - The existing default `token: "secret"` is sufficient for QR tests.

## Preconditions

- The design is saved at `docs/superpowers/specs/2026-06-27-codex-gui-qr-access-design.md`.
- Do not start implementation until the user explicitly approves implementation.
- Do not run dependency-installing commands until the user explicitly allows adding `qrcode.react`.
- Before any `pnpm` command in `codex-gui`, initialize the user's fnm environment and confirm `pnpm` is not from `/Users/jiangsheng/.cache/codex-runtimes/`.

Use this safe preflight pattern before `pnpm` commands:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm env --shell zsh
```

Apply the printed `export ...` lines to the current shell, then run:

```sh
command -v pnpm
pnpm --version
command -v node
node --version
```

Expected: `command -v pnpm` points under `/Users/jiangsheng/.local/state/fnm_multishells/`, not `/Users/jiangsheng/.cache/codex-runtimes/`.

## Task 1: Add The QR Dependency

**Files:**
- Modify: `codex-gui/package.json`
- Modify: `codex-gui/pnpm-lock.yaml`

- [ ] **Step 1: Confirm dependency is absent**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
rg -n 'qrcode\.react|QRCodeSVG|QRCodeCanvas' codex-gui/package.json codex-gui/pnpm-lock.yaml codex-gui/src
```

Expected: no matches.

- [ ] **Step 2: Add `qrcode.react` with pnpm**

Only run after explicit dependency approval from the user.

Run from the `codex-gui` directory after fnm preflight:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm add qrcode.react
```

Expected: `codex-gui/package.json` gains `qrcode.react` under `dependencies`, and `codex-gui/pnpm-lock.yaml` is updated by pnpm.

- [ ] **Step 3: Inspect dependency diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/package.json codex-gui/pnpm-lock.yaml
```

Expected: only `qrcode.react` and its required lockfile entries are added; no unrelated dependency churn appears.

## Task 2: Add A Pure QR URL Builder

**Files:**
- Create: `codex-gui/src/features/qrAccess/qrAccessUrl.ts`
- Create: `codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts`

- [ ] **Step 1: Write the failing URL-builder test**

Create `codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildQrAccessUrl } from "../qrAccessUrl";

describe("buildQrAccessUrl", () => {
  it("rebuilds a launch URL with threadId and token fragment", () => {
    expect(
      buildQrAccessUrl({
        origin: "http://192.168.3.203:57223",
        threadId: "thread-abc",
        token: "secret-token",
      }),
    ).toBe("http://192.168.3.203:57223/?threadId=thread-abc#token=secret-token");
  });

  it("encodes threadId and token without changing the origin", () => {
    expect(
      buildQrAccessUrl({
        origin: "http://127.0.0.1:57223",
        threadId: "thread with space",
        token: "token with # and &",
      }),
    ).toBe("http://127.0.0.1:57223/?threadId=thread+with+space#token=token+with+%23+and+%26");
  });
});
```

- [ ] **Step 2: Run the focused unit test to verify RED**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/qrAccess/__tests__/qrAccessUrl.test.ts
```

Expected: FAIL because `../qrAccessUrl` does not exist yet.

- [ ] **Step 3: Implement the URL builder**

Create `codex-gui/src/features/qrAccess/qrAccessUrl.ts`:

```ts
export type QrAccessUrlInput = {
  origin: string;
  threadId: string;
  token: string;
};

export function buildQrAccessUrl({ origin, threadId, token }: QrAccessUrlInput): string {
  const url = new URL("/", origin);
  url.searchParams.set("threadId", threadId);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
```

- [ ] **Step 4: Run the focused unit test to verify GREEN**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/qrAccess/__tests__/qrAccessUrl.test.ts
```

Expected: PASS.

## Task 3: Lift Launch Params Into The App Shell

**Files:**
- Modify: `codex-gui/src/App.tsx`
- Modify: `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- Modify: `codex-gui/src/features/appShell/AppShell.tsx`
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

- [ ] **Step 1: Add launch-param props with no visible QR UI yet**

Update `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx` imports:

```ts
import type { GuiHostCommands, GuiHostStatus, LaunchParams } from "@/features/guiHost/guiHostClient";
```

Update `GuiHostConnectionBridgeProps`:

```ts
export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setLaunchParams: (params: LaunchParams | null) => void;
};
```

Update the component signature:

```tsx
export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  setLaunchParams,
}: GuiHostConnectionBridgeProps) {
```

Inside the existing `onLaunchParams` callback, add `setLaunchParams(params)` before dispatching:

```ts
onLaunchParams: (params) => {
  launchThreadId = params.threadId;
  projectionIngress = new ProjectionIngressAdapter(params.threadId);
  setLaunchParams(params);
  dispatch(launchThreadIdRecorded(params.threadId));
},
```

In the cleanup function, clear the launch params:

```ts
return () => {
  isMounted = false;
  setCommands(null);
  setLaunchParams(null);
  cleanupConnection?.();
};
```

- [ ] **Step 2: Store launch params in `App`**

Update `codex-gui/src/App.tsx` imports:

```ts
import type { GuiHostCommands, GuiHostStatus, LaunchParams } from "./features/guiHost/guiHostClient";
```

Add state:

```tsx
const [launchParams, setLaunchParams] = useState<LaunchParams | null>(null);
```

Update the JSX:

```tsx
<GuiHostConnectionBridge
  setStatus={setStatus}
  setCommands={setCommands}
  setLaunchParams={setLaunchParams}
/>
<AppShell status={status} commands={commands} launchParams={launchParams} />
```

- [ ] **Step 3: Pass launch params through AppShell**

Update `codex-gui/src/features/appShell/AppShell.tsx` imports:

```ts
import type { GuiHostCommands, GuiHostStatus, LaunchParams } from "@/features/guiHost/guiHostClient";
```

Update props:

```ts
export type AppShellProps = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
  launchParams: LaunchParams | null;
};
```

Update the function signature and composer call:

```tsx
export function AppShell({ status, commands, launchParams }: AppShellProps) {
```

```tsx
<ComposerTurnControl commands={commands} guiHostStatus={status} launchParams={launchParams} />
```

- [ ] **Step 4: Accept launch params in ComposerTurnControl without using them yet**

Update `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` imports:

```ts
import type { GuiHostCommands, GuiHostStatus, LaunchParams } from "@/features/guiHost/guiHostClient";
```

Update props:

```ts
export type ComposerTurnControlProps = {
  commands: GuiHostCommands | null;
  guiHostStatus: GuiHostStatus;
  launchParams: LaunchParams | null;
};
```

Update signature:

```tsx
export function ComposerTurnControl({
  commands,
  guiHostStatus,
  launchParams: _launchParams,
}: ComposerTurnControlProps) {
```

Expected: this compiles once formatting/linting handles the intentionally unused prop name.

- [ ] **Step 5: Run type-check for the data-flow change**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

## Task 4: Add Failing Browser Coverage For QR Access

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Add a test for the QR button and popover**

Add this test after `App enables Stop for the current active turn`:

```tsx
test("App shows a QR access popover before the Stop button", async () => {
  const screen = await renderWithProviders(<App />);

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options);
  markHostAttached(options);
  markCommandsReady(options);

  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  const buttons = Array.from(screen.container.querySelectorAll("button"));
  const qrButtonElement = buttons.find(
    (button) => button.getAttribute("aria-label") === "Scan with phone",
  );
  const stopButtonElement = buttons.find((button) => button.textContent?.trim() === "Stop");

  await expect.element(qrButton).toBeEnabled();
  expect(qrButtonElement).toBeDefined();
  expect(stopButtonElement).toBeDefined();
  expect(
    qrButtonElement!.compareDocumentPosition(stopButtonElement!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);

  await qrButton.click();

  const expectedUrl = `${window.location.origin}/?threadId=${launchThreadId}#token=secret`;
  await expect.element(screen.getByRole("dialog", { name: "Scan with phone" })).toBeVisible();
  await expect.element(screen.getByLabelText("QR code for current GUI URL")).toBeVisible();
  await expect.element(screen.getByText(expectedUrl)).toBeVisible();
});
```

- [ ] **Step 2: Run the focused browser test to verify RED**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx -t "App shows a QR access popover before the Stop button"
```

Expected: FAIL because there is no `Scan with phone` button yet.

## Task 5: Implement The HeroUI QR Popover

**Files:**
- Create: `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`
- Modify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`

- [ ] **Step 1: Create `QrAccessPopover`**

Create `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`:

```tsx
import { Button, Popover, Tooltip } from "@heroui/react";
import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";
import type { LaunchParams } from "@/features/guiHost/guiHostClient";
import { buildQrAccessUrl } from "./qrAccessUrl";

export type QrAccessPopoverProps = {
  launchParams: LaunchParams | null;
  origin?: string;
};

export function QrAccessPopover({ launchParams, origin = window.location.origin }: QrAccessPopoverProps) {
  const qrUrl = useMemo(() => {
    if (launchParams == null) {
      return null;
    }

    return buildQrAccessUrl({
      origin,
      threadId: launchParams.threadId,
      token: launchParams.token,
    });
  }, [launchParams, origin]);

  const isDisabled = qrUrl == null;

  return (
    <Popover>
      <Tooltip>
        <Tooltip.Trigger>
          <Popover.Trigger>
            <Button
              aria-label="Scan with phone"
              isDisabled={isDisabled}
              size="sm"
              variant="tertiary"
            >
              <QrCode aria-hidden="true" size={18} />
            </Button>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Content showArrow>
          <Tooltip.Arrow />
          Scan with phone
        </Tooltip.Content>
      </Tooltip>
      <Popover.Content className="w-72" placement="top" offset={12}>
        <Popover.Dialog>
          <Popover.Arrow />
          <Popover.Heading>Scan with phone</Popover.Heading>
          {qrUrl == null ? (
            <p className="text-sm text-default-500">QR access is unavailable until the GUI launch token is ready.</p>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG
                  aria-label="QR code for current GUI URL"
                  className="h-full w-full"
                  includeMargin
                  value={qrUrl}
                />
              </div>
              <p className="break-all text-xs text-default-500">{qrUrl}</p>
            </div>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
```

- [ ] **Step 2: Render the popover in the composer action row**

Update `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` imports:

```ts
import { QrAccessPopover } from "@/features/qrAccess/QrAccessPopover";
```

Change the component signature to use `launchParams`:

```tsx
export function ComposerTurnControl({
  commands,
  guiHostStatus,
  launchParams,
}: ComposerTurnControlProps) {
```

Replace the current action-row wrapper:

```tsx
<div className="flex justify-end gap-2">
```

with:

```tsx
<div className="flex items-center justify-between gap-2">
  <QrAccessPopover launchParams={launchParams} />
  <div className="flex items-center gap-2">
```

Then close the new inner `<div>` after the `Send` button:

```tsx
          </Button>
        </div>
      </div>
```

Expected resulting action-row shape:

```tsx
<div className="flex items-center justify-between gap-2">
  <QrAccessPopover launchParams={launchParams} />
  <div className="flex items-center gap-2">
    <Button
      isDisabled={!stopEnabled}
      onPress={() => {
        void stop();
      }}
      variant="danger-soft"
    >
      Stop
    </Button>
    <Button
      isDisabled={!sendEnabled}
      onPress={() => {
        void submit();
      }}
      variant="outline"
    >
      Send
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Run the focused browser test to verify GREEN**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx -t "App shows a QR access popover before the Stop button"
```

Expected: PASS.

## Task 6: Add Disabled-State Coverage

**Files:**
- Modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Add a browser test for missing launch params**

Add this test after the QR popover test:

```tsx
test("App disables QR access when launch params are unavailable", async () => {
  startGuiHostConnectionMock.mockImplementation((options) => {
    options.onStatus?.({
      label: "connecting",
      eventCount: 0,
      lastEventType: null,
    });
    return () => {};
  });

  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("button", { name: "Scan with phone" })).toBeDisabled();
});
```

- [ ] **Step 2: Run the focused disabled-state test**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx -t "App disables QR access when launch params are unavailable"
```

Expected: PASS.

## Task 7: Run Focused And Package Verification

**Files:**
- Verify: `codex-gui/src/features/qrAccess/qrAccessUrl.ts`
- Verify: `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`
- Verify: `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- Verify: `codex-gui/src/__tests__/App.browser.test.tsx`
- Verify: `codex-gui/package.json`
- Verify: `codex-gui/pnpm-lock.yaml`

- [ ] **Step 1: Run QR unit tests**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/qrAccess/__tests__/qrAccessUrl.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full App browser test file**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run type-check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run lint
```

Expected: PASS.

- [ ] **Step 5: Run Prettier check**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier
```

Expected: PASS.

- [ ] **Step 6: Inspect final diff**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
git diff -- codex-gui/package.json codex-gui/pnpm-lock.yaml codex-gui/src docs/superpowers/specs/2026-06-27-codex-gui-qr-access-design.md docs/superpowers/plans/2026-06-27-codex-gui-qr-access.md
```

Expected:

- Dependency diff adds only `qrcode.react` and required lockfile entries.
- `guiHostClient.ts` launch-token parsing and fragment-clearing behavior is unchanged.
- QR URL builder uses current origin and restores `#token=`.
- Composer action row has QR on the left and `Stop` / `Send` on the right.
- Tests cover token restoration, QR popover visibility, button order, and disabled state.

## Commit Boundary

Do not stage or commit while executing this plan unless the user explicitly asks for it. If the user asks for a commit after verification passes, stage only:

```text
codex-gui/package.json
codex-gui/pnpm-lock.yaml
codex-gui/src/App.tsx
codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
codex-gui/src/features/appShell/AppShell.tsx
codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx
codex-gui/src/features/qrAccess/QrAccessPopover.tsx
codex-gui/src/features/qrAccess/qrAccessUrl.ts
codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts
codex-gui/src/__tests__/App.browser.test.tsx
docs/superpowers/specs/2026-06-27-codex-gui-qr-access-design.md
docs/superpowers/plans/2026-06-27-codex-gui-qr-access.md
```

Use a focused commit message such as:

```text
gui: add QR access popover
```

## Self-Review Notes

- Spec coverage: the plan covers composer placement, HeroUI component usage, `qrcode.react` / `QRCodeSVG`, current-origin URL construction, token restoration, disabled state, and test coverage.
- Scope: the plan does not add LAN detection, server API changes, download support, Modal fallback, or changes to `launch_gui`.
- Dependency safety: dependency installation is isolated in Task 1 and explicitly gated on user approval.
- Type consistency: `LaunchParams` stays the shared type from `guiHostClient`; `QrAccessPopover` accepts `LaunchParams | null`; `buildQrAccessUrl` owns string construction.
- Testing: unit tests cover URL construction; App browser tests cover user-visible QR behavior and composer button order.
