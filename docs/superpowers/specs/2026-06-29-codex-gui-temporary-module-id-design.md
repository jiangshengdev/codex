# Codex GUI Temporary Module ID 设计补充

日期: 2026-06-29

## 背景

`committedTranscriptSurface` 当前会把同一 turn 内、最终回复前的 `commentary` assistant message 合并成一个 `temporaryModule`。该模块的 `id` 会作为 `TemporaryTranscriptModule` 的 React `key` 使用。

当前实现把所有 temporary entries 的 id 拼接成模块 id:

```ts
`temporary:${entries.map((entry) => entry.id).join(":")}`
```

这会带来两个问题:

- 生成 id 时需要额外扫描完整 temporary entries 列表。
- temporary entries 持续追加时，模块 id 会随着成员列表变化而变化，导致 React `key` 变化，组件可能反复 remount。

## 已确认决策

temporary module id 使用第一个 temporary entry 的 id:

```ts
`temporary:${firstTemporaryEntry.id}`
```

该 id 表达的是“从这个 first temporary entry 开始的 temporary module”，而不是完整成员列表。完整成员关系仍由 `entries` prop 表达。

## 设计

`groupTranscriptEntriesForDisplay()` 仍负责找出 `temporaryEntries` 和渲染插入点。只有在 `temporaryEntries.length > 0` 的分支里才生成 temporary module，因此实现可以安全使用 `temporaryEntries[0]` 作为 id 来源。

推荐 helper 形态:

```ts
const temporaryModuleId = (entry: TranscriptEntry): string => `temporary:${entry.id}`;
```

调用点使用:

```ts
id: temporaryModuleId(temporaryEntries[0]),
```

这会让 temporary module 在同一组内容追加时保持稳定 key。新增 temporary entry 时，`entries` prop 更新，模块组件本身不需要因为 id 改变而重新挂载。

## 范围

本补充只处理 temporary module id 的生成策略。

不改变以下行为:

- 不改变 `commentary` 和 `final_answer` 的分组规则。
- 不改变 `TemporaryTranscriptModule` 的展开、折叠或禁用逻辑。
- 不改变 transcript state 或 selector 数据结构。
- 不处理完整 turn flatten/group 的累计成本问题；该问题需要另行设计 single-pass 或 turn-level display model 缓存。

## 测试策略

更新 `committedTranscriptDisplayGroups` 单元测试中“多个 pre-final commentary entries 合并为一个 temporary module”的期望 id。

旧期望:

```ts
id: "temporary:commentary-1:commentary-2"
```

新期望:

```ts
id: "temporary:commentary-1"
```

验证命令使用 `codex-gui/package.json` 中已确认存在的 `test:unit`、`format:prettier:fix`、`format:prettier` 脚本。
