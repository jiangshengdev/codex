# Codex GUI Browser Launch Params Owner 设计

状态：待确认

## 背景

Codex GUI 重构审计的 B01 发现，browser launch params 当前没有独立 owner。`guiHostClient.ts` 同时拥有以下两组职责：

- 从 browser launch URL 读取 `threadId` 和 fragment token；
- 将 fragment token 写入 `sessionStorage`，或在刷新后恢复已保存 token；
- 从地址栏移除 fragment，同时保留 pathname 和 query；
- 创建 WebSocket、执行认证与 initialize/attach handshake、处理 JSON-RPC 消息和暴露 commands。

`LaunchParams` 不只是 WebSocket transport 的内部数据。App、AppShell、Composer turn control 和 QR access UI 都需要该类型，但目前必须从 `guiHostClient.ts` 导入。这让 browser launch contract 在依赖关系上看起来由 transport 拥有，也会使后续 B02 transport 拆分被迫携带与连接实现无关的类型和 URL 生命周期逻辑。

现有 production 只有一个 launch params 解析入口，不存在需要统一的重复 parser。本设计不是修复已复现的功能错误，而是在保持所有运行时行为不变的前提下，将已经存在的 browser launch contract 移交给明确的独立 owner。

## 唯一主目标

在完全保持现有启动 URL、token 存储与恢复、fragment 清理、认证、App handoff 和 QR 行为不变的前提下，为 browser launch params 建立独立 owner，并使 transport、App 与 QR 单向依赖该 owner。

## 目标

- 新增独立的 `features/browserLaunch/browserLaunchParams.ts`，作为 browser launch params 的唯一 owner。
- 由新 owner 公开 `BrowserLaunchParams` 和单一生命周期函数 `consumeBrowserLaunchParams`。
- 将 URL 解析、token 写入或恢复、默认 `sessionStorage` 获取及 fragment 清理集中到新 owner。
- 让 `guiHostClient` 只消费 `consumeBrowserLaunchParams` 的结果，不再拥有或转导出 launch params 类型与 helper。
- 让 App、AppShell、Composer、QR 和相关测试直接依赖 browser launch owner。
- 保持 browser launch 数据进入 transport、React state 和 QR URL 构造的现有顺序与结果不变。

## 非目标

- 不修改 WebSocket 创建、协议选择、认证、initialize、projection attach、request correlation、commands 或消息处理；这些属于 B02。
- 不修改 JSON-RPC runtime validation、decoder 或 generated protocol 边界；这些属于 B03。
- 不修改 Rust GUI host、app-server 启动 URL、wire contract 或 generated protocol types。
- 不修改 Redux、projection coordination、thread runtime 或 Transcript State。
- 不修改 QR UI、QR 交互或 `buildQrAccessUrl` 的行为与 owner。
- 不改变启动 URL 的 `?threadId=...#token=...` 结构。
- 不将 token 放入 query、WebSocket URL、Redux 或其他新增持久化位置。
- 不新增 barrel、compatibility alias、兼容转导出或迁移期双 owner。
- 不顺手修复 `tokenStorage.getItem()` 抛错时的现有行为。
- 不引入新的 browser environment abstraction、class 或长期 session object。

## 已确认方案

### 独立 feature owner

新增：

`codex-gui/src/features/browserLaunch/browserLaunchParams.ts`

该模块唯一拥有：

- `BrowserLaunchParams`；
- `consumeBrowserLaunchParams`；
- launch token storage key；
- 默认 `sessionStorage` 获取；
- `threadId` query 与 token fragment 解析；
- fragment token 写入和刷新后的 stored token 恢复；
- 地址栏 fragment 清理。

目标依赖方向为：

```text
browser launch URL and browser storage
                  ↓
        browserLaunch owner
                  ↓
        BrowserLaunchParams
          ↙       ↓       ↘
guiHost transport  App state  QR access UI
```

`browserLaunch` 不依赖：

- `guiHostClient` 或 `guiHostProtocol`；
- React、AppShell 或 QR UI；
- Redux；
- Rust 或 generated protocol types。

### 单一公共生命周期 API

新 owner 公开：

```ts
export type BrowserLaunchParams = {
  threadId: string;
  token: string;
};

export function consumeBrowserLaunchParams({
  location,
  replaceState,
  tokenStorage,
}: {
  location: URL;
  replaceState: History["replaceState"];
  tokenStorage?: Pick<Storage, "getItem" | "setItem">;
}): BrowserLaunchParams;
```

该函数直接使用内联 options object，不额外公开 options type 或 storage type。API 语义为：

- 接受当前 URL 快照和 `History["replaceState"]`；
- 允许注入只含 `getItem` / `setItem` 的 token storage，供测试和现有调用方使用；
- 未注入 storage 时，由 browser launch owner 自己尝试取得 `globalThis.sessionStorage`；
- 同一次调用完成 fragment 清理、参数解析、token 写入或恢复，并返回完整 `BrowserLaunchParams`；
- 函数名使用 `consume`，明确表达它包含地址栏和 storage 副作用，不把它伪装成纯 parser。

不公开独立的 `readLaunchParams` 或 `clearLaunchTokenFragment`。调用方不能自行重新组合或重新排列 launch 生命周期步骤。

### 不保留旧 owner 的兼容出口

`guiHostClient.ts` 删除现有：

- `LaunchParams`；
- launch token storage key；
- `readLaunchParams`；
- `clearLaunchTokenFragment`；
- `readSessionStorage`。

`StartGuiHostConnectionOptions.onLaunchParams` 改为使用从 browser launch owner 导入的 `BrowserLaunchParams`。`guiHostClient.ts` 不转导出该类型或生命周期函数，也不新增 `features/browserLaunch/index.ts` barrel。

所有 production 与测试消费者直接从 `features/browserLaunch/browserLaunchParams` 导入 `BrowserLaunchParams` 或 `consumeBrowserLaunchParams`。这样旧 import 路径无法继续充当隐式 owner，TypeScript 也能帮助确认迁移完整。

### QR URL 构造保持独立

`qrAccessUrl.ts` 继续拥有 `QrAccessUrlInput` 和 `buildQrAccessUrl`。它负责根据 origin、threadId 和 token 构造 QR access URL，不负责消费当前 browser URL、清理 fragment 或管理 storage。

browser launch consumption 与 QR URL construction 是相反方向的两个边界：前者读取并消费入口信息，后者为另一浏览器重建入口 URL。二者可以共享 `BrowserLaunchParams` 数据，但不合并 owner，也不改变 QR URL 的 pathname、query、fragment 或编码行为。

## 已排除的替代方案

### 继续放在 `features/guiHost`

曾考虑新增 `features/guiHost/guiHostLaunchParams.ts`。该方案移动量较小，但 App 和 QR 仍需从 GUI host feature 获取 browser contract，无法为 B02 transport 拆分建立清晰边界，因此不采用。

### 由 AppShell 拥有

曾考虑新增 `features/appShell/browserLaunchParams.ts`。该方案靠近 React bootstrap，但会使 transport 和 QR 依赖 UI composition 层，并让 AppShell 知道更多 token 生命周期细节，因此不采用。

### 暴露多个低层 helper

曾考虑保留 `readLaunchParams`、`clearLaunchTokenFragment` 等多个独立导出。该方案只完成文件拆分，执行顺序仍由 transport 或其他调用方拥有，无法收口安全相关生命周期，因此不采用。

### 使用有状态 session object

曾考虑用 class 或 session object 封装 browser environment。当前 launch params 只需一次性消费，没有长期内部状态；该方案会扩大 API 和测试表面，因此不采用。

### 保留 `guiHostClient` 转导出或增加 barrel

当前仓库没有需要兼容的外部 launch params import。转导出会继续保留错误 owner，单文件 feature 的 barrel 只增加间接层，因此都不采用。

## 完整数据流

Production 数据流设计为：

```text
startGuiHostConnection receives a URL snapshot
  -> consumeBrowserLaunchParams
       -> remove fragment from the visible address bar
       -> resolve injected tokenStorage or attempt to read globalThis.sessionStorage
       -> read threadId and fragment token from the supplied URL snapshot
       -> validate threadId
       -> if a non-empty fragment token exists, attempt tokenStorage.setItem
       -> otherwise call tokenStorage.getItem and validate the stored token
       -> return BrowserLaunchParams
  -> synchronously call onLaunchParams(params)
  -> create WebSocket
  -> authenticate with params.token
  -> initialize with the existing clientInfo and capabilities params
  -> attach with params.threadId
```

顺序必须固定为：

1. 调用 `replaceState(null, "", pathname + search)` 清理可见地址栏 fragment；
2. 计算 `tokenStorage ?? readSessionStorage()`：有注入 storage 时直接使用；否则在此处尝试取得 `globalThis.sessionStorage`，并继续捕获该属性访问异常；
3. 基于调用方传入且未被修改的 URL 对象快照读取 `threadId` 和 fragment token；
4. 校验 `threadId`；非空 fragment token 存在时尝试调用 `setItem()`，否则调用 `getItem()` 并校验 stored token；
5. 返回 `BrowserLaunchParams`；
6. `guiHostClient` 同步调用 `onLaunchParams`；
7. 创建 WebSocket，使用 token 认证，以现有参数 initialize，随后使用 threadId attach。

取得 storage 对象与调用其方法是两个不同步骤：默认 `sessionStorage` 属性访问发生在 URL 读取前，`setItem()` / `getItem()` 只在 URL 读取及 `threadId` 校验后按 token 分支调用。清理地址栏不会改变传入的 URL 快照，因此先清理可见地址栏不会丢失本次消费所需的 fragment token。`onLaunchParams` 必须继续在 WebSocket 创建前同步触发，使 App state 与 projection coordination 获得与当前实现相同的启动 handoff 时机。

`replaceState` 是该生命周期的第一项副作用。若它抛错，错误继续同步传播，后续默认 storage 获取、注入 storage 方法调用、URL 解析、`onLaunchParams` 和 WebSocket 创建都不得执行。若 `replaceState` 已成功，而后续解析因缺少 `threadId` 或 token 抛错，则 visible fragment 已按现有顺序完成清理，不回滚地址栏。

## 错误、安全与行为不变量

### 参数优先级与错误文本

- `threadId` 继续只从 `threadId` query parameter 读取；空字符串视为缺失。
- token 继续优先使用 URL fragment 中的非空 `token`。
- 非空 fragment token 存在时，即使 storage 中已有旧 token，也必须以 fragment token 为准并尝试覆盖 storage。
- URL 没有 fragment token 或 `#token=` 为空时，继续从固定 storage key 恢复 token。
- 空 fragment token 不覆盖 stored token；若 stored token 也不存在或为空，则继续抛出缺 token 错误。
- 缺少 `threadId` 时继续抛出 `Missing threadId query parameter`。
- fragment 和 storage 都没有 token 时继续抛出 `Missing launch token fragment`。
- 不改变错误发生在 WebSocket 创建前的现有同步语义。
- `replaceState()` 抛错时继续同步传播，默认 storage 获取、注入 storage 方法调用、URL 解析和 WebSocket 流程不继续。
- `replaceState()` 成功后即使参数解析抛错，visible fragment 也已经被清理。

### Storage 异常边界

- owner 取得默认 `globalThis.sessionStorage` 时继续捕获属性访问异常；不可取得时按没有 storage 处理。
- fragment token 的 `setItem()` 继续位于 `try/catch` 中；写入失败不影响当前连接使用该 fragment token。
- `getItem()` 抛错的现有传播行为保持不变。本设计不新增 catch、fallback 或错误转换，也不将其视为 B01 的附带修复。
- launch token storage key 的字面量保持不变。

### URL 与 token 安全边界

- 地址栏清理继续移除整个 fragment，并保留 pathname 和 query。
- token 继续只通过 fragment 进入 browser launch flow，不进入 query。
- WebSocket URL 继续只由页面 protocol、host 和 `/ws` 构成，不包含 token。
- token 继续通过现有 `gui/authenticate` request body 使用。
- 不新增日志、状态、Redux 字段或其他 token 暴露表面。

### 其他行为不变量

- `onLaunchParams` 接收的 `threadId` 和 token 值不变。
- App、Composer 和 QR UI 获得 launch params 的时机与空值语义不变。
- QR URL 继续使用当前 origin、`threadId` query 和 token fragment。
- `http:` / `https:` 到 `ws:` / `wss:` 的选择不变。
- WebSocket status、cleanup、handshake、projection 和 commands 行为不变。

## 组件与文件影响边界

设计级影响范围包括：

- 新增 `codex-gui/src/features/browserLaunch/browserLaunchParams.ts`；
- 新增或迁移 browser launch owner 的单元测试；
- `guiHostClient.ts` 删除 launch owner 实现，改为消费新生命周期函数和类型；
- GUI host launch/handshake tests 按 owner 与 transport 职责调整；
- App、GuiHostConnectionBridge、AppShell、ComposerTurnControl、QrAccessPopover 及相关 tests 的 type-only import 改为直接依赖新 owner。

以下文件或模块不应发生行为修改：

- `qrAccessUrl.ts` 及 QR UI 行为；
- `guiHostProtocol.ts` 与 generated protocol；
- Rust GUI host、app-server 和 launch URL contract；
- Redux、projection、thread runtime、Transcript State 和 rendering；
- B02/B03 的 transport、handshake、request correlation、runtime validation 或 decoder 设计。

具体文件清单、移动顺序、测试命令和提交边界属于后续 implementation plan，不在本设计中展开。

## 测试策略

### Browser launch owner 单元测试

新 owner 的测试直接覆盖：

- 从 `?threadId=...#token=...` 返回 `BrowserLaunchParams`；
- fragment token 写入 storage，并在无 fragment 的刷新 URL 中恢复；
- fragment token 覆盖 storage 中已有的旧 token；
- 空 `threadId` 视为缺失并抛出既有 threadId 错误；
- 空 `#token=` 回退 stored token，且不调用 `setItem()` 覆盖它；
- 空 `#token=` 且没有非空 stored token 时抛出既有缺 token 错误；
- fragment 清理保留 pathname 和 query；
- `replaceState()` 抛错时不继续取得默认 storage、不调用注入 storage 方法，也不继续读取 URL；
- fragment 清理成功后解析缺参抛错时，visible fragment 保持已清理状态；
- 缺少 `threadId` 与缺少 token 的错误文本完全不变；
- 默认 storage 不可取得时的现有降级；
- `setItem()` 抛错时仍返回当前 fragment token；
- `getItem()` 抛错时继续传播，不引入新 fallback。

单元测试应验证单一 `consumeBrowserLaunchParams` 的外部 contract，不继续把独立 parser 和 clear helper 当作公共 API 测试。

### GUI host transport 集成测试

GUI host tests 保留窄集成覆盖：

- owner 返回的 token 继续用于 `gui/authenticate`；
- owner 返回的 threadId 继续进入现有 attach flow；
- `onLaunchParams` 在 `createWebSocket` 前同步触发；
- launch consumption 失败时不创建 WebSocket。

测试按职责拆分不代表重复所有 owner case。URL 解析、storage 优先级和 fragment 清理由 browser launch tests 负责；transport tests 只验证 launch result 与连接流程的集成边界。

### UI 与 browser tests

现有 App/browser test support 中构造 launch params 的方式改用 `BrowserLaunchParams` 类型，但用户可见行为和断言不变。本次没有 UI、文案或 rendering 变化，不新增视觉设计，也不因类型 owner 迁移更新无关 snapshot。

## 风险与控制

- **生命周期顺序被重排：** `consumeBrowserLaunchParams` 统一拥有清理、解析和 storage 操作；transport test 明确锁定 `onLaunchParams` 先于 WebSocket 创建。
- **fragment token 被旧 storage 覆盖：** owner 单元测试明确覆盖 fragment 优先级与旧 token 覆盖行为。
- **异常语义被“顺手改善”：** 保持默认 storage 属性访问、`setItem()` 和 `getItem()` 三种不同异常边界；尤其不捕获现有会传播的 `getItem()` 异常。
- **旧 owner 通过转导出继续存在：** 不保留 `guiHostClient` compatibility export，不新增 barrel，所有消费者直接迁移。
- **B02/B03 范围被提前引入：** 不改变 transport、handshake、JSON-RPC parser 或 runtime validator；发现相关改动需求时停止并回到对应批次。
- **QR 反向构造逻辑被错误合并：** `qrAccessUrl.ts` 保持独立 owner，只消费相同字段，不并入 browser launch lifecycle。
- **安全边界漂移：** 通过测试确认 fragment 清理、token 不进入 WebSocket URL、storage 写入失败仍可认证。

## 与 B02 / B03 的边界

B01 只建立 browser launch params owner，并迁移现有依赖。完成后：

- B02 可以在不携带 URL、storage 和 fragment 生命周期职责的情况下，独立设计 WebSocket transport、handshake、request correlation 和 commands owner；
- B03 可以独立设计 inbound JSON-RPC/runtime validation 与 protocol decoder，不需要处理 launch params 类型；
- B01 不预先定义 B02/B03 的模块结构、公共 API 或实施顺序；
- B02/B03 不应重新吸收 `BrowserLaunchParams` owner，只能消费其结果中连接所需的 threadId/token。

如果 B01 实施中必须修改 WebSocket 状态机、handshake request、message decoder、Rust URL 生成或 wire payload，则已经越过本设计边界，必须停止并回到对应设计确认。

## 验收标准

- `BrowserLaunchParams` 和 `consumeBrowserLaunchParams` 由 `features/browserLaunch/browserLaunchParams.ts` 直接导出。
- browser launch owner 集中拥有 storage key、默认 `sessionStorage` 获取、解析、写入或恢复及 fragment 清理。
- `guiHostClient.ts` 不再定义或转导出 `LaunchParams`、`readLaunchParams`、`clearLaunchTokenFragment` 或 storage helper。
- App、AppShell、Composer、QR 和测试消费者直接依赖新 owner，不再从 `guiHostClient.ts` 获取 launch params 类型。
- 地址栏清理、URL 快照解析、storage 操作、`onLaunchParams`、WebSocket 创建、认证和 attach 的相对顺序保持不变。
- fragment token 覆盖旧 stored token，并在 storage 写入失败时仍可用于当前认证。
- 空 `threadId` 继续视为缺失；空 `#token=` 不覆盖 storage，而是回退非空 stored token，没有非空 stored token 时继续抛出既有缺 token 错误。
- 刷新后仍能从相同 storage key 恢复 token。
- `Missing threadId query parameter` 和 `Missing launch token fragment` 文本及同步抛出语义不变。
- 默认 `sessionStorage` 属性访问、`setItem()` 与 `getItem()` 的现有异常行为不变。
- `replaceState()` 抛错时同步终止 launch consumption；清理成功后的参数错误不回滚 visible fragment。
- token 不进入 query 或 WebSocket URL，fragment 清理继续保留 pathname 和 query。
- QR URL、QR UI、Rust launch URL、wire contract、Redux、projection、thread runtime 和 rendering 行为不变。
- B02 transport/handshake 与 B03 runtime validation/decoder 没有被并入 B01。

## 参考

- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/00-summary.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/02-gui-host-transport-and-protocol.md`
- `docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/09-cross-cutting-boundaries-and-exclusions.md`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`
- `codex-gui/src/features/qrAccess/qrAccessUrl.ts`
