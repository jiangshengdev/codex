# Composer Turn Control 实施计划总览

> **给 agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标:** 在 `codex-gui` 中实现纯文本 composer、`Send` 和 `Stop`, 通过 `turn/start` 启动 turn, 通过 `turn/interrupt` 中断当前 active turn。

**架构:** 先扩展 `guiHostClient` 为 command-capable JSON-RPC client, 再新增只拥有本地 draft/pending state 的 composer 组件, 最后把 composer 接入 `App` shell 并补 browser/e2e 覆盖。Transcript 仍只来自 projection/transcript state, composer 不合成消息。

**技术栈:** React 19, Redux Toolkit selectors, HeroUI React v3, Vitest, Vitest Browser, Playwright, app-server protocol generated TypeScript。

---

## 计划文档结构

本计划拆成多个文件, 按顺序执行:

1. `01-gui-host-command-api.md`
   - 目标: 让 `guiHostClient` 支持 handshake 之后的 command request / response matching。
   - 产物: `startTurn` / `interruptTurn` command API, 业务 JSON-RPC error 不再关闭 socket。
   - 必须先执行, 因为 composer UI 依赖 command API。

2. `02-composer-ui.md`
   - 目标: 新增 composer 组件和本地状态/行为。
   - 产物: TextArea、`Send`、`Stop`、Toast 错误、键盘行为、组件 browser tests。
   - 依赖 `01` 的 command API。

3. `03-app-shell-integration.md`
   - 目标: 将 composer 挂载进 `App` shell, 保持 transcript/page 滚动边界。
   - 产物: App browser tests 覆盖 attach、active turn、manual reconnect 和 no optimistic message。
   - 依赖 `01` 和 `02`。

4. `04-e2e-and-verification.md`
   - 目标: 用 Playwright 证明真实 WebSocket route 中 `Send` / `Stop` 发出正确 JSON-RPC payload。
   - 产物: e2e 覆盖和最终验证命令。
   - 依赖 `01`、`02`、`03`。

## 全局约束

- 设计源是 `/Users/sheng/cnb/codex/docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/07-composer-turn-control/design.md`。
- 不修改 `codex-rs/app-server-protocol` API。
- 不开放 `turn/steer`。
- 不新增依赖, 不修改 lockfile。
- 不把 composer draft、pending send 或 Toast error 写入 Redux。
- 不把 composer 放入 `CommittedTranscriptSurface`。
- 不做 optimistic message。
- 不把消息列表变成局部 `overflow-y-auto` 滚动容器。
- Stop 按钮使用 `Button variant="danger"`; 不使用未确认的 `danger-soft` variant。

## 建议执行顺序

- [ ] 执行 `01-gui-host-command-api.md`。
- [ ] 执行 `02-composer-ui.md`。
- [ ] 执行 `03-app-shell-integration.md`。
- [ ] 执行 `04-e2e-and-verification.md`。

每个计划文件完成后做一次小提交。提交信息建议:

```bash
git commit -m "feat(gui): add host turn command api"
git commit -m "feat(gui): add plain text composer controls"
git commit -m "feat(gui): mount composer in chat shell"
git commit -m "test(gui): cover composer send and stop e2e"
```

## 最终验收

最终完成后应满足:

- `pnpm run lint` 通过。
- `pnpm run type-check` 通过。
- `pnpm run test` 通过。
- `pnpm run test:browser` 通过。
- `pnpm run test:e2e` 通过。
- 点击 `Send` 发出 `turn/start`, payload 为 `input: [{ type: "text", text, text_elements: [] }]`。
- 点击 `Stop` 发出 `turn/interrupt`, payload 为当前 `threadId` 和 `activeTurnId`。
- 发送失败不丢草稿。
- Stop 失败不关闭 WebSocket。
- transcript 显示仍只来自 projection events。
