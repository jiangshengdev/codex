# debug-responsive-gui React Inspector 设计

## 背景

`debug-responsive-gui` 已负责通过可见 Google Chrome for Testing 和 `playwright-cli` 调试 Codex GUI。现在需要在该 skill 内沉淀一个纯 React inspector，用于自动读取当前页面的 React fiber tree，并输出稳定 JSON，便于继续调试和落盘。

该设计只覆盖 React inspector。Redux 调试可以作为后续独立能力设计，不混入本脚本。

## 目标

- 在现有 `debug-responsive-gui` skill 下新增 React inspector 脚本。
- 复用当前 `playwright-cli` 控制的页面。
- 从 `#root.__reactContainer$...` 读取 React root fiber。
- 遍历 React fiber tree，输出浅层组件树和可定位的组件摘要。
- 默认输出纯 JSON，成功和失败都可被后续自动化解析。

## 非目标

- 不启动、导航或关闭浏览器。
- 不修改系统 Chrome、浏览器 profile 或插件。
- 不写入 `/tmp/codex-debug-responsive-gui/current.json`。
- 不读取 Redux store、不调用 `store.getState()`，也不把 Redux DevTools 逻辑放进该脚本。
- 不实现通用 React DevTools 替代品。

## 文件范围

新增脚本：

```text
.codex/skills/debug-responsive-gui/scripts/inspect-react.mjs
```

更新 skill 入口说明：

```text
.codex/skills/debug-responsive-gui/SKILL.md
```

`SKILL.md` 只记录调用入口、参数、输出为 JSON，以及该脚本当前只负责 React inspection。实现细节保留在脚本中，避免文档膨胀和漂移。

## 命令接口

默认读取当前页面，输出浅层 React tree：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs
```

控制输出深度：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --max-depth 4
```

按组件名继续深入：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --max-depth 4
```

按树路径精确定位：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --path 0.1.3 --max-depth 4
```

显式包含受限浅层值：

```bash
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --component AppShell --include-values
```

## 参数设计

- `--max-depth <number>`：控制输出树深度，默认 `4`。
- `--component <name>`：按组件名匹配，可重复传入。
- `--path <index.path>`：按输出树路径定位某个节点。
- `--include-values`：默认关闭；打开后输出受限的浅层 `props` / `state` 值。

默认不内置 codex-gui 组件名。脚本先做通用浅层发现；如果需要继续深入，由调用方使用 `--component` 或 `--path` 再次调用。

## React 入口

脚本在页面主上下文执行读取逻辑：

1. 查找 `document.querySelector('#root')`。
2. 从 root element 的 own property 中查找 `__reactContainer$...`。
3. 使用 `rootEl[rootKey]?.current ?? rootEl[rootKey]` 获得 root fiber。
4. 遍历 fiber 的 `child` 和 `sibling` 链。

`window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 只用于输出 hook 是否存在和 renderer 数量，不作为 fiber root 的主要入口。

## 输出结构

stdout 只输出 JSON。成功示例：

```json
{
  "ok": true,
  "reactHook": { "exists": true, "rendererCount": 0 },
  "root": { "containerKey": "__reactContainer$...", "tagName": "HostRoot" },
  "counts": { "visitedFibers": 3956 },
  "tree": [],
  "matches": [],
  "errors": []
}
```

失败也输出 JSON，并以非 0 状态退出：

```json
{
  "ok": false,
  "errors": [
    {
      "code": "react_root_not_found",
      "message": "Could not find #root.__reactContainer$..."
    }
  ],
  "reactHook": { "exists": true, "rendererCount": 0 },
  "root": null,
  "counts": { "visitedFibers": 0 },
  "tree": [],
  "matches": []
}
```

崩溃级异常可以写 stderr，但正常可恢复失败必须保持 JSON 输出。

## Fiber 摘要

每个 fiber 节点摘要包含：

```json
{
  "path": "0.1.3",
  "tag": 0,
  "tagName": "FunctionComponent",
  "name": "AppShell",
  "key": null,
  "depth": 3,
  "propsKeys": ["children"],
  "stateKeys": [],
  "hookCount": 3
}
```

组件名解析顺序：

1. `fiber.type.displayName`
2. `fiber.type.name`
3. `fiber.elementType.displayName`
4. `fiber.elementType.name`
5. host string type
6. React fiber tag 名称

`stateKeys` 只来自可命名的 object state。函数组件 hook 链表只统计 `hookCount`，不把 hook state 伪装成稳定字段名。

## 值展开边界

默认不输出 props/state 值，只输出 keys 和 hook count。

传入 `--include-values` 后，输出 JSON-safe 的浅层值，并固定硬限制：

- object depth: `2`
- array items: `10`
- object keys: `20`
- string length: `200`

函数、DOM 节点、React element、循环引用和超限对象只输出摘要字符串。

## 验证

实现完成后验证：

```bash
node --check .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs
python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/debug-responsive-gui
node .codex/skills/debug-responsive-gui/scripts/inspect-react.mjs --max-depth 4
```

如果当前没有可用的 `playwright-cli` 页面，运行验证应返回结构化 JSON 错误，而不是自动启动或导航浏览器。
