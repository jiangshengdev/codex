# debug-responsive-gui Redux Inspector 设计

## 背景

`debug-responsive-gui` 已经有可恢复的 GUI 调试流程和独立的 React inspector。React inspector 的边界是读取当前 `playwright-cli` 控制页面的 React fiber tree，并保持纯 JSON 输出；它明确不读取 Redux store。

历史调研已经确认：在当前 Codex GUI 页面中，Redux store 不需要依赖 Redux DevTools extension，也不应该依赖 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots()`。稳定入口是 DOM 上的 React root：从 `#root.__reactContainer$...` 取得 root fiber，沿 fiber tree 查找 React-Redux Provider，再读取 `memoizedProps.value.store.getState()`。

本设计新增独立 Redux inspector，和现有 React inspector 并列，不混入同一个脚本。

## 目标

- 在 `.codex/skills/debug-responsive-gui/scripts/` 下新增 `inspect-redux.mjs`。
- 只检查当前 `playwright-cli` 控制页面，不启动、不导航、不关闭浏览器。
- 从 `#root.__reactContainer$...` 读取 React root fiber。
- BFS 查找 React-Redux Provider，并读取 `memoizedProps.value.store.getState()`。
- 默认输出 Redux store 的安全摘要，而不是完整 state。
- 支持通过 `--path <dot.path>` 读取 Redux state 的局部子树。
- stdout 只输出 JSON，方便后续自动化解析。

## 非目标

- 不修改 Redux store。
- 不 dispatch action。
- 不订阅 store 变化。
- 不实现 `--watch` 或等待状态出现的能力。
- 不依赖 Redux DevTools extension。
- 不依赖 `__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots()`。
- 不把 Redux inspection 混入 `inspect-react.mjs`。
- 不实现通用 JavaScript 表达式执行器。

## 文件范围

新增脚本：

```text
.codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs
```

建议新增共享实现：

```text
.codex/skills/debug-responsive-gui/scripts/lib/inspect-redux-page.mjs
```

建议新增测试：

```text
.codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs
```

更新 skill 说明：

```text
.codex/skills/debug-responsive-gui/SKILL.md
```

`SKILL.md` 只记录稳定入口、参数、输出边界和常见用法。具体遍历逻辑保留在脚本和测试中。

## 命令接口

默认输出当前 Redux store 摘要：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs
```

读取局部 state：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.entriesById
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path threadRuntime.current
```

控制值展开边界：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.entriesById --max-depth 2 --max-keys 40 --max-array-items 20
```

## 参数设计

- `--path <dot.path>`：读取 Redux state 的局部路径。路径只支持普通点路径，不在本阶段支持 bracket expression、函数调用或任意 JavaScript。
- `--max-depth <number>`：控制 `safeValue` 输出对象深度。
- `--max-keys <number>`：控制每个对象最多输出的 key 数。
- `--max-array-items <number>`：控制每个数组最多输出的元素数。
- `--max-string-length <number>`：控制字符串最大输出长度。

默认参数应保守，避免读取 `entriesById` 等大对象时刷屏。

## Redux 入口

脚本在当前页面上下文执行读取逻辑：

1. 查找 `document.querySelector("#root")`。
2. 从 root element 的 own property 中查找 `__reactContainer$...`。
3. 使用 root container 取得 React root fiber。
4. BFS 遍历 `child` / `sibling` 链。
5. 查找 `fiber.memoizedProps.value.store.getState` 为函数的 Provider fiber。
6. 调用 `store.getState()` 读取 Redux state。

`globalThis[Symbol.for("react-redux-context")]` 可以作为诊断信息输出，但不作为唯一入口。React-Redux context 当前值可能为 `null`，store 稳定位置是 Provider fiber 的 `memoizedProps.value.store`。

## 默认输出

默认输出结构：

```json
{
  "ok": true,
  "page": {
    "url": "http://127.0.0.1:52949/?threadId=...",
    "title": "codex-gui"
  },
  "root": {
    "selector": "#root",
    "found": true,
    "containerKey": "__reactContainer$...",
    "rootTag": 3
  },
  "reactRedux": {
    "contextPresent": true,
    "contextSize": 1,
    "provider": {
      "path": "0.0.0.0.0.0.0",
      "depth": 6,
      "tag": 10,
      "name": "ReactRedux",
      "valueKeys": ["store", "subscription", "getServerState"]
    }
  },
  "counts": {
    "visitedFibers": 7
  },
  "state": {
    "topKeys": ["threadIdentity", "threadRuntime", "transcriptState"],
    "slices": {
      "threadIdentity": {
        "keys": ["launchThreadId", "attachedThreadId", "attachStatus"]
      },
      "threadRuntime": {
        "keys": ["current"],
        "hasCurrent": true,
        "snapshotTurnsCount": 28,
        "eventBufferCount": 69
      },
      "transcriptState": {
        "keys": ["threadId", "turnIds", "turnsById", "chunksById", "entriesById"],
        "turnIdsCount": 30,
        "entriesByIdCount": 103
      }
    }
  },
  "errors": []
}
```

默认摘要可以包含已知 Codex GUI slice 的常见 count 字段，但不能要求这些字段必须存在。未知 slice 只输出 key 摘要。

## `--path` 输出

传入 `--path` 后，输出同样包含页面、root、Provider 元数据，并额外包含：

```json
{
  "path": {
    "requested": "transcriptState.entriesById",
    "found": true,
    "value": {}
  }
}
```

`value` 必须经过受限的 `safeValue` 处理。

如果路径不存在，脚本输出结构化失败：

```json
{
  "ok": false,
  "errors": [
    {
      "code": "path_not_found",
      "message": "Redux state path not found: transcriptState.missing"
    }
  ]
}
```

## 值保护

Redux state 可能很大。所有非摘要值都必须经过 `safeValue`：

- 限制对象深度。
- 限制数组元素数。
- 限制对象 key 数。
- 限制字符串长度。
- 循环引用输出 `[circular]`。
- 函数输出函数摘要。
- DOM 节点和 React element 输出摘要字符串。
- 超限对象输出 `[max depth]` 或截断标记。

可复用现有 React inspector 的 `safeValue` 思路；如果直接复用函数，需要保持 import 边界清晰，避免让 Redux 脚本依赖 React CLI 入口副作用。

## 错误处理

可恢复失败必须输出 JSON，并以非 0 状态退出。错误 code 建议包括：

- `browser_not_open`
- `root_element_not_found`
- `react_root_not_found`
- `redux_store_not_found`
- `path_not_found`
- `invalid_argument`

崩溃级异常可以写 stderr，但应尽量转换成结构化 JSON。

## 测试

实现时优先抽出纯函数，避免只能通过真实浏览器验证。

建议覆盖：

- 参数解析。
- 点路径解析和读取。
- 缺失路径错误。
- `safeValue` 截断、循环引用、函数和大数组。
- 从伪造 fiber tree 查找 React-Redux Provider store。
- 默认 store 摘要构建。
- 页面表达式构建不依赖 Redux DevTools extension。

真实 GUI smoke 作为最后验证：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs
node .codex/skills/debug-responsive-gui/scripts/inspect-redux.mjs --path transcriptState.entriesById
```

## 与现有脚本的关系

- `debug-responsive-gui.mjs` 仍负责打开/恢复 GUI 调试页面。
- `inspect-react.mjs` 仍只负责 React fiber tree inspection。
- `inspect-redux.mjs` 只负责 Redux store inspection。
- 两个 inspector 可以共享“从 DOM root 取得 fiber”的内部 helper，但共享代码不能引入 CLI 副作用或改变现有输出结构。

## 验证命令

实现完成后至少运行：

```bash
find .codex/skills/debug-responsive-gui/scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check
node --test .codex/skills/debug-responsive-gui/scripts/inspect-react.test.mjs .codex/skills/debug-responsive-gui/scripts/inspect-redux.test.mjs
/usr/bin/python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/debug-responsive-gui
```

如果要做真实页面验证，先按 `debug-responsive-gui` skill 打开当前 GUI，再运行 `inspect-redux.mjs`。
