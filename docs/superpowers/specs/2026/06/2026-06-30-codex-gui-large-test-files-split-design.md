# Codex GUI 大测试文件拆分设计

## 背景

`codex-gui/.reports/large-files.md` 显示当前最大的测试文件是：

- `src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`，1026 行。
- `src/features/guiHost/__tests__/guiHostClient.test.ts`，552 行。
- `src/__tests__/App.browser.test.tsx`，522 行。
- `src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`，320 行。

第一批拆分只处理前两个最大测试文件。它们的行为域边界清楚，且已有测试 support 能复用。`App.browser.test.tsx` 是 App 级浏览器集成锁，包含 `vi.hoisted` / `vi.mock` 和滚动 helper，不适合作为第一批。`CommittedTranscriptSurface.browser.test.tsx` 行数较低且围绕单组件契约，暂不拆。

## 目标

- 降低两个最大测试文件的单文件体积。
- 保持 production 代码零行为变更。
- 保持原有测试覆盖语义，不删除行为断言。
- 让后续源码拆分前，测试结构更容易定位失败域。

## 非目标

- 不拆 `App.browser.test.tsx`。
- 不拆 `CommittedTranscriptSurface.browser.test.tsx`。
- 不重构 production 源码。
- 不更新 `.reports/large-files.md`，除非后续明确要求。
- 不新增通用测试框架或大型 helper 层。

## 设计

### transcriptState 测试拆分

将 `src/features/transcriptState/__tests__/transcriptStateSlice.test.ts` 按行为域拆成同目录 sibling test files：

- `transcriptStateSnapshot.test.ts`
  - store 注册。
  - attach snapshot rebuild。
  - leading prompt、middle entries、final answers 分类。
  - assistant phase 保留。
  - snapshot 中空文本、非文本输入、非 chat item 过滤。
- `transcriptStateSelectorCache.test.ts`
  - `selectTranscriptChunk` 对未变 chunk 返回稳定 view。
  - chunk 改变时返回新 view。
  - snapshot reattach 后不跨旧 snapshot 复用 chunk view。
- `transcriptStateLiveEvents.test.ts`
  - live `itemCompleted` 写入 committed transcript。
  - committed scroll commit key 推进规则。
  - live `turnCompleted` 更新终态。
  - live event 过滤。
  - commit id 去重。
  - existing entry 更新与 chunk revision。
  - middle entry phase 变化。
  - final assistant entry 更新不创建 middle chunk。
  - middle chunk limit。
- `transcriptStateReconnect.test.ts`
  - manual reconnect status。
  - 下一次 attach 清理 interrupted status 和 applied event id。

如果拆分后多个文件重复大量 builder 或 store setup，可以新增 `transcriptStateTestSupport.ts`。该 helper 只放测试构造逻辑，不导出 production-only shortcut，不改变生产 API。

### guiHostClient 测试拆分

将 `src/features/guiHost/__tests__/guiHostClient.test.ts` 按协议行为拆成同目录 sibling test files：

- `guiHostLaunchParams.test.ts`
  - fragment token 存储。
  - refresh 后从 storage 恢复 token。
  - 缺失 launch 参数错误。
  - storage 写入失败时仍使用 fragment token。
- `guiHostHandshake.test.ts`
  - authenticate、initialize、attach 请求顺序。
  - projection attached 回调。
  - projection event forwarding。
  - projection closed forwarding。
- `guiHostCommands.test.ts`
  - ready command API 发送 `turn/start`。
  - ready command API 发送 `turn/interrupt`。
  - command JSON-RPC error 只 reject command，不关闭 socket。
  - cleanup、socket error、socket close 时 reject pending command。
  - commands unavailable 回调。
- `guiHostProtocolErrors.test.ts`
  - malformed attach/event/closed payload。
  - initialize/attach JSON-RPC terminal error。
  - terminal error 后 suppress 后续 clean close/status。
  - malformed JSON-RPC message。
  - policy close error。
  - cleanup 后关闭 socket 并停止状态更新。

继续复用现有 `guiHostClientTestSupport.ts`。不把 `vi.mock` 或 hoisted mock 移入普通 helper；本批涉及的两个测试文件不依赖这种 App 级 browser mock 结构。

## 验证策略

执行实现前必须在 `codex-gui` 初始化 fnm 环境，并确认 `pnpm` 没命中 Codex runtime 缓存。

验证命令只使用已确认存在的 scripts：

- `pnpm run test:unit -- src/features/transcriptState/__tests__`
- `pnpm run test:unit -- src/features/guiHost/__tests__`
- `pnpm run type-check`

最终可运行 `pnpm run analyze:large-files` 查看新的大文件排名。该命令只用于观察输出，不自动写回报告文件。

## 风险

- 拆测试时可能遗漏 import 或重复 helper。处理方式是优先保留原断言，只移动 case，再消除重复。
- `transcriptState` 测试会直接 import `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT` 等 slice API。拆分不能改变这些 public test imports。
- `guiHostClient` 测试锁定 request id 顺序、pending request rejection 和 terminal error suppression。拆分时必须保留现有断言，不按新文件主题简化行为。

## 接受标准

- 原两个大测试文件不再保留完整 case 集合。
- 新 sibling test files 能被 Vitest 发现并运行。
- `transcriptState` 和 `guiHost` 相关单测通过。
- TypeScript type-check 通过。
- production 源码没有行为性改动。
