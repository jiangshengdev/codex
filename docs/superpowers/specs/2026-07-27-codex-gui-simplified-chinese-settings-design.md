# Codex GUI 简体中文与设置页面设计

日期：2026-07-27
状态：已确认

## 唯一主目标

为 Codex GUI 的完整简体中文本地化与独立设置页面建立可实施设计，落实已确认的语言偏好、固定路由、持久连接、聊天状态恢复和生产界面翻译边界，同时不提前实现多聊天。

## 背景与当前状态

`codex-gui` 已具备部分 Lingui 基础设施：

- `lingui.config.ts` 已声明 `en` 与 `zh-CN`，英文是 source locale；
- Vite 已启用 Lingui macro transform；
- `main.tsx` 在首屏渲染前加载 catalog，并用 `I18nProvider` 包裹 Redux 与 Router；
- `i18n.ts` 已能动态加载 catalog、读取浏览器语言、保存用户选择并更新 `<html lang>`；
- `LanguageSwitcher.tsx`、`MsgExample.tsx`、`PluralExample.tsx` 和两份 catalog 证明提取链路可用。

现状仍不构成 production 本地化：

- `LanguageSwitcher` 没有 production consumer，且使用普通 `Select`；
- `zh-CN.po` 只覆盖示例和未挂载切换器；
- Composer、QR、AppShell、transcript、404 和 Streamdown 控件仍显示英文固定文案；
- 当前 locale 状态只能表达 `en | zh-CN`，不能表达“跟随系统”；
- 当前所有 `zh-*` 都会映射成 `zh-CN`，不符合已确认的繁简体匹配规则；
- `GuiHostConnectionBridge` 挂在 `/` 页面内部，新增 `/settings` 后若直接切换子页面会触发 cleanup、关闭 WebSocket 并停止 projection 协调；
- Composer 草稿与 document 滚动置底状态位于聊天页面本地，页面卸载后无法恢复；
- transcript 协作活动在投影阶段已经物化为英文 `title/details` 并存入 Redux，切换 locale 后既有历史不会自动重译。

因此，本设计不是给若干 JSX 字符串加翻译宏，而是同时建立 locale 生命周期、持久运行时布局、确定性页面导航、最小聊天 UI 会话状态和渲染期本地化 seam。

## 已确认的产品决策

1. 覆盖全部 production 界面，包括可见文案、状态映射、错误包装、placeholder、tooltip 和无障碍标签。
2. 模型回复、用户输入、工具输出、prompt 预览、thread ID、agent path、模型名、reasoning effort、命令、服务端错误与协议诊断保持原文。
3. 保留英文与简体中文；首次使用跟随系统，用户明确选择后在当前浏览器/设备的 `localStorage` 中保存。
4. 中文采用简洁自然的产品语言，`Codex`、命令和技术标识不翻译。
5. 新增独立 `/settings` 页面；设置入口位于 Composer 操作栏，与扫码入口并列。
6. 设置页只交付语言设置，不显示分类导航，不增加外观等无关设置；结构允许以后增加分类。
7. 设置页不展示后台对话状态；WebSocket 与 Redux 在后台继续工作。
8. 设置页使用 HeroUI v3 `Autocomplete` 搜索和选择语言，选择立即生效并自动保存，不提供单独“保存”按钮。
9. 选项为“跟随系统、English、简体中文”；语言名称同时显示当前界面语言名称和语言自称，以 ` · ` 分隔，相同名称只显示一次。
10. 跟随系统模式监听运行期 `languagechange`；不支持的系统语言回退 English。
11. `zh-CN`、`zh-SG`、`zh-Hans` 使用简体中文；`zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant` 不强制使用简体中文，回退 English。
12. 聊天页与设置页使用固定 pathname：设置为 `/settings`，聊天为 `/`；只改变 pathname，原样保留 search，不恢复 hash token。
13. 进入设置与页面内返回都使用 `replace`；应用导航不依赖浏览器历史，也不产生重复聊天历史项。
14. 返回聊天页后恢复未发送草稿和原阅读位置；离开前位于底部时，返回后仍显示最新消息。
15. 不使用整页 KeepAlive 或 React `Activity`；不保留隐藏的长 transcript DOM。
16. 本次只建立未来多聊天可复用的根布局与导航 seam，不新增 `/threads/$threadId`、多线程 store 或聊天列表。

## 目标

- 建立一个持久的应用运行时布局，让 `/` 与 `/settings` 共享同一 GUI Host 连接和 projection 协调器。
- 建立一个深的 locale runtime module，用小 interface 隐藏系统匹配、catalog 异步加载、竞争消解、持久化和 `languagechange`。
- 建立确定性的主界面导航 seam，集中拥有固定 pathname、search 保留、hash 清除和双向 replace 规则。
- 建立最小聊天 UI 会话状态，只保存草稿与滚动恢复所需事实，不缓存整棵页面。
- 将所有前端拥有的 production 固定文案接入 Lingui，并让运行期切换立即更新已经存在的 UI。
- 将 transcript activity 从“已物化英文字符串”改为“可在渲染期翻译的前端语义”，同时保留原始动态数据和 chunk 性能边界。
- 使用 Streamdown 已提供的 `translations` interface 覆盖复制、下载、链接等 Markdown 控件文案。
- 通过 Browser Mode、单元测试、catalog 提取和静态检查证明两种语言、路由生命周期、后台更新与状态恢复行为。

## 非目标

- 不新增繁体中文或其他 locale。
- 不翻译模型、用户、工具、服务端或协议产生的动态内容。
- 不修改 Rust、app-server、GUI Host wire contract、generated protocol 或 runtime validators。
- 不把语言偏好写入 Codex 后端配置，也不跨设备同步。
- 不实现多聊天、聊天列表、`/threads/$threadId`、多线程订阅或按 thread ID 键控的完整 store。
- 不引入 KeepAlive 包、React `Activity` 页面缓存或隐藏 transcript DOM。
- 不增加设置分类首页、侧栏、全局命令搜索或语言之外的设置项。
- 不依赖 `history.back()`、来源路由 state 或浏览器历史长度决定页面内返回目标。
- 不手写 catalog 生成物或绕过 Lingui 提取流程。
- 不在本设计阶段创建 implementation plan、修改 production 代码或更新历史审计报告状态。

## 总体架构

```text
I18nProvider
└── LocaleRuntimeProvider
    └── Redux Provider                         路由切换时持续存在
        └── RouterProvider
            └── pathless runtime route
                └── AppRuntimeLayout           持久共享布局
                    ├── Toast.Provider
                    ├── GuiHostConnectionBridge    WebSocket + projection coordinator
                    ├── AppRuntimeContext          status / commands / launchParams
                    ├── ChatUiSession              draft / scroll snapshot
                    └── Outlet
                        ├── /                      ChatPage -> AppShell
                        └── /settings              SettingsPage
```

持续存在的 owner 与页面 owner 必须分开：

- locale runtime、Redux store、GUI Host connection 和聊天 UI session 属于应用运行时；
- transcript DOM、Composer DOM 与设置页 DOM 属于当前路由页面；
- `/` 与 `/settings` 只替换 `<Outlet />` 内容，不重建应用运行时；
- 设置页期间 projection 事件继续进入 Redux，返回 `/` 后聊天页面读取最新 state。

## Deep module seams

### Locale runtime module

locale runtime 是本设计的主要深 module。调用方只应学习一个 React interface：

```ts
type LocalePreference = "system" | "en" | "zh-CN";
type AppLocale = "en" | "zh-CN";

type AppLocaleRuntime = {
  preference: LocalePreference;
  activeLocale: AppLocale;
  isChanging: boolean;
  setPreference(preference: LocalePreference): Promise<void>;
};
```

interface 不暴露 catalog import、storage key、`navigator.languages` 解析、请求代次、Lingui activation 或 `languagechange` listener。implementation 统一拥有：

- 启动时读取与校验 preference；
- 解析 system preference 对应的实际 locale；
- 异步加载 catalog，并只允许最后一次请求激活；
- 调用 `i18n.loadAndActivate`；
- 同步更新 `<html lang>`；
- 持久化 preference；
- 只在 system preference 下响应 `languagechange`；
- 把 catalog 或 storage 失败转换为可显示状态，而不是静默吞掉。

`I18nProvider` 仍是 Lingui runtime adapter；`LocaleRuntimeProvider` 是产品 locale 语义的 owner。组件不得自行读取 `localStorage`、`navigator.languages`、导入 catalog 或直接调用 `i18n.activate`。

### App runtime layout

`AppRuntimeLayout` 是连接生命周期 seam。它位于 root route 之下的无 pathname runtime layout route，提升当前 `App.tsx` 中的 `status`、`commands` 和 `launchParams`，长期挂载 `GuiHostConnectionBridge`，并把页面所需运行时能力通过窄 React Context 交给聊天 route。

这些值不进入 Redux：

- `commands` 是包含函数与失效语义的非序列化运行时句柄；
- `status` 与 `launchParams` 随单个 WebSocket lifecycle 变化；
- 设置页不消费这些值，不应因 context 更新而承担聊天渲染成本。

Redux 已位于 `RouterProvider` 外层，无需移动。`ProjectionApplicationCoordinator` 继续通过现有 dispatch interface 更新 thread runtime 与 transcript state。

Bridge 的 effect 不以 pathname 或 search 为依赖。它只在持久根布局挂载时消费当时的 browser launch URL；普通 `/` 与 `/settings` 切换不能触发 cleanup 或重连。

### Primary-surface navigation module

设置按钮和返回按钮不应各自重写 pathname/search/hash/history 规则。设计一个集中式 navigation module，对页面只暴露：

```ts
type PrimarySurfaceNavigation = {
  openSettings(): void;
  returnToChat(): void;
};
```

implementation 固定执行：

```text
openSettings: pathname = /settings, search = current search, hash = empty, replace = true
returnToChat: pathname = /,        search = current search, hash = empty, replace = true
```

该 interface 隐藏 TanStack Router 的具体 `navigate` options，并为未来把聊天目标演进到 `/threads/$threadId` 保留单一 seam。不得通过 `history.back()`、referrer、location state 或历史长度决定目标。

### Chat UI session module

聊天 route 正常卸载，因此需要一个位于持久布局中的小型 UI session。它只保存：

- 当前未发送 draft；
- 离开聊天页时是否处于 sticky bottom；
- 非置底时的 document scroll top；
- 当前 scroll snapshot 是否等待一次恢复。

它不保存 transcript entries、DOM、React element、IntersectionObserver、commands 或 WebSocket。Composer 改为受控消费 draft；聊天页在打开设置前捕获 scroll snapshot，在返回挂载后消费一次 snapshot。

恢复规则：

- 离开前置底：等待 transcript layout 后滚到最新底部，包括设置期间新增消息；
- 离开前浏览历史：恢复保存的 scroll top，不因新消息跳到底部；
- 恢复完成后清除 pending 标志，随后继续使用现有 sticky-bottom 逻辑。

这一 seam 将来可以从单份 session 演进为按 thread ID 键控，但本次不提前引入多聊天容器。

### Localization rendering seam

固定产品含义在 React 渲染边界翻译，动态内容保持原值：

- JSX 文案使用 `Trans`；
- attribute、toast、HeroUI props 和格式化函数使用 macro 版本 `useLingui().t`；
- module-level 固定消息使用 `msg` descriptor，并在 React 中解析；
- plural 使用 Lingui plural，而不是手写 `count === 1`；
- 不在 Redux reducer、projection ingress、协议 adapter 或 WebSocket handler 中读取当前 locale。

这样切换 locale 只改变渲染结果，不重写 transcript 历史，不触发 projection state 迁移，也不产生 cache miss 型全量 state 更新。

## Locale preference 与系统匹配

### Preference 与 active locale 分离

必须区分：

- `preference`：用户保存的 `system | en | zh-CN`；
- `activeLocale`：当前实际加载的 `en | zh-CN`。

选择 system 时保存 `system`，不能把当时解析出的 `zh-CN` 或 `en` 覆盖回 storage。这样系统语言后续变化仍可自动生效，设置页也能正确显示当前选中“跟随系统”。

现有 `codex-gui.locale` key 可继续使用。旧值 `en`、`zh-CN` 直接解释为明确 preference；缺失或无效值解释为 `system`，不需要额外 migration key。

### 系统 locale 解析

依次检查 `navigator.languages`，为空时使用 `navigator.language`。每个合法 tag 先用 `Intl.Locale` 规范化，并保留 tag 是否显式给出 script/region 的事实，再按以下优先级判断：

- English language tag -> `en`；
- Chinese 显式 `Hans` -> `zh-CN`；
- Chinese 显式 `Hant` -> 立即 `en`；
- Chinese 未显式给出 script 且 region 为 `CN` / `SG` -> `zh-CN`；
- Chinese 未显式给出 script 且 region 为 `TW` / `HK` / `MO` -> 立即 `en`；
- 其他 Chinese tag 使用 `Intl.Locale(...).maximize()` 补全 likely script：`Hans` -> `zh-CN`，`Hant` -> 立即 `en`；
- 其他 tag -> 继续检查；
- 全部未匹配 -> `en`。

显式 script 的优先级高于 region，因此 `zh-Hant-CN` 仍回退 English。命中繁体分支后不继续扫描后续候选，因此 `zh-TW` 不会因为后续还存在 `zh-CN` 而被切到简体中文。`Intl.Locale(...).maximize()` 让裸 `zh` 按平台 likely subtags 落入 `Hans/CN`。非法 tag 只排除该候选，不能使整个应用启动失败。

### 运行期变化与竞争

仅当 preference 为 system 时注册 `window.languagechange`。事件发生后重新解析系统 locale：

- 解析结果与 active locale 相同，不重复加载 catalog；
- 不同时启动新加载；
- 每次加载获得单调 request generation；
- 只有 generation 仍为最新时才能 activate、更新 `<html lang>` 和结束 loading；
- 迟到的旧 catalog 结果不得覆盖新选择。

明确 preference 不响应 `languagechange`。

### 失败语义

- catalog 加载失败：保留上一个 active locale 与 preference，设置页控件恢复可用；显示本地化错误标题，并原样附带底层错误 description。
- storage 写入失败：当前 locale 与内存 preference 仍生效，但显示“本次选择无法保存”的本地化 warning；不得静默宣称已持久化。
- storage 读取失败：以 system preference 启动，并在 UI 可用后显示本地化 warning；不得阻止 GUI 启动。
- 启动 catalog 加载失败：这是首屏无法形成有效 locale 的 terminal bootstrap failure，应保留可诊断的原始错误，而不是回退到未加载或半加载界面。

Toast host 移到持久根布局，使聊天页和设置页都能显示 locale warning/error。

## 路由与连接生命周期

### 路由树

```text
rootRoute                      只拥有全局 NotFoundPage
└── pathlessRuntimeRoute      component = AppRuntimeLayout
    ├── indexRoute            path = /
    └── settingsRoute         path = /settings
```

`NotFoundPage` 仍由最小 root route 的 not-found owner 管理，但进入完整本地化覆盖。未知路径不挂载 `AppRuntimeLayout`，因此不会仅因展示 404 就消费 browser launch URL、建立 GUI Host 连接或显示连接错误。

### URL 规则

示例：

```text
/?threadId=abc
  -- replace --> /settings?threadId=abc
  -- replace --> /?threadId=abc
```

- search 原样保留，包括当前 `threadId` 和以后新增的 launch-scoped query；
- hash 永远不复制，启动 token 继续只由现有 browser launch owner 消费并保存到 `sessionStorage`；
- 两个方向都 replace，设置页不进入浏览器历史，也不产生重复聊天项；
- 浏览器 back/系统返回手势不承担设置页返回职责；页面提供明确返回按钮。

### 切换与刷新

从聊天页进入设置时，根布局不卸载，因此：

- WebSocket instance 不变；
- commands handle 与 launch params 不变；
- ProjectionApplicationCoordinator 持续接收 event/delta 并 dispatch Redux；
- 正在进行的 turn 不停止；
- 设置页不渲染聊天状态或消息摘要；
- 返回 `/` 后 transcript 从最新 Redux snapshot 渲染设置期间新增内容。

刷新 `/settings?threadId=...` 会重建整个页面。现有 browser launch owner从 query 恢复 thread ID，并从当前标签页 `sessionStorage` 恢复 token，再建立新连接。首次直接打开带 fragment token 的 `/settings?...#token=...` 时，现有消费顺序仍先保存 token、保留 pathname/search 并清除 hash。

缺少 thread ID 或 token 时，现有连接入口仍在 WebSocket 创建前失败。设置页面本身不依赖成功连接，仍可修改语言；固定返回 `/` 后，聊天页展示同一原始启动错误及已本地化的错误包装标题。

## 设置页面

### 信息架构

当前只有语言设置，不显示空侧栏、分类 tabs 或二级路由。

```text
┌─────────────────────────────────────┐
│ ← 返回                              │
│                                     │
│ 设置                                │
│ 管理 Codex GUI 在此设备上的偏好。   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 语言                            │ │
│ │ 选择界面显示语言。              │ │
│ │                                 │ │
│ │ [ 跟随系统                  ▾ ] │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

页面使用：

- 语义化 `main` 与 `section`；
- HeroUI `Button variant="tertiary"` + `ArrowLeft`，同时显示图标和“返回”；
- HeroUI `Typography.Heading` 作为唯一 `h1`，`Typography.Paragraph color="muted"` 提供说明；
- HeroUI `Surface variant="default"` 承载语言 section；
- 背景与层级使用 `bg-background`、`text-foreground`、surface、separator、field 和 muted token，不新增硬编码主题色；
- 内容宽度沿用聊天页 `max-w-3xl`，但语言 field 自身限制到适合表单阅读的宽度；
- 窄屏单列、全宽 field；宽屏不人为铺满整行。

### 设置入口

Composer 左侧操作组保留扫码按钮，并新增：

- HeroUI `Button isIconOnly size="sm" variant="tertiary"`；
- `Settings` lucide icon；
- 本地化 `aria-label`；
- HeroUI `Tooltip`，内容与 accessible name 语义一致；
- 点击前捕获聊天 scroll snapshot，再调用 `openSettings()`。

入口不使用文字按钮，避免移动端挤压 Stop/Send 操作。

### Language Autocomplete

采用 HeroUI v3 compound interface：

```text
Autocomplete
├── Label
├── Autocomplete.Trigger
│   ├── Autocomplete.Value
│   └── Autocomplete.Indicator
└── Autocomplete.Popover
    └── Autocomplete.Filter
        ├── SearchField
        │   ├── SearchField.SearchIcon
        │   ├── SearchField.Input
        │   └── SearchField.ClearButton
        └── ListBox
            ├── ListBox.Item(system)
            ├── ListBox.Item(en)
            ├── ListBox.Item(zh-CN)
            └── EmptyState
```

约束：

- single selection、受控 `value`，选中值始终是有效 `LocalePreference`；
- 不渲染 `Autocomplete.ClearButton`，不能产生“没有语言 preference”；
- 位于 Surface 内使用 `variant="secondary"`；
- filter 使用 `useFilter({ sensitivity: "base" }).contains`；
- `SearchField autoFocus={false}`，打开 popover 时不主动唤起移动端键盘；
- Search placeholder、clear button accessible name、空结果提示全部本地化；
- 选择时立即调用 `setPreference`，加载期间禁用控件；
- 成功后关闭 popover并清空旧搜索文本，确保语言切换后不会保留另一语言的查询；
- ListBox item 显示选中 indicator，并保持完整键盘与读屏选择语义。

选项显示：

| 当前界面 | system | English | 简体中文 |
| --- | --- | --- | --- |
| English | Follow system | English | Simplified Chinese · 简体中文 |
| 简体中文 | 跟随系统 | 英语 · English | 简体中文 |

语言选项的 `textValue` 同时包含当前界面名称和自称，因此搜索两种名称都能命中；相同名称只出现一次。system 不是一种语言，只显示当前界面的本地化名称。

### 焦点与路由可访问性

- 打开设置后将焦点移动到页面 `h1` 或等价 route announcement target，不自动聚焦搜索输入；
- 返回聊天后将焦点恢复到设置入口按钮；若入口因页面重建尚不可用，则聚焦聊天 `main`；
- 返回按钮有可见文本，不能只依赖箭头图标；
- 动态 locale 切换后 Label、Value、ListBox textValue、placeholder、tooltip 和 accessible name 在同一 React 更新中改变；
- loading、warning 和 error 使用可被读屏感知的 Toast/Alert 语义，不用颜色单独表达。

## Production 本地化覆盖

| 区域 | 固定文案/语义 | 动态内容处理 |
| --- | --- | --- |
| 设置入口 | 设置 tooltip、`aria-label` | 无 |
| 设置页 | 返回、设置、页面说明、语言、field 说明、搜索、无结果、loading/error/warning | 底层 error 原文 |
| Composer | Message composer、Message Codex、Stop、Send、发送/停止失败标题 | 提交文本与 error description 原文 |
| QR | Scan with phone、不可用说明、QR accessible name | QR URL 原文 |
| AppShell | Unable to start Codex GUI | `status.message` 原文 |
| Transcript shell | region label、Turn、空状态、连接中断、Interrupted、Failed | turn ID 原文 |
| Turn 状态 | protocol `TurnStatus` 到本地化显示词的穷尽映射 | protocol 值仍保留在 state/data attribute |
| Intermediate updates | 标题与基于 count 的 plural | count 原值 |
| 协作活动 | Started/Interacted/Waiting/Completed/Error 等前端包装与状态词 | thread ID、agent path、prompt、model、effort、后端 message 原文 |
| 404 | Page not found、说明、返回首页、联系支持 | 邮件地址原文 |
| Streamdown 控件 | copy、copied、download、table、link warning、fullscreen 等 `StreamdownTranslations` 字段 | Markdown 内容、URL、代码、表格数据原文 |

`data-*` 属性、协议 enum、日志、异常对象、测试 fixture、generated contract 和机器可读文本不因本地化改变。

## Transcript activity 语义化

### 根因

当前 `TranscriptEntry.activity` 保存：

```ts
{
  type: "activity";
  title: string;
  details: string[];
}
```

这些 string 在 projection/materialization 阶段已经包含 `Started`、`Completed`、`Waiting for`、`Error` 等英文固定词。若在 materializer 中直接调用 Lingui，则：

- locale 被写进 Redux history；
- 切换语言不会改变既有 entry；
- 为重译而全量改写 history 会破坏 locality、增加 chunk revision 和渲染成本。

### 新显示语义

activity entry 应保存一个前端领域 discriminated union，而不是最终文案或原始 `ThreadItem`：

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
  | { kind: "agentStatus"; status: CollabAgentStatus; message: string | null };

type TranscriptActivityDetail =
  | { kind: "raw"; text: string }
  | { kind: "copy"; copy: TranscriptActivityCopy };
```

精确 variant 名称可以在 implementation plan 中收敛，但必须保持以下 interface 语义：

- 固定产品含义由穷尽 union 表达；
- 动态原始值显式作为字段保存，不进入 msgid；
- model 与 reasoning effort 分别保存原值，括号、空格和连接格式只在渲染期形成；
- prompt 和后端 message 继续按现有 grapheme 上限清理与截断；
- 不保存完整原始 `ThreadItem`，不复制 authoritative protocol DTO；
- 不用自由 string key、任意 params record 或 runtime locale 替代类型约束。

`TranscriptActivityCard` 在 React 边界穷尽翻译 union，并把原始字段插入 Lingui message。切换 locale 时，activity entry identity、revision、chunk 和 selector 结果保持不变，只有 Card 的文字随 i18n context 重渲染。

turn status、transcript status entry 已经保存语义 enum，应沿用同样原则在 render boundary 映射，不把本地化字符串写入 state。

## Streamdown 本地化

Streamdown 2.5 已提供 `translations?: Partial<StreamdownTranslations>`，覆盖 copy、download、table、link safety、fullscreen 等控件文案。设计不 fork Streamdown，也不覆写其内部按钮 DOM。

当前 `streamdownCommonProps` 是 module-level 常量，不能调用 React locale hook。保留其中安全、插件、controls 和 markdown parser 配置；把 translations 拆到渲染期：

- `MarkdownText` 与 `LiveMarkdownText` 从共享 hook/module 取得当前 `StreamdownTranslations`；
- 两者使用同一套 translations，防止 committed/live 行为漂移；
- translations object 按当前 `t` memoize，locale 不变时保持引用稳定；
- Markdown source 不参与翻译。

若 Streamdown 内部仍存在不受 `StreamdownTranslations` interface 控制的固定英文，本次不以 DOM patch、字符串替换或 fork 隐藏；应记录为上游组件缺口，并只在已有公开 component override 能保持行为与性能时处理。

## 性能与状态不变量

- 不把 locale 写入 Redux transcript state，不因语言切换遍历或重写 entries。
- transcript activity 继续使用现有 entry/chunk identity 与 revision；语义 union 不改变 chunk 上限、selector cache 或折叠时不挂载隐藏 entry 的行为。
- 不缓存 `/` 的完整 React tree，不保留隐藏 Markdown、Shiki、Mermaid 或长 transcript DOM。
- 设置页不订阅 transcript selectors、commands 或 host status。
- locale provider 只让消费翻译 context 的可见组件重渲染；不重建 Redux store、router、WebSocket 或 projection coordinator。
- Streamdown shared config 与 translations 均保持稳定引用，避免每次 delta 生成新 props。
- 草稿和 scroll snapshot 是有界状态；不得保存 transcript 内容副本。

## 测试与验收策略

### Locale module 单元测试

- storage 缺失、合法旧值、`system`、无效值与读写异常；
- `en-*`、`zh-CN`、`zh-SG`、`zh-Hans`、`zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant`、裸 `zh`、非法 tag 与不支持语言；
- system 与明确 preference 对 `languagechange` 的不同响应；
- 相同 active locale 不重复加载；
- 快速切换时迟到 catalog 不覆盖最新选择；
- catalog/storage 失败的可观察结果。

### Settings Browser Mode

- `/settings` 渲染返回、标题、说明、Language Autocomplete；
- 三个 preference 的显示、搜索、键盘选择、无结果与无 clear 状态；
- 中文/英文名称使用 ` · `，相同名称不重复；
- 切换后当前页面立即重译并持久化；重新渲染/刷新恢复 preference；
- system languagechange 即时切换，明确 preference 不切换；
- 移动端打开 popover 不自动聚焦搜索框；
- setting entry tooltip、ARIA、route focus 与返回 focus。

### 路由与运行时 Browser Mode

- `/` 与 `/settings` 双向 replace 不增加历史长度；
- pathname 固定切换，search 原样保留，hash 不恢复；
- Bridge 只启动一次，切换设置不调用 cleanup 或创建第二个 WebSocket；
- 设置期间 projection event/delta 继续更新 Redux；
- 返回后显示期间新增的消息；
- 草稿恢复；
- 离开前置底时返回最新底部，浏览历史时恢复原 scroll top；
- 刷新 `/settings?threadId=...` 使用 session token 重连；
- `/settings` 缺参仍显示设置，返回 `/` 后显示本地化 wrapper + 原始启动错误。

### Production 文案与 transcript

- 现有 AppShell、Composer、QR、transcript、activity、NotFound 浏览器测试增加英文与简体中文断言；
- activity 同一 Redux entry 在 locale 切换后立即重译，动态原始值保持不变；
- turn status 与 plural 使用完整对象/可见结果断言，不测试 Lingui 静态定义值本身；
- Streamdown 控件在两种 locale 下显示对应公开 translations；
- GUI 可见改动新增 Playwright screenshot baseline，并在三种 Browser Mode engine 中保留行为断言；当前 `codex-gui` 没有可复用的 `insta` snapshot harness，不把 TUI 的 Cargo snapshot 流程误套到前端。

### 项目验证

后续 implementation plan 应使用 live `package.json` 中已存在的命令，至少覆盖：

- Lingui clean extract；
- focused unit tests；
- focused Browser Mode tests；
- `type-check`；
- `lint`；
- `format:oxfmt`；
- production UI 的 Playwright screenshot review。

具体命令、文件顺序、任务拆分和提交边界属于后续计划，不在本设计中展开。

## 设计级文件影响边界

预计涉及的 owner/区域：

- `src/main.tsx` 与 `src/i18n.ts`：locale bootstrap/runtime；
- 新的 locale runtime provider/hook；
- `src/router.tsx`、新的 `AppRuntimeLayout`、运行时 context 与主界面 navigation module；
- `src/App.tsx` / chat route composition；
- `features/settings/**`：设置页面与 Language Autocomplete；
- `features/composerTurnControl/**`：受控 draft、设置入口与失败标题本地化；
- `features/appShell/**`：持久 runtime handoff、scroll capture/restore、固定错误标题；
- `features/qrAccess/**`：固定文案；
- `features/committedTranscriptSurface/**`：固定文案、activity render、Streamdown translations；
- `features/transcriptState/**`：activity 显示语义，不改变 protocol lifecycle 或 chunk ownership；
- `NotFoundPage.tsx`；
- `src/locales/en.po`、`src/locales/zh-CN.po`，只通过 Lingui workflow 更新；
- 对应 unit、Browser Mode 与 snapshot tests。

`MsgExample.tsx`、`PluralExample.tsx` 和未挂载的旧 `LanguageSwitcher.tsx` 在 production 设置页接管其真实用途后不再保留；其示例消息通过 clean extract 从 catalog 移除。是否按独立机械步骤删除、测试文件如何拆分及每步提交边界由后续 implementation plan 决定。

## 已排除的替代方案

### 只翻译当前可见 JSX

会遗漏 toast、ARIA、transcript 语义、Streamdown 控件和 404，也无法让 Redux 中已物化的英文 activity 重译，因此排除。

### 在 reducer/materializer 中调用 `i18n._`

会把 locale 固化进 history，并迫使语言切换重写 state；违反渲染边界与 transcript 性能不变量，因此排除。

### 把完整 `ThreadItem` 留到 React 再解释

会把协议解释、截断和显示生命周期泄漏到 renderer，扩大 React interface 并破坏现有 materialization locality，因此排除。

### 将 commands/status/launchParams 放入 Redux

commands 是非序列化运行时句柄，连接生命周期也不是持久业务 state；此方案扩大 store interface，因此排除。

### 路由切换时卸载连接，再依赖 snapshot 恢复

会中断进行中的 turn、停止设置期间增量并产生重连闪烁；不是“保持当前对话”的实现，因此排除。

### KeepAlive / React Activity

会保留长 transcript DOM，增加隐藏页面内存和更新成本，仍不能可靠替代 document scroll 恢复；因此只保存最小 UI session。

### push 进入、replace 返回

会形成两个等价聊天历史项；push 两次会让浏览器后退重新进入设置；`history.back()` 又违反确定性目标。双向 replace 是满足全部已确认约束的唯一方案。

### 现在引入 `/threads/$threadId`

当前 thread runtime 与 transcript state 都是单线程形状。只改 URL 会制造“看似多聊天、实则共享单份 state”的错误抽象；本次只保留根布局和 navigation seam，真正多聊天另行设计。

## 风险与约束

- locale 切换影响大量可见断言与 snapshot，计划必须按 owner 分批更新，不能用扩大 ignore、弱化断言或批量接受未知 snapshot 隐藏差异。
- activity 语义 union 必须覆盖现有所有 tool/status/kind 分支；遗漏应成为 TypeScript exhaustiveness failure。
- `search: true` 的实际 TanStack Router 类型与行为必须在实施前由 focused router test 锁定；若 API 不能原样保留未知 query，应在 navigation module 内显式复制当前 parsed search，不能降级为丢参数。
- Streamdown translations 的公开字段是可覆盖边界；不受其 interface 控制的第三方内部文案不能通过私有 DOM 假修复。
- storage warning 不应阻止当前 locale 使用，但必须可观察，不能静默宣称保存成功。
- 设置页本身可在缺少 launch params 时使用；聊天连接错误继续遵循现有 raw diagnostic，不把协议失败翻译或掩盖。

## 设计完成条件

本设计获得用户确认后，下一轮才能编写 implementation plan。确认设计不等于授权修改 `codex-gui/**`；只有计划另行落盘并获得确认后，才进入实施阶段。
