# Thread Root Model

## 范围

这份设计只定义 Projection Store Layer 的 thread root。它是 TS 版数据 TUI 的第一块地基。

本文件只设计：

- thread metadata 如何进入 store
- primary thread 和 active thread 的关系
- 多 thread 能力如何从第一天预留
- parent/child thread graph 如何表达
- attach snapshot 如何更新 thread root

本文件不设计：

- turn lifecycle
- `ThreadItem` lifecycle
- chat view model
- composer
- runtime request state
- UI rendering

## TUI 参考

GUI 数据层先按 TUI 的底层思路建模，而不是修补当前前端 reducer。

TUI 的关键拆分是：

- thread/session metadata 独立存在
- turns 是 thread 下的事实列表
- buffered events 用于 replay
- input/UI state 独立于 thread facts

因此 GUI 的 `ThreadRecord` 只保存 thread/session metadata。即使 app-server `Thread` payload 带有 `turns`，进入 GUI store 时也必须拆开；thread metadata 不拥有 nested turns/items。

## 已确认决策

### 1. 前端数据层是 TS 版数据 TUI

当前 `codex-gui` 前端 reducer 不作为新设计基础。新的 Projection Store Layer 以 TUI 的 thread/turn/item fact model 为源头，用 TypeScript 和 Redux 表达。

这意味着当前 nested `ThreadProjection { thread }`、`replaceOrAppendTurn`、状态面板式 GUI 都没有保留必要。

### 2. Store 从第一天 multi-thread capable

即使当前 GUI 只显示 `/gui` 打开的 primary thread，底层也不能设计成 single-thread store。

禁止的形状：

```ts
type ThreadRootState = {
  thread: ThreadRecord | null;
};
```

采用的形状：

```ts
type ThreadRootState = {
  primaryThreadId: string | null;
  activeThreadId: string | null;
  threadsById: Record<string, ThreadRecord>;
  parentThreadIdByThreadId: Record<string, string | null>;
  childThreadIdsByParentId: Record<string, string[]>;
};
```

当前阶段 UI 可以只显示 primary thread，但 facts 必须以 `threadId` 为 key 存储。

### 3. 必须区分 `primaryThreadId` 和 `activeThreadId`

`primaryThreadId` 是 `/gui` 打开的根 thread。它定义本次 GUI session 属于哪个主线。

`activeThreadId` 是当前 GUI 正在展示或操作的 thread。

当前阶段二者相同：

```ts
primaryThreadId === activeThreadId;
```

后续多子代理时二者可以不同：

```ts
primaryThreadId = "main-thread";
activeThreadId = "subagent-thread";
```

不能把二者合并成 `currentThreadId`。

### 4. Thread graph 使用扁平化存储和 graph 索引

Redux store 不直接嵌套保存 thread tree。它用 `threadsById` 保存 thread facts，用 parent/child 索引保存 TUI 风格 thread tree 的语义。

语义结构可以是树：

```text
primary thread
  subagent A
    subagent A-1
  subagent B
```

存储结构必须是扁平化：

```ts
threadsById: Record<string, ThreadRecord>;
parentThreadIdByThreadId: Record<string, string | null>;
childThreadIdsByParentId: Record<string, string[]>;
```

selector 负责把扁平数据还原成树视图。

### 5. Thread metadata 独立于 turns/items

`ThreadRecord` 只保存 thread/session metadata，不保存 nested turns 或 items。

建议字段：

```ts
type ThreadRecord = {
  id: string;
  sessionId: string;
  parentThreadId: string | null;
  preview: string;
  status: ThreadStatus;
  name: string | null;
  cwd: string;
  source: SessionSource;
  agentNickname: string | null;
  agentRole: string | null;
  createdAt: number;
  updatedAt: number;
};
```

turn 顺序和 turn facts 由后续 turn layer 维护：

```ts
turnIdsByThreadId: Record<string, string[]>;
turnsById: Record<string, TurnRecord>;
```

### 6. Attach snapshot 替换对应 thread metadata

收到 attach snapshot 后，提取 `snapshot.thread` 的 metadata，替换对应 `threadId` 的 `ThreadRecord`。

规则：

```ts
threadsById[thread.id] = toThreadRecord(snapshot.thread);
```

不做旧 metadata 的模糊合并。任何需要跨 attach 保留的 GUI-only 状态不得放在 `ThreadRecord`，必须放到 Thread Runtime Layer 或 UI Interaction Layer。

### 7. Attach 只更新当前 thread 的 graph edge

Attach snapshot 是单个 thread 的事实，不是完整 thread graph 快照。

收到 attach 后只更新当前 thread 的 parent/child 边：

1. 提取 `threadId`
2. 提取 `parentThreadId`
3. 更新 `parentThreadIdByThreadId[threadId]`
4. 将 `threadId` 加入 `childThreadIdsByParentId[parentThreadId]`
5. 如果旧 parent 变化，从旧 parent 的 children 里移除该 `threadId`

Attach 不得：

- 清空其他 threads
- 重建整棵 graph
- 删除当前 snapshot 没提到的 child

### 8. `primaryThreadId` 只来自 `/gui` launch 参数

`primaryThreadId` 不由 attach payload 决定。

启动时：

```ts
primaryThreadId = launch.threadId;
activeThreadId = launch.threadId;
```

Attach snapshot 只能验证和注册 thread metadata。第一轮 primary attach 必须满足：

```ts
snapshot.thread.id === primaryThreadId;
```

后续 subagent attach 不能改写 `primaryThreadId`。

### 9. 允许 metadata-only child/subagent thread

Projection Store Layer 允许 child/subagent thread 先只有 metadata 和 graph 关系，没有 turns/items。

允许的状态：

```ts
threadsById[childThreadId] = childThreadMetadata;
parentThreadIdByThreadId[childThreadId] = parentThreadId;
childThreadIdsByParentId[parentThreadId] = [childThreadId];
```

turns/items 加载状态由后续 turn/item 层独立表达。Thread graph 不依赖 transcript 完整加载。

## 不变量

- `threadsById` 是 thread metadata 的唯一事实来源。
- `ThreadRecord` 不包含 `turns` 或 `items`。
- `primaryThreadId` 一旦由 launch 参数建立，attach 不能重新定义它。
- `activeThreadId` 可以指向任意已知 thread，但当前阶段只能等于 `primaryThreadId`。
- parent/child graph 只表达 thread 关系，不表达 turn/item 内容。
- attach 更新单个 thread，不代表全量 graph refresh。
- metadata-only thread 是合法状态。

## 下一步

下一份设计进入 turn 层：

```text
02-turn-root-model.md
```

它只设计 thread 下的 turn 顺序和 turn facts，不进入 `ThreadItem`。
