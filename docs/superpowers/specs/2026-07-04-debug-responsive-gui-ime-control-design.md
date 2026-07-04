# debug-responsive-gui IME Control 设计

## 背景

`docs/superpowers/issues/2026-06-30-03-codex-gui-ime-enter-submits-draft.md` 记录了 Codex GUI composer 在真实 macOS 中文输入法下的 Enter 时序问题。现有 browser test 可以模拟 composition/key 事件，但不能覆盖真实系统输入法、候选栏窗口、候选选择和浏览器实际事件顺序。

2026-07-04 的本机调研确认：

- macOS 简体拼音候选栏不是 Chrome DOM，也不是普通 Chrome 页面截图能表达的内容。
- 候选栏会作为 `Google Chrome for Testing` 的独立窗口暴露在 `CGWindowListCopyWindowInfo` 和 Accessibility AX 树中。
- `screencapture -x -o -l <windowId>` 可以直接截候选栏窗口，并去掉阴影。
- AX 树能读取候选栏结构：候选项是 `AXButton`，候选文本在 `AXTitle` / `AXDescription`。
- AX 不暴露视觉序号 `1 2 3`；数字选择序号只能由当前可见候选项顺序推导。

Apple 官方简体拼音文档说明：输入拼音码后会打开候选窗口，数字键可选择候选，箭头键可在候选间移动，空格通常选择当前候选。参考：<https://support.apple.com/zh-cn/guide/chinese-input-method/cimpys11836/104/mac/26>。

## 目标

在 `.codex/skills/debug-responsive-gui/scripts/` 下新增一个面向代理的单步 IME 控制器，用于真实 Chrome for Testing + macOS 简体拼音输入法调试。

第一版目标：

- 让代理可以重复执行单步动作，而不是一次性运行完整场景。
- 每步动作后默认采集候选栏结构、候选栏截图、textarea 状态和 DOM 事件日志。
- 保持浏览器焦点和 IME 状态，让代理根据最新观测决定下一步。
- 支持真实输入法输入路径，不通过直接设置 textarea value 绕过 IME。
- 支持后续验证 IME Enter guard bug 所需的输入、候选展开、数字选择、空格确认和 Enter 确认/发送路径。

## 非目标

- 不在第一版实现完整 regression runner。
- 不在第一版自动判定 pass/fail。
- 不把候选序号当稳定事实。
- 不假设相同拼音在多次运行中候选顺序稳定。
- 不用 OCR 作为主要读取方式。
- 不依赖 Chrome app-state screenshot 判断输入法候选栏。
- 不支持 Safari。
- 不支持 Apple 文档中的完整候选控制键集合，例如 `Tab`、`Option-Tab`、`[`、`]`、`-`、`=`。

## 脚本位置

新增脚本：

```text
.codex/skills/debug-responsive-gui/scripts/ime-control.mjs
```

这是 `debug-responsive-gui` 的调试能力，不属于 Codex GUI 产品代码，也不放入普通 repo 工具目录。

## 调用模型

采用显式 session + 单步动作模型。

示例：

```bash
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs start
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs type nihao --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key arrow-down --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key digit-3 --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs key enter --session <session-id>
node .codex/skills/debug-responsive-gui/scripts/ime-control.mjs capture --session <session-id>
```

每次命令只做一个动作。代理读取该动作后的结构化结果，再决定下一步。

## Session 设计

`start` 创建显式 session：

```text
/tmp/codex-ime-control/<session-id>/
  metadata.json
  events.jsonl
  actions.jsonl
  latest-candidate.json
  captures/
    0001-candidate.json
    0001-candidate.png
    0002-candidate.json
    0002-candidate.png
```

不默认使用 latest session。后续命令必须显式传 `--session <session-id>`，避免误接旧状态。

`start` 负责：

- 创建 session 目录。
- 确认 `playwright-cli` 能连接当前 `Google Chrome for Testing`。
- 确认当前页面有 `textarea[placeholder="Message Codex"]`。
- 聚焦 textarea。
- 默认清空 textarea。
- 注入页面内 DOM 事件 logger。
- 写入 `metadata.json`。

`start --preserve` 保留当前 textarea 内容，但仍聚焦输入框并注入 logger。

## 动作集

第一版支持：

```text
type <pinyin>
capture
key arrow-up
key arrow-down
key arrow-left
key arrow-right
key digit-1
key digit-2
key digit-3
key digit-4
key digit-5
key digit-6
key digit-7
key digit-8
key digit-9
key space
key enter
key escape
```

`type <pinyin>` 第一版只接受 `[a-z]+`，通过真实键盘事件逐字输入。数字、空格、回车和方向键必须走 `key` 动作。

`digit-N` 只表示按下数字 N，也就是选择当前候选栏第 N 项。它不表示固定候选词。代理必须先读取本次 `candidate.json`，确认当前第 N 项是什么，再决定是否按数字。

每个动作默认执行 capture。支持 `--no-capture` 显式跳过动作后的候选采集。

## Capture 设计

每次 capture 生成两个文件：

- `candidate.json`：主证据，代理默认读取它。
- `candidate.png`：备用视觉证据，默认不打开，只有 AX 可疑或需要视觉核实时查看。

无候选栏不是失败。候选栏关闭时，capture 成功并写入：

```json
{
  "present": false,
  "window": null,
  "mode": "none",
  "candidates": [],
  "screenshot": null
}
```

有候选栏时，`candidate.json` 包含：

```json
{
  "present": true,
  "window": {
    "id": 4332,
    "frame": { "x": -1636, "y": 763, "width": 397, "height": 182 }
  },
  "mode": "expanded",
  "candidates": [
    {
      "index": 1,
      "text": "你好",
      "visible": true,
      "frame": { "x": -1636, "y": 763, "width": 61, "height": 28 }
    }
  ],
  "textarea": {
    "value": "nihao",
    "focused": true,
    "selectionStart": 5,
    "selectionEnd": 5
  },
  "notes": [
    "index is inferred from visible candidate order, not exposed by AX"
  ]
}
```

候选顺序由当前 AX 可见候选项推导：

- 过滤无文本候选。
- 过滤不可见或无效 frame，例如 `width=0` / `height=0`。
- 按 `Y` 再按 `X` 排序。
- 生成当前可操作的 `index`。

紧凑候选条和展开候选列表都走同一套 AX 读取逻辑。`arrow-down` 可把默认单行候选条展开成多行列表，用于第一屏没有目标字的情况。

## DOM 事件日志

`start` 在页面内注入 `window.__codexImeControl`，监听目标 textarea 的真实事件：

```text
compositionstart
compositionupdate
compositionend
keydown
keyup
beforeinput
input
change
```

每条事件至少记录：

```json
{
  "type": "keydown",
  "key": "Enter",
  "code": "Enter",
  "isComposing": false,
  "inputType": null,
  "data": null,
  "value": "你好",
  "timeStamp": 12345.6,
  "performanceNow": 12345.7,
  "defaultPrevented": false
}
```

每次动作也写入 `actions.jsonl`，用于把脚本动作和浏览器事件对齐：

```json
{
  "type": "ime-control-action",
  "action": "key",
  "key": "enter",
  "at": 12345.7
}
```

每个命令结束时，脚本从页面 logger 拉取新增事件并追加到 `events.jsonl`。

如果页面刷新或 logger 丢失，命令失败，要求重新 `start`。不要自动重注入，因为这会制造证据链断点。

## 候选动态性约束

macOS 输入法候选顺序是动态状态。每一次输入、选择、删除、确认都可能改变下一次候选顺序。

因此：

- 不写死“第 1 项就是某个词”。
- 不把一次截图里的候选顺序复用到下一次测试。
- 每个动作后都重新 capture。
- 数字键只表达当前候选栏第 N 项。
- 测试记录必须保存当次 `candidate.json` 和 PNG，作为当时第 N 项含义的证据。

## 验收标准

- `start` 能创建 session、聚焦 Codex GUI textarea、默认清空输入框、注入 logger。
- `type nihao` 后保持候选栏可见，并生成 `candidate.json` / `candidate.png`。
- `candidate.json` 能读取候选项文本，例如 `你好`、`👋`、`你好吗`。
- `key arrow-down` 后候选栏展开，后续 capture 能读取多行候选结构。
- `key digit-N`、`key space`、`key enter`、方向键和 `escape` 通过真实键盘事件发送。
- 无候选栏 capture 成功并写入 `present: false`。
- 每步动作后的 DOM 事件能追加到 session `events.jsonl`。
- logger 丢失时命令失败，而不是默默重建。

## 风险

- AX 候选结构依赖 macOS Accessibility 权限和当前输入法实现；如果权限或系统版本变化，脚本应输出明确失败信息。
- AX 不暴露视觉序号和稳定选中态；数字 index 只能由当前布局推导。
- 候选栏 owner 当前表现为 `Google Chrome for Testing`，但这可能受浏览器或系统版本影响；候选窗口识别应同时参考 bounds、layer、AX role 和候选 AX children。
- 真实输入法状态会学习用户选择，候选顺序可能跨 session 变化。自动化只能记录当次状态，不能保证跨次顺序一致。
