# Codex GUI Frontend Refactor Overall Design

日期: 2026-06-22
状态: 设计已确认
范围: codex-gui 前端大文件重构

## 目标

本轮重构是行为保持型大文件重构。目标是降低 `codex-gui` 前端大文件复杂度和测试噪声,
同时保持用户可见行为、UI、协议语义和 e2e 覆盖边界不变。

本轮不做:

- 不改 UI 行为。
- 不改 app-server 协议语义。
- 不改 e2e 覆盖范围。
- 不做跨 feature 的公共抽象。
- 不把私有 helper 提升成全局 utils。
- 不顺带修复未纳入本轮设计的问题。

## 输入依据

本设计以当前大文件报告为入口:

```text
/Users/jiangsheng/cnb/codex/codex-gui/.reports/large-files.md
```

报告显示当前源码大文件主要集中在:

- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts`
- `codex-gui/src/features/liveEventHandling/liveEventHandling.ts`
- `codex-gui/src/App.tsx`

测试大文件主要集中在:

- `codex-gui/src/features/guiHost/guiHostClient.test.ts`
- `codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/e2e/app.spec.ts`

## 文档结构

本目录采用一个总设计加每阶段一个设计的结构:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-22-codex-gui-frontend-refactor/
  00-overall-design.md
  01-transcript-state-design.md
  02-test-support-design.md
  03-gui-host-protocol-design.md
  04-app-shell-design.md
```

`00-overall-design.md` 只记录总目标、阶段顺序、放置规则、验证策略和全局约束。具体模块边界、
测试覆盖和切片计划由后续阶段设计分别定义。

实施计划不放在 specs 目录。设计确认后, 对应计划文档放在:

```text
/Users/jiangsheng/cnb/codex/docs/superpowers/plans/2026-06-22-codex-gui-frontend-refactor/
```

## 阶段顺序

阶段顺序按低风险到高风险排列:

1. `01-transcript-state-design.md`

   先拆 `transcriptStateSlice.ts`。该文件的行为边界清楚, 现有 reducer 测试覆盖 snapshot
   rebuild、live `itemCompleted`、turn 状态更新、commit 去重、chunk limit 和 manual reconnect。

2. `02-test-support-design.md`

   再拆测试 helper。目标是降低后续重构噪声, 但不改变测试语义和 fixture 语义。

3. `03-gui-host-protocol-design.md`

   再拆 `guiHostClient.ts` 的 JSON-RPC parsing、projection payload guard 和格式化 helper。
   WebSocket 生命周期、pending request 状态机和 command readiness 仍留在 client 边界内。

4. `04-app-shell-design.md`

   `App.tsx` shell 拆分纳入本轮必做阶段。该阶段只降低 App shell 复杂度, 不改变用户行为、
   UI、连接生命周期语义或 projection runtime 派发语义。

## 文件放置规则

源码模块采用 feature 内就近放置。拆出的模块仍属于原 feature, 不提升为共享 API。

示例:

```text
codex-gui/src/features/transcriptState/
  transcriptStateSlice.ts
  transcriptEntryMaterialization.ts

codex-gui/src/features/guiHost/
  guiHostClient.ts
  guiHostProtocol.ts
```

只有出现多个 feature 的真实生产消费方时, 才重新讨论是否提升到共享目录。本轮不创建
`src/shared`、`src/internal` 或全局 `utils`。

测试 helper 采用测试目录内就近放置:

```text
codex-gui/src/features/transcriptState/__tests__/
  transcriptStateSlice.test.ts
  transcriptStateTestBuilders.ts

codex-gui/src/features/guiHost/__tests__/
  guiHostClientTestSupport.ts
```

测试 helper 不放在 feature 根目录, 避免污染生产模块边界。只有多个测试目录确实需要共享时,
才重新讨论提升位置。

## 验证策略

本轮采用阶段内最小验证加阶段尾综合验证。

阶段内每个小切片跑对应测试:

- transcript state 切片优先跑 `transcriptStateSlice.test.ts`。
- test support 切片跑对应被拆测试文件。
- gui host protocol 切片跑 `guiHostClient.test.ts`。
- App shell 切片跑 `App.browser.test.tsx`。

阶段完成后跑 `type-check`。较大阶段或多个切片合并后再跑 `pnpm run ci`。

Browser/e2e 只在触碰 App shell、用户行为边界或真实 WebSocket payload 边界时运行。`e2e/app.spec.ts`
保留为后期烟测边界, 不作为第一阶段默认修改对象。

## 实施约束

每个阶段必须继续遵守:

- 先设计, 再计划, 最后实现。
- 一次只动一个主要边界。
- 不安装依赖。
- 不改 lockfile。
- 不把测试重构和源码重构混成不可拆 diff。
- 不 stage/commit, 除非当前任务明确要求。

本总设计写入后按本次确认策略提交。后续阶段是否提交, 由对应阶段任务单独确认。

## 决策记录

- 决策 1: 选择行为保持型大文件重构。
- 决策 2: 选择低风险到高风险的阶段顺序。
- 决策 3: 选择一个总设计加每阶段一个设计。
- 决策 4: 选择源码 feature 内就近放置。
- 决策 5: 选择测试目录内就近放置测试 helper。
- 决策 6: 选择阶段内最小验证加阶段尾综合验证。
- 决策 7: 选择 `04-app-shell-design.md` 纳入本轮必做阶段。
- 决策 8: 选择写文件并提交。
