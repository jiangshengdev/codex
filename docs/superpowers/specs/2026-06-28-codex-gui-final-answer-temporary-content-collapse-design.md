# Codex GUI 最终回复前临时内容折叠设计

## 背景

`codex-gui` 当前的 committed transcript 会把已物化的 user/assistant message 按 turn 渲染出来。Rust 侧已经把 assistant message 分类为 `MessagePhase::Commentary` 和 `MessagePhase::FinalAnswer`，app-server v2 的 `ThreadItem::AgentMessage` 也会把 `phase` 传到 generated TypeScript 类型中。

这个功能的目标不是隐藏正在生成中的进展，而是把同一 turn 内的临时过程和最终回复拆成两个同级模块。临时内容模块从临时内容出现时就存在；在最终回复出现前强制展开，最终回复出现后才允许折叠，让最终回复成为主视图。

## 已确认决策

1. 折叠触发规则

   只有同一 turn 内已经出现 `phase === "final_answer"` 的 assistant message 后，才允许折叠它之前的临时内容。没有最终回复时，临时内容模块仍然存在，但必须强制展开且禁用收起。

2. 折叠范围

   折叠最终回复之前的临时可见内容。第一版当前可覆盖 `phase === "commentary"` 的 assistant message；后续如果 committed transcript 增加 reasoning、tool progress 或其他明确代表 mid-turn progress 的可见条目，应接入同一折叠分组。

   不折叠 user message、`phase === "final_answer"`、`phase === null` 的 legacy assistant message，以及 terminal error/interrupted status。`phase === null` 必须继续直接显示，因为 Rust 协议注释明确说明 provider/model 不一定稳定提供 phase。

3. 默认状态

   没有最终回复时强制展开；出现最终回复后默认折叠。用户可以在最终回复出现后展开查看最终回复前的临时内容。

4. HeroUI 呈现组件

   使用 HeroUI v3 的 `Disclosure` 呈现一个 turn 内的临时内容折叠区。触发器使用 HeroUI `Button`，并在触发器中放置 `Disclosure.Indicator`。

5. 展开状态

   不持久记住展开状态。刷新、重连、重新 attach 或组件重新挂载后，根据当前 turn 是否已有最终回复决定初始状态：没有最终回复时强制展开；已有最终回复时默认折叠。

## 设计

### 数据模型

`TranscriptEntry` 需要保留 assistant message 的 phase 信息。建议在 message entry 上增加可选 `phase` 字段：

```ts
phase: "commentary" | "final_answer" | null;
```

`materializeTranscriptItem()` 在处理 `ThreadItem.type === "agentMessage"` 时，从 `item.phase` 复制到 transcript entry。user message 不需要 phase；如果为了类型一致性保留字段，应为 `null`。

### 模块结构

每个 turn 的 committed transcript 显示结构应拆成同级模块：

```text
Turn
  Turn metadata
  Temporary content module
    Disclosure
      temporary entries
  Final answer module
    final_answer entries
  Other entries
```

`Temporary content module` 只负责最终回复前的临时可见内容。`Final answer module` 与它同级，不能放入 `Disclosure.Content` 内。这样最终回复始终是独立结果，而不是折叠区的一部分。

### 分组规则

折叠判断在 turn 渲染层完成，而不是在 reducer 中删除或重排 entries。这样可以保持 transcript state 接近协议事实，也便于未来增加不同呈现方式。

每个 turn 渲染时按 entry 顺序处理：

1. 找到同一 turn 内第一个 `phase === "final_answer"` 的 assistant message。
2. 将第一个最终回复之前的可折叠临时 entries 归入 `Temporary content module`。
3. 将 `phase === "final_answer"` 的 assistant message 归入 `Final answer module`，并直接显示。
4. 最终回复之后的内容、legacy unknown phase 内容和非临时内容继续直接显示，不进入临时折叠区。
5. 如果没有临时 entries，不渲染 `Temporary content module`。

如果最终回复前同时存在可折叠临时内容和不可折叠内容，渲染顺序应保持稳定：不可折叠内容按原位置显示；可折叠内容合并到同级的 `Temporary content module`。第一版当前只有 user/assistant message，因此主要场景是 user message 展开、commentary 进入临时模块、final answer 进入最终回复模块。

### UI 行为

临时内容模块属于单个 turn，不跨 turn 合并。标题应简短，表达数量和性质，例如：

```text
Temporary updates · 2 items
```

如果后续项目已有 i18n 文案规范，应按现有 Lingui 流程补齐消息；第一版可以先沿用当前 committed transcript 的英文 UI 文案风格。

临时内容模块内部复用现有 `CommittedTranscriptEntry` 呈现单条内容，避免为 commentary 创建另一套卡片样式。`Disclosure` 本身负责展开/收起语义，触发器使用 `Button slot="trigger"`，并包含 `Disclosure.Indicator`。

`Disclosure` 的状态应受 turn 是否已有最终回复控制：

```tsx
<Disclosure isExpanded={!hasFinalAnswer || isExpanded} isDisabled={!hasFinalAnswer}>
```

没有最终回复时，`isExpanded` 强制为 `true`，`isDisabled` 为 `true`，表现为临时过程完整展开且不可收起。最终回复进入后，临时内容模块解除禁用，并把本地展开状态初始化或重置为 `false`，表现为默认折叠且可展开。

### 组件边界

建议保持 `transcriptState` 负责协议数据物化和 selector 缓存，`CommittedTranscriptSurface` 负责按 turn 做显示分组。

如果 `CommittedTranscriptSurface.tsx` 因分组逻辑明显膨胀，应把 turn 内分组逻辑抽成同目录的纯函数，例如 `groupTranscriptEntriesForDisplay()`，并用单元测试覆盖边界。不要把分组规则写进 JSX map 里。

### 边界情况

- 没有 `final_answer`：临时内容模块强制展开且禁用收起。
- 只有 `final_answer`：不显示临时内容模块，只显示最终回复模块。
- `commentary` 在 `final_answer` 之后：不折叠，按原顺序直接显示。
- 多个 `final_answer`：第一个 `final_answer` 作为折叠触发点；后续最终回复直接显示。
- `phase === null`：不折叠，直接显示。
- 空文本 agent message：继续由现有物化逻辑过滤。
- snapshot attach 和 live itemCompleted 应使用同一规则，不因来源不同产生不同显示。

## 测试策略

验证命令需要在 `codex-gui` 目录下使用用户 fnm 环境初始化后的 `pnpm`。

应增加或更新以下测试：

1. `transcriptStateSlice.test.ts`

   覆盖 agent message phase 从 `ThreadItem` 物化到 `TranscriptEntry`。

2. `CommittedTranscriptSurface.browser.test.tsx`

   覆盖存在 final answer 时，临时内容模块默认折叠，最终回复模块直接显示，二者为同级模块。

3. `CommittedTranscriptSurface.browser.test.tsx`

   覆盖没有 final answer 时，临时内容模块存在、强制展开并禁用收起。

4. `CommittedTranscriptSurface.browser.test.tsx`

   覆盖 `phase === null` 的 assistant message 不被折叠。

5. `App.browser.test.tsx`

   如 App 级 committed transcript 覆盖需要更新，补一个端到端渲染用例，确保 attach snapshot 和 live itemCompleted 行为一致。

已确认 `codex-gui/package.json` 存在以下脚本，可作为后续计划或实现验证使用：

- `pnpm run lint`
- `pnpm run type-check`
- `pnpm run test:unit`
- `pnpm run test:browser`

## 非目标

- 不改变 Rust/app-server 协议。
- 不重排或删除 transcript state 中的原始 entries。
- 不折叠 legacy unknown phase 内容。
- 不持久化用户展开状态。
- 不引入跨 turn 的全局折叠控制。
