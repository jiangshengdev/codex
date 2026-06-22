# 03 GUI Host Protocol 设计

日期: 2026-06-22
状态: 设计已确认
范围: `codex-gui/src/features/guiHost/guiHostClient.ts` 的协议 helper 拆分

## 目标

本阶段只做行为保持型源码拆分。目标是把 `guiHostClient.ts` 中与 JSON-RPC parsing 和
projection payload 校验相关的纯 helper 移到同 feature 内的新模块, 降低 client 文件复杂度,
同时不改变 WebSocket 连接生命周期、request matching、command readiness 或协议兼容语义。

## 非目标

本阶段不做:

- 不拆 pending request map。
- 不拆 command request lifecycle。
- 不拆 WebSocket open/error/close/message 状态机。
- 不移动 `sendRequest`。
- 不移动 `webSocketProtocol`。
- 不新增 e2e 覆盖。
- 不收紧 JSON-RPC 或 projection payload 校验。
- 不新增纯函数测试, 除非实施时发现现有测试无法锁住搬迁行为。

## 模块边界

新增模块:

```text
codex-gui/src/features/guiHost/guiHostProtocol.ts
```

该模块负责 GUI host client 内部使用的 protocol helper:

- JSON-RPC message 类型和 parsing。
- JSON-RPC error parsing。
- JSON-RPC id 格式化。
- `thread/projection/attach` result payload guard。
- `thread/projection/event` notification payload guard。
- `thread/projection/closed` notification payload guard。

`guiHostClient.ts` 继续负责:

- launch params/token 读取。
- URL fragment 清理。
- WebSocket URL 构造。
- WebSocket 生命周期。
- pending request map。
- handshake 推进。
- command API readiness。
- `turn/start` 和 `turn/interrupt` request 发送。
- status callback 和 projection callback 调用。

## 导出面

`guiHostProtocol.ts` 不是 feature 外公共 API。它只导出 `guiHostClient.ts` 需要的最小类型和函数。

预计导出:

```ts
export type RpcMessage = { ... };

export function parseRpcMessage(data: unknown): RpcMessage;
export function formatRpcId(value: unknown): string;
export function isThreadProjectionAttachResponse(
  value: unknown,
): value is ThreadProjectionAttachResponse;
export function isThreadProjectionEventNotification(
  value: unknown,
): value is ThreadProjectionEventNotification;
export function isThreadProjectionClosedNotification(
  value: unknown,
): value is ThreadProjectionClosedNotification;
```

预计保持私有:

- `parseRpcError`
- `isThreadProjectionEvent`
- `isTurnProjectionNotification`
- `isItemProjectionNotification`
- `isProjectionTurn`
- `isProjectionItem`
- `isRecord`

这些 helper 只支撑顶层 parser/guards, 不应该因为拆文件而变成稳定 API。

## JSON-RPC parsing 语义

搬迁必须保持当前 parser 语义:

- malformed JSON 继续抛错, 由 `guiHostClient.ts` 转成 `"Malformed JSON-RPC message"`。
- 非 object JSON 继续解析为 `{}`。
- `method` 只有 string 才保留。
- `result` 只有 record 才保留。
- `params` 只有 record 才保留。
- `error` 只有 record 且 `code` 为 number 才保留。
- `error.message` 只有 string 才保留。
- 不新增 `jsonrpc === "2.0"` 要求。
- 不收紧 `id` 类型。

这保持 app-server 兼容性和现有错误路径不变。

## Projection payload guard 语义

搬迁必须保持当前 projection guard 树和宽松校验:

- `thread/projection/attach` result 只要求:
  - result 是 record;
  - `subscriptionId` 是 string;
  - `snapshot` 是 record;
  - `snapshot.thread.id` 是 string;
  - `snapshot.thread.turns` 是 array;
  - `snapshot.headCommitId` 是 string 或 null。
- `thread/projection/event` notification 只要求:
  - notification 是 record;
  - `threadId`、`subscriptionId`、`commitId` 是 string;
  - `parentCommitId` 是 string 或 null;
  - `event` 通过现有事件 guard。
- `thread/projection/closed` notification 只要求:
  - notification 是 record;
  - `threadId` 和 `subscriptionId` 是 string;
  - `reason` 等于 `"backpressure"`。

事件 guard 继续只接受现有事件类型:

- `turnStarted`
- `turnCompleted`
- `itemStarted`
- `itemCompleted`

本阶段不引入 schema 化校验, 不要求更多字段, 不改变 malformed payload 的错误文案。

## 保留在 client 的 helper

`sendRequest` 保留在 `guiHostClient.ts`, 因为它直接服务 socket transport 写入。

`webSocketProtocol` 保留在 `guiHostClient.ts`, 因为它直接服务 WebSocket URL 构造。

这个阶段的边界是 parsing/guard, 不是 transport helper 或 request lifecycle。

## 测试策略

本阶段先不新增 `guiHostProtocol.test.ts`。

现有 `guiHostClient.test.ts` 已覆盖本阶段需要保持的外部行为:

- launch params/token 读取。
- authenticate / initialize / projection attach。
- projection event 和 projection closed 转发。
- `turn/start` 和 `turn/interrupt` command request。
- command JSON-RPC error 不关闭 socket。
- pending request cleanup/error/close reject。
- malformed attach/event/closed payload 不转发并进入 error。
- malformed JSON-RPC message 转成 error 并关闭 socket。
- terminal error 后 clean close 不覆盖 error 状态。

如果实施时现有测试无法定位搬迁问题, 才考虑补一个窄的 `guiHostProtocol.test.ts`。该补测必须只覆盖
parser/guard 语义, 不扩大本阶段行为范围。

## 验证

本阶段实现后建议最小验证:

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec vitest --run src/features/guiHost/guiHostClient.test.ts
pnpm run type-check
```

如果本阶段和其他阶段合并, 再按 `00-overall-design.md` 的阶段尾策略运行 `pnpm run ci`。

## 决策记录

- 决策 1: 只拆 protocol helper。
- 决策 2: 模块命名为 `guiHostProtocol.ts`。
- 决策 3: 只导出 `guiHostClient.ts` 需要的最小函数和类型。
- 决策 4: 完整移动 JSON-RPC parsing 语义, 不改行为。
- 决策 5: 完整移动当前 projection guard 树, 不改行为。
- 决策 6: `sendRequest` 和 `webSocketProtocol` 不移动。
- 决策 7: 先不新增纯函数测试, 只跑现有 `guiHostClient.test.ts`。
- 决策 8: 写 `03-gui-host-protocol-design.md` 并提交。
