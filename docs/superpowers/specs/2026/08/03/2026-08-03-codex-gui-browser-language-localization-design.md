# Codex GUI 浏览器语言自动本地化设计

日期：2026-08-03

状态：已确认

设计分支：`dev`

设计时 HEAD：`7c3d051b3773ef08b73f995ca50f41b704f9df73`

关联文档：

- 历史版本：`docs/superpowers/specs/2026/07/27/2026-07-27-codex-gui-simplified-chinese-settings-design.md`
- 历史计划：`docs/superpowers/plans/2026-07-27-codex-gui-simplified-chinese-settings.md`

## 唯一主目标

在重构后的 `codex-gui` 中，仅根据 GUI 启动时的浏览器语言自动选择 English 或简体中文，
完整本地化当前项目自己拥有的 production GUI 固定文案，同时不提供语言配置，不翻译动态内容，
也不接管第三方组件内部文案。

## 为什么必须新建设计

2026-07-27 的设计同时包含语言偏好、运行期切换、独立设置页、持久路由布局、聊天草稿与滚动恢复，
并建立在当时的 transcript 与 app runtime 形状上。相关 production 实现后来已经回退，当前 GUI 又完成了
大范围重构，因此旧设计不能作为当前实现蓝图继续执行。

本文件取代 2026-07-27 的旧设计及其历史计划；旧计划不得继续执行。后续 implementation plan 必须以
本文件确认后的目标、owner 和 seam 为唯一设计依据。

当前代码已经保留一套更小的 Lingui 骨架：

- `src/main.tsx` 在首次 React render 前创建 i18n、解析 locale、动态加载 catalog，再挂载
  `I18nProvider`；
- `lingui.config.ts`、Vite macro 转换、Lingui ESLint 规则以及 `en` / `zh-CN` catalog 已存在；
- `package.json` 已直接依赖 Lingui runtime、macro、CLI 与 Vite plugin，不需要新增 i18n 依赖；
- 当前 catalog 只有未进入 production 的 `LanguageSwitcher`、`PluralExample`、`MsgExample` 示例文案；
- 当前 `src/i18n.ts` 仍先读取 `localStorage`，并暴露 `saveLocale`，这与“只自动读取浏览器语言”冲突；
- 重构后的协作活动固定英文在 `transcriptStateSelectors.ts` 中提前物化为 `title` / `details`，若直接
  在 selector 中读取 locale，就会把翻译运行时引入 Redux selector 与稳定 view cache。

所以本设计不恢复旧 locale runtime，不恢复设置页，也不新建第二套本地化架构。它只收敛现有启动 seam，
删除配置语义，并在当前 presentation/render seam 上补齐项目 GUI 文案。

## 已确认的产品决策

1. 只支持 `en` 与 `zh-CN`，不增加繁体中文或其他 locale。
2. GUI 每次启动时读取浏览器语言；GUI 已打开期间不监听 `languagechange`。
3. 浏览器语言改变后，在下一次刷新或重新打开 GUI 时生效。
4. `zh-CN`、`zh-SG`、显式 `Hans` 和解析为 `Hans` 的中文 tag 使用简体中文。
5. `zh-TW`、`zh-HK`、`zh-MO`、显式 `Hant` 和解析为 `Hant` 的中文 tag 使用 English。
6. 不支持的浏览器语言最终回退 English。
7. 不提供设置页、语言选择器、手动切换、偏好持久化或后端配置。
8. 本地化所有 production 可达、由 `codex-gui` 明确拥有的固定 GUI 文案，包括可见文案、状态映射、
   错误外层标题、placeholder、tooltip、项目传入的 accessibility label、transcript 状态和协作活动模板。
9. 用户输入、模型回复、工具输出、prompt、thread/turn ID、agent path、model、reasoning effort、命令、
   URL、服务端错误详情和协议诊断保持原文。
10. HeroUI、Streamdown 和其他第三方组件自行生成的内部文案不纳入本设计；项目显式传给第三方组件的
    children、label、description、placeholder 和 `aria-label` 仍属于项目 GUI 文案。
11. 中文使用简洁自然的产品语言；`Codex`、命令、协议字段和技术标识保持原文。
12. 保留 2026-07-27 文档作为历史，本文件按当前代码重新定义 owner、seam、范围和验证。

## 目标

- 保留首次 render 前完成 locale 解析、catalog 加载、激活和 `<html lang>` 同步的启动顺序。
- 用一个小 interface 隐藏浏览器 locale 规范化、简繁判断、English fallback 和 catalog 加载。
- 删除当前 i18n scaffold 中的语言配置与 demo 语义，不留下未挂载的切换路径。
- 将 production GUI 自有固定文案接入 Lingui，并让 English 与简体中文 catalog 完整覆盖。
- 在 React 渲染 seam 翻译固定产品语义，不把 locale 或已翻译字符串写入 Redux transcript state。
- 保持现有 transcript identity、revision、selector cache、chunk 和折叠时不挂载隐藏 entry 的性能约束。
- 通过 locale resolver、production 渲染和 catalog 检查证明两种语言与排除边界。

## 非目标

- 不新增 `/settings` 或任何设置入口；
- 不显示语言菜单，不读写 `localStorage`，不保存 locale preference；
- 不监听运行期 `languagechange`，不做 catalog 请求 generation 或切换竞态管理；
- 不新增 locale Redux slice、React locale runtime provider、context wrapper 或 router owner；
- 不翻译用户、模型、工具、服务器或协议产生的动态内容；
- 不翻译 Streamdown 的 copy/download/link warning/fullscreen 等内部控件；
- 不翻译 HeroUI 或浏览器原生控件自己生成、项目没有显式提供的内部文案；
- 不翻译开发期异常、日志、测试 fixture、`data-*` 值、generated contract 或 validator 报错；
- 不修改 Rust、app-server、GUI Host wire contract、generated TypeScript 或 runtime validators；
- 不新增 i18n 包，不更换 Lingui，不建立与 Lingui 并行的第二套 message 系统；
- 不创建或落盘 implementation plan，不修改 production 代码。

## 权威来源与所有权

### 浏览器语言

启动时唯一权威输入是浏览器提供的语言候选：

```ts
const browserLocales =
  navigator.languages.length > 0 ? navigator.languages : [navigator.language];
```

locale resolver 不读取 storage、URL、Redux、GUI Host 消息或 Codex 配置。浏览器候选只在启动时读取一次。

### 支持的 locale

`src/i18n.ts` 唯一拥有前端运行期 `AppLocale`：

```ts
type AppLocale = "en" | "zh-CN";
```

`lingui.config.ts` 继续以 `en` 为 `sourceLocale`，catalog 仍只有 `en` 与 `zh-CN`。实现不得再用带显示
label 的 `availableLocales` 模拟可配置选项，因为本设计没有选择器消费者。

### GUI 文案

文案是否进入 catalog 由“谁拥有固定语义”决定，而不是由字符串位于哪个 React module 决定：

- 项目代码明确写出的固定产品含义由 `codex-gui` 拥有；
- authoritative protocol、服务端、用户、模型、工具和 URL 提供的值由其来源拥有；
- 项目将固定模板与动态值组合时，只翻译固定模板，动态值原样插入；
- 第三方 module 自行生成的内部控件文案由第三方拥有，当前项目不接管。

### 协议与 state

生成的 `@codex-protocol/v2` 类型仍是 transcript 输入的唯一权威来源。locale 不进入 projection ingress、
`transcriptItemPolicy`、Redux action、stored entry identity 或 history。现有 mechanically derived 类型继续
直接依赖 generated contract，不手写 locale 专用 wire DTO、validator 或 compatibility adapter。

## Deep module seam

本地化继续使用现有启动与渲染链：

```text
browser navigator
  → main.tsx
  → i18n.ts
  → Lingui catalog
  → I18nProvider
  → production React renderers
```

### `main.tsx`：启动编排 owner

`main.tsx` 保持唯一 React root 和 provider 组合 owner。顺序不变：

1. 创建 i18n 实例；
2. 取得浏览器语言候选；
3. 解析 `AppLocale`；
4. 动态加载并激活对应 catalog；
5. 同步 `<html lang>`；
6. 首次调用 `root.render`。

任何 route、`App`、Redux store 或 feature module 都不得重复解析初始 locale。先激活再 render 可避免首帧
English 闪烁、未加载 message 和 `<html lang>` 滞后。

### `i18n.ts`：locale module

`i18n.ts` 保留一个小 interface，概念形状为：

```ts
type AppLocale = "en" | "zh-CN";

function resolveBrowserLocale(browserLocales: readonly string[]): AppLocale;

async function loadCatalog(locale: AppLocale, i18n: I18n): Promise<void>;
```

具体导出名属于计划阶段的实现细节，但 interface 不应重新出现 preference、setter、storage、listener、
loading state 或 React provider。locale 解析是 in-process 纯计算，不需要额外 adapter；catalog loader 继续
是现有 Lingui 动态 import 的实现。

删除此 module 不会消除浏览器匹配和 catalog 加载复杂度，反而会把它们散回启动入口，因此该 module
具有足够 depth。新增 storage adapter、locale context 或 runtime manager 则只有一个实际实现，会形成
没有收益的 hypothetical seam。

## 浏览器 locale 解析

依次检查 `navigator.languages`；该数组为空时只检查 `navigator.language`。每个候选先用 `Intl.Locale`
规范化，非法 tag 只跳过当前候选，不能阻止 GUI 启动。

单个合法候选按以下优先级解析：

1. English language tag → `en`；
2. Chinese 显式 `Hans` → `zh-CN`；
3. Chinese 显式 `Hant` → `en`；
4. 未显式 script 且 region 为 `CN` / `SG` → `zh-CN`；
5. 未显式 script 且 region 为 `TW` / `HK` / `MO` → `en`；
6. 其他 Chinese tag 使用 `Intl.Locale.maximize()` 补全 likely script，`Hans` → `zh-CN`，
   `Hant` → `en`；
7. 其他 language tag → 继续检查下一个候选；
8. 全部候选均未匹配 → `en`。

显式 script 优先于 region，因此 `zh-Hant-CN` 使用 English，`zh-Hans-TW` 使用简体中文。命中明确
繁体候选后立即选择 English，不继续用低优先级候选把界面切成简体中文。裸 `zh` 通过 likely subtags
解析，通常得到 `Hans/CN`。

本设计不根据时区、操作系统、IP、页面 query、`Accept-Language` 请求头或 GUI Host 信息猜测语言。

## Catalog 加载与失败语义

`loadCatalog` 继续按 `AppLocale` 动态导入 `src/locales/{locale}.po`，使用 Lingui
`loadAndActivate` 激活，并把相同 locale 写入 `document.documentElement.lang`。

启动 catalog 加载失败时，保留当前的 terminal bootstrap failure：不渲染未加载或半加载的 GUI，
不静默回退到另一个 catalog，也不吞掉原始错误。浏览器语言不支持与 catalog 损坏是两类不同问题：
前者由 resolver 正常回退 English，后者必须继续暴露构建或运行错误。

由于本设计没有运行期切换，所以不需要保留上一个 active locale、loading UI、Toast、request generation
或迟到请求消解。

## Production 本地化范围

| 当前区域 | 需要本地化的项目固定语义 | 必须保持原文的动态或外部内容 |
| --- | --- | --- |
| `AppShell` | GUI 启动失败的外层标题 | `status.message` |
| Composer | composer label、placeholder、Send、Stop、发送/停止失败标题 | 用户草稿、提交文本、error description |
| QR access | 扫码入口、标题、不可用提示、二维码 accessibility label | QR URL、thread ID、token |
| Transcript shell | region label、Turn label、空状态、连接中断、Interrupted、Failed | turn ID、subscription reason、协议原值 |
| Intermediate updates | 标题、展开控件、基于 count 的 plural | count 数值 |
| 协作活动 | Started、Interacted、Waiting、Spawned、Resumed、Completed、Error 等固定模板与状态词 | receiver、agent path、prompt、model、reasoning effort、后端 message |
| Turn status | protocol `TurnStatus` 到用户可见词的穷尽映射 | Redux 中的 protocol enum 值 |
| 404 | 页面标题、说明、返回首页、联系支持 | URL、邮件地址 |
| HeroUI 使用点 | 项目传入的 label、description、placeholder、tooltip、`aria-label` | HeroUI 内部默认文案 |
| Markdown | 项目在 Markdown 外层提供的 GUI label | Markdown source、代码、链接、表格、Mermaid、Streamdown 内部控件 |

当前 `LanguageSwitcher.tsx`、`PluralExample.tsx` 和 `MsgExample.tsx` 未被 production 入口引用，不属于
需要翻译的 production GUI。它们分别承载已经取消的配置能力和 scaffold demo，应在后续计划中删除，
而不是继续把示例 msgid 保留在 production catalog。

## React 渲染 seam

一般 production 文案在 React render seam 处理：

- JSX children 使用 `Trans` macro；
- attribute、Toast、HeroUI props 和需要返回 string 的分支使用 macro 版本 `useLingui().t`；
- module-level 固定消息使用 `msg` descriptor，并在 React 中解析；
- count 相关文案使用 Lingui plural，不手写 English 单复数拼接；
- 动态值使用有名称的插值变量，不把 prompt、ID、path、model 或错误详情做成 msgid；
- 不从非 React state owner 读取当前 locale，也不把翻译后的字符串 dispatch 到 Redux。

English msgid 是产品 source copy；`zh-CN` catalog 提供简洁自然的中文翻译。测试定位应优先使用 role、
accessible name、稳定 test id 或结构，不把 English 文案当成跨 locale 的唯一 locator。

## Transcript activity 本地化

### 当前缺口

当前 `TranscriptCollabAgentStoredEntry` 和 `TranscriptSubAgentActivityStoredEntry` 已经保存 typed semantic
data，符合当前 transcript owner；但 selector 又把它们提前物化为 English `title: string` 与
`details: string[]`。这使 renderer 无法区分固定模板与动态内容。

把 `useLingui` 放入 selector 不可行：selector 不是 React render seam，locale 会污染 stable view cache，
并迫使 locale 改变时重算 transcript 数据。把最终中文写进 stored entry 更不可行，因为会把 locale 写进
Redux history，并破坏当前 identity/revision/chunk 不变量。

### 最小缺失机制

保持当前 stored entry、policy、identity 和 selector owner 不变，只把 renderer-facing activity view 从
最终字符串收窄为 typed presentation semantics。概念形状为：

```ts
type TranscriptActivityCopy =
  | { kind: "agentStarted"; agentPath: string }
  | { kind: "agentInteracted"; agentPath: string }
  | { kind: "agentInterrupted"; agentPath: string }
  | { kind: "agentSpawnFailed" }
  | {
      kind: "agentSpawned";
      receiver: string;
      model: string | null;
      reasoningEffort: string | null;
    }
  | { kind: "inputSent"; receiver: string }
  | { kind: "agentResuming"; receiver: string }
  | { kind: "agentResumed"; receiver: string }
  | { kind: "agentsWaiting"; receiver: string | null; receiverCount: number }
  | { kind: "agentsFinishedWaiting" }
  | { kind: "agentClosed"; receiver: string }
  | {
      kind: "agentState";
      threadId: string | null;
      status: TranscriptCollabAgentState["status"];
      message: string | null;
    }
  | { kind: "omitted"; count: number };

type TranscriptActivityDetail =
  | { kind: "raw"; text: string }
  | { kind: "copy"; copy: TranscriptActivityCopy };
```

精确 variant 和字段名属于计划阶段，但最终 interface 必须保持：

- 固定产品语义由穷尽 union 表达，不用自由 string key 或任意 params record；
- 动态原值作为 typed 字段或 `raw` detail 保留，不进入 msgid；
- selector 继续从现有 stored entry 派生并缓存 stable view，不读取 locale；
- renderer 在唯一穷尽 switch 中把 semantic copy 翻译为最终 title/details；
- 同一 semantic view 分别在 `en` 与 `zh-CN` render context 中形成对应文案，不改变 entry identity、
  revision、chunk 或 selector result；
- prompt preview 和服务端 message 继续使用当前已有的清理、截断和上限，不因本地化扩张；
- 不保存完整原始 `ThreadItem`，不复制 generated protocol contract；
- 不新增 activity 专属 store、selector sequence、cache 或第二条 renderer 路径。

turn status 和 transcript status 已经以 enum 保存，应直接在 renderer 中穷尽映射为 Lingui message；协议
enum 本身继续保留在 state。`Intermediate updates` 的 count 在 renderer 中交给 Lingui plural。

## 性能与状态不变量

- locale 不进入 Redux、projection ingress、stored entry、chunk revision 或 scroll state；
- 不因 locale 初始化遍历或重写 transcript history；
- `transcriptEntryViewCache` 与 `transcriptChunkViewCache` 继续按 entry/chunk identity 和 revision 缓存；
- 未变化 entry 和未受影响 chunk 继续保持 selector reference stability；
- 折叠后的 intermediate entries 继续不挂载，不为翻译预渲染隐藏 transcript；
- Markdown source 与 streaming delta 不经过 Lingui，不增加 hot-path 文本处理；
- `I18nProvider` 继续包住现有 Redux 与 router，但 locale 初始化不重建 store、router、WebSocket 或
  projection coordinator；
- 不为两种固定启动 locale 引入运行期订阅、event bus 或 locale state machine。

## Scaffold 收敛

后续实现应删除而不是兼容以下残留：

- `localeStorageKey`；
- `saveLocale`；
- storage-first 的 `resolveInitialLocale` 分支；
- `availableLocales` 中只服务选择器的显示 label；
- 未挂载的 `LanguageSwitcher.tsx`；
- 未挂载的 `PluralExample.tsx` 与 `MsgExample.tsx`；
- catalog 中只由这些 demo 产生的 msgid。

最终只保留一个 locale 决策来源和一条 catalog 激活路径。不得保留 storage fallback、旧新 resolver 双读、
隐藏切换器、兼容 adapter 或手工 catalog 条目。

## 验证设计

验证只覆盖稳定、用户可感知的本地化约束，不锁定具体组件内部实现值。

### Locale resolver

纯单元测试覆盖：

- `en`、`en-US`；
- `zh-CN`、`zh-SG`、`zh-Hans`、裸 `zh`；
- `zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant`；
- script 优先于 region 的 `zh-Hant-CN` 与 `zh-Hans-TW`；
- 非法 locale tag；
- 多候选顺序、空 `navigator.languages` 和全部不支持时的 English fallback。

### Production render

Browser Mode 或现有 React test provider 分别激活 `en` 与 `zh-CN` catalog，验证：

- AppShell、Composer、QR、Transcript、协作活动和 404 的代表性 production 文案；
- accessibility name、placeholder、Toast 标题与 plural；
- turn/status/activity 固定模板在分别激活 `en` 与 `zh-CN` 的测试环境中形成对应文案；
- thread ID、agent path、prompt、model、reasoning effort、用户/模型内容和服务端错误详情逐字不变；
- 两种测试 locale 复用同一 semantic selector view，翻译渲染不修改其 identity；
- 折叠的 intermediate entries 仍不挂载。

### Bootstrap 与 catalog

- 证明 catalog 激活发生在首次 React render 前；
- 证明 `<html lang>` 与 active locale 一致；
- 证明 locale 选择不读取或写入 `localStorage`；
- 使用现有 `messages:extract:clean` 流程从 production source 提取 catalog；
- 检查 `zh-CN` 无缺失翻译、demo msgid 已清除且无手写孤儿条目；
- 运行现有 format、lint、type-check、unit、Browser Mode 和 frontend build 范围；
- 不运行 Rust、app-server 或其他后端构建与测试。

## 预期影响范围

设计预计涉及以下现有 owner；精确任务拆分属于后续 implementation plan：

- 启动与 locale：`codex-gui/src/main.tsx`、`codex-gui/src/i18n.ts`；
- catalog：`codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`；
- scaffold 删除：`LanguageSwitcher.tsx`、`PluralExample.tsx`、`MsgExample.tsx`；
- AppShell、Composer、QR access、404 等当前 production renderers；
- transcript semantic view：`transcriptStateModel.ts`、`transcriptStateSelectors.ts`；
- transcript translation render：`CommittedTranscriptSurface.tsx`；
- 对应 unit、Browser Mode、test provider 与 catalog 检查。

`package.json` 中现有 Lingui 依赖、`lingui.config.ts` 的两种 locale、Vite plugin 和 ESLint plugin 已满足
本设计，不预期新增 dependency 或第二套 build integration。若计划阶段发现当前代码证据发生变化，必须按
新 HEAD 重新核验 owner，而不是恢复旧设计的 `LocaleRuntimeProvider`、settings route 或 app runtime layout。
