# Codex GUI 浏览器语言自动本地化实施计划

日期：2026-08-03

状态：待确认

实施分支：`dev`

实施基线：`dev` @ `2aacac37bbd0cc49cc2b0a59b2799bd0770bf871`

对应设计：[Codex GUI 浏览器语言自动本地化设计](../../../../specs/2026/08/03/2026-08-03-codex-gui-browser-language-localization-design.md)

## 目标

在当前 `codex-gui` 中，以启动时浏览器语言作为唯一 locale 来源，只支持 `en` 与 `zh-CN`，删除
语言配置与 demo scaffold，并把当前项目自己拥有的 production GUI 固定文案接入 Lingui。

最终实现只保留一条 locale 路径：

```text
navigator.languages / navigator.language
  → resolveBrowserLocale
  → loadCatalog
  → I18nProvider
  → production React renderers
```

Transcript 固定产品语义继续由现有 stored entry 和 selector view 派生，但只在唯一 React renderer 中
翻译；locale、已翻译字符串和第三方内部文案不进入 Redux、projection、协议或动态内容。

## 当前代码证明

实施由当前代码的实际缺口直接推出：

- `src/main.tsx` 已在首次 `root.render` 前调用 locale resolver 和 `loadCatalog`，因此不需要新增 runtime
  provider、Redux locale state 或 router owner；
- `src/i18n.ts` 仍包含 `localStorage` 优先级、`saveLocale`、选择器 label 和把所有 `zh-*` 粗略映射为
  `zh-CN` 的旧 scaffold；
- `LanguageSwitcher.tsx` 是配置 API 的唯一 consumer，`PluralExample.tsx` 与 `MsgExample.tsx` 也没有
  production import；
- 当前两份 PO catalog 只包含上述三个未挂载文件产生的 demo msgid；
- `renderWithProviders` 已使用 Lingui `I18nProvider`，但固定加载 English，不能复用现有 Browser tests
  验证 `zh-CN`；
- `TranscriptCollabAgentStoredEntry` 与 `TranscriptSubAgentActivityStoredEntry` 已经保存 typed semantic
  facts，但 `transcriptStateSelectors.ts` 又提前生成 English `title` / `details`；
- `CommittedTranscriptSurface.tsx` 已是 transcript entry、status、turn、intermediate updates 和空状态的
  唯一 React renderer，并保留 chunk memoization 与折叠内容不挂载规则；
- AppShell、Composer、QR access 与 404 的固定文案都位于各自 production renderer，动态错误、URL 和
 机器值已经与固定 GUI 壳层分开；
- `package.json` 已存在 Lingui、Vite、ESLint、catalog extract、unit、Browser Mode、type-check、lint、
  format、build 和 `ci` 所需依赖与脚本，不需要修改 package、lockfile 或 build integration。

因此不恢复旧 `LocaleRuntimeProvider`、settings route、storage adapter、Streamdown translations 或第二套
transcript presentation owner。

## 权威来源、UI 与非目标

- locale 候选只来自启动时的 `navigator.languages`，数组为空才使用 `navigator.language`；
- runtime `AppLocale` 只有 `en | zh-CN`，English 是 source locale；
- generated `@codex-protocol/v2` 类型仍是 transcript 的唯一协议来源，只允许机械收窄，不手写 wire DTO；
- HeroUI v3 组件、variant、DOM 结构和 semantic tokens 保持不变，本计划只替换项目传入的固定文案；
- 用户输入、模型回复、工具输出、prompt、thread/turn ID、agent path、model、reasoning effort、命令、
  URL、服务端错误详情和协议诊断保持原文；
- Streamdown、HeroUI 和浏览器控件自行生成的内部文案保持原文；
- 不新增设置页、选择器、手动切换、运行期 `languagechange`、storage/compatibility/catalog-load
  fallback 或 locale state machine；浏览器不支持 locale 时回退 English 仍是已确认产品行为；
- 不修改 Rust、app-server、GUI Host、generated TypeScript、runtime validator、WebSocket 或 projection；
- 不新增依赖、package script、Lingui config、CI workflow、screenshot baseline 或 E2E；
- 不翻译开发异常、日志、test fixture、`data-*` 值或机器可读属性。

## 执行约束

- 本计划确认前不修改 `codex-gui/**`，不运行 formatter、generator、lint、type-check、test 或 build，
  不 stage/commit 本计划。
- 计划确认后严格执行 Task 1 → Task 2 → Task 3。每个 Task 分别完成编辑、生成、focused verification、
  stage、staged diff 审查和一个本地提交，再进入下一 Task。
- Task 1、Task 2、Task 3 各产生一个行为提交；测试与 catalog 跟随产生该行为的提交，不新增 cleanup-only、
  catalog-only、validation-only 或 catch-all 提交。
- 不在行为提交中顺手移动或重排 import、声明、字段、函数、分支或组件。若出现无法避免的纯顺序调整，
  立即停止；当前三提交计划不能继续执行，不得在本轮增加 order-only Task 或第四个提交。
- 不保留临时 adapter、双读、双写、旧 `title/details` string view、第二 renderer、storage/
  compatibility/catalog-load fallback、隐藏切换器或兼容层；每个 owner 在对应 Task 中原子切换。
- 所有前端命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，并使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不安装或更新 Node、pnpm、dependency、Playwright browser binary 或其他程序。工具或现有浏览器二进制
  缺失时停止，由用户自行安装并明确通知后继续。
- 普通 TS/TSX 编辑使用 `apply_patch`；三个 demo 文件使用 `git rm`；catalog 必须先由现有
  `messages:extract:clean` 生成 source/message 结构。
- Lingui 没有项目内翻译写入命令；生成结构后只允许补充 `zh-CN.po` 的翻译值，不能手写 source reference、
  msgid、plural shape 或删除 stale entry。补充翻译后重新运行 generator 并检查实际 diff。
- 每个 Task 先用 `oxfmt` 只格式化本 Task 的 TS/TSX allowlist，再运行 package-wide
  `format:oxfmt` 非 fix 检查。
- 每个 Task 提交前检查累计 diff 大小；若非机械总变更超过 800 行或复杂逻辑超过约 500 行，停止并按
  当前真实依赖更新计划，不通过省略测试或弱化断言缩小 diff。
- 当前计划文件与设计状态更新若在实施时仍未提交，始终排除在三个代码 Task 的 stage allowlist 外；
  是否单独提交项目文档由用户另行指示。
- 永远不执行 Git 远程操作。

## 实施 preflight

计划确认后、Task 1 编辑前逐项执行只读核对：

```text
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 2aacac37bbd0cc49cc2b0a59b2799bd0770bf871 HEAD
git diff --name-only 2aacac37bbd0cc49cc2b0a59b2799bd0770bf871..HEAD -- codex-gui codex-rs
git status --short --branch
test -x /opt/homebrew/bin/fnm
test -d /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

preflight 必须满足：

- 当前仍在 `dev`，HEAD 包含实施基线；
- 基线之后没有未纳入本计划的 `codex-gui/**` 或 `codex-rs/**` 行为差异；
- worktree 中的用户变更与当前 Task 无重叠；允许保留的只有本轮项目文档；
- `package.json` 仍存在 `messages:extract`、`messages:extract:clean`、`format:oxfmt`、`lint`、
  `type-check`、`test:unit`、`test:browser`、`build` 和 `ci`；
- fnm-backed `pnpm` 可用，且路径不位于 `/Users/jiangsheng/.cache/codex-runtimes/`；
- 当前 `main.tsx`、`i18n.ts`、transcript view/selector/renderer 和 production 文案 owner 与本计划一致。

若 HEAD、脚本名、generated `ThreadItem`、catalog 配置或 owner 已变化，先重新核验计划，不照搬旧路径。

## Task 1：浏览器 locale bootstrap 与 scaffold 收敛

依赖：preflight 通过。

提交：`feat(gui): resolve locale from browser language`

### 精确文件

生产与共享测试基础：

- 修改 `codex-gui/src/i18n.ts`
- 修改 `codex-gui/src/main.tsx`
- 修改 `codex-gui/src/utils/test-utils.tsx`
- 删除 `codex-gui/src/LanguageSwitcher.tsx`
- 删除 `codex-gui/src/PluralExample.tsx`
- 删除 `codex-gui/src/MsgExample.tsx`

测试与生成物：

- 新建 `codex-gui/src/__tests__/i18n.test.ts`
- 新建 `codex-gui/src/__tests__/i18n.browser.test.tsx`
- 由 Lingui 更新 `codex-gui/src/locales/en.po`
- 由 Lingui 更新 `codex-gui/src/locales/zh-CN.po`

### 实施与不变量

1. 将 locale module 收敛为 `AppLocale = "en" | "zh-CN"`、纯
   `resolveBrowserLocale(browserLocales)` 和现有 `loadCatalog(locale, i18n)`。
2. resolver 按候选顺序用 `Intl.Locale` 解析；非法 tag 跳过，非 English/Chinese tag 继续下一候选。
3. English tag 立即选择 `en`；显式 `Hans` / `Hant` 优先于 region；无 script 的 `CN` / `SG` 选择
   `zh-CN`，`TW` / `HK` / `MO` 选择 `en`；其他 Chinese tag 用 `maximize()` 的 likely script 决定。
4. 明确繁体候选一旦命中立即选择 `en`，不继续用低优先级候选切到简体；空输入或全部不支持时为 `en`。
5. `main.tsx` 唯一读取 `navigator.languages`，数组为空时传入 `[navigator.language]`；继续先 await catalog
   激活，再创建/渲染 React root。
6. 删除 `localeStorageKey`、storage 读写、选择器 label、手动切换 API 与三个未挂载 scaffold 文件；
   不保留旧新 resolver 双读。
7. `loadCatalog` 继续动态 import、`loadAndActivate`、同步 `<html lang>` 并原样传播加载失败；不增加
   English catalog fallback 或 catch。
8. `renderWithProviders` 增加可选 `locale: AppLocale`，默认仍为 `en`；在 async `render` 前加载指定 catalog，
   且不把 locale 透传给 `vitest-browser-react` 的 `RenderOptions`。`TestProvider.tsx` 保持不变。
9. 使用 `messages:extract:clean` 清除只由三个 demo 产生的 msgid；本 Task 完成时两个 catalog 只保留
   header，不手写删除 catalog entry。

### Interface 覆盖

- `en`、`en-US`；
- `zh-CN`、`zh-SG`、`zh-Hans`、裸 `zh`；
- `zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant`；
- script 优先的 `zh-Hant-CN` 与 `zh-Hans-TW`；
- 非法候选后继续、非支持候选后继续、候选顺序；
- `[zh-Hant, zh-Hans]` 在第一项明确繁体处得到 `en`；
- 空数组和全部不支持为 `en`；
- `loadCatalog` interface、terminal bootstrap failure、provider 顺序与默认 English Browser tests 不变；
- Browser Mode 证明 `loadCatalog("zh-CN")` 在 render 前激活 catalog、同步 `<html lang>`，并证明
  `renderWithProviders(..., { locale: "zh-CN" })` 把指定 i18n 实例注入 provider；
- 全仓不再存在 storage key、save API、LanguageSwitcher 或两个 demo 的 production/test 引用。

### 验证与提交

使用 `git rm` 删除三个文件，运行 catalog generator，再只格式化 Task TS/TSX allowlist：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/i18n.ts src/main.tsx src/utils/test-utils.tsx src/__tests__/i18n.test.ts src/__tests__/i18n.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/__tests__/i18n.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run src/__tests__/i18n.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run build
rg -n -e 'localeStorageKey|saveLocale|LanguageSwitcher|PluralExample|MsgExample' src
```

最后一个 `rg` 必须无输出。只 stage 本 Task 精确文件，然后执行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认没有 production 文案迁移、transcript 改动、package/config/lockfile、纯顺序调整或项目文档后提交。
提交后用 `git diff-tree --no-commit-id --name-status -r HEAD` 和 `git status --short --branch` 核对边界。

## Task 2：Transcript typed presentation 与渲染期翻译

依赖：Task 1 已提交，Browser test helper 可加载 `en` 或 `zh-CN`。

提交：`feat(gui): localize transcript presentation`

### 精确文件

生产文件：

- 修改 `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- 由 Lingui 更新 `codex-gui/src/locales/en.po`
- 由 Lingui 更新 `codex-gui/src/locales/zh-CN.po`

测试文件：

- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

### 实施与不变量

1. 在 renderer-facing model 中增加穷尽的 `TranscriptActivityCopy` 与
   `TranscriptActivityDetail = raw | copy`；fixed copy 使用 typed discriminant，动态 detail 保持 raw text。
2. 原子替换 `TranscriptCollabAgentView` 与 `TranscriptSubAgentActivityView` 的最终 English
   `title/details` interface；不保留旧 string view compatibility 或第二条 selector/renderer 路径。
3. selector 继续从现有 typed stored entries 派生 stable view，但返回 `agentStarted`、`agentSpawned`、
   `agentsWaiting`、`agentState`、`omitted` 等 semantic copy；不读取 locale。
4. `agentState` copy 保留可选 `threadId`、authoritative status 与 `messagePreview`，使 finished-wait detail
   可以组合原始 thread ID 与本地化状态；prompt preview 作为 raw detail。
5. stored entry、policy、identity、revision、chunk、placement、count、scroll、started → terminal settlement、
   truncate/cleanup 和有界 collection 全部保持不变；不修改 item policy 或 state implementation owner。
6. 在 `CommittedTranscriptSurface.tsx` 的唯一 React seam 使用 Lingui macro 穷尽翻译 activity copy、
   entry status、global interruption、空状态、region/turn label、四种 `TurnStatus` 和 intermediate plural。
7. `ActivityEntryShell` 继续接收渲染后的 string；HeroUI Card、DOM、CSS、role、accessible name、details
   顺序和装饰性符号保持不变。
8. receiver、agent path、prompt、thread ID、model、reasoning effort 和 message preview 不进入 msgid，
   也不被翻译；protocol enum 原值继续保存在 state/semantic view，renderer 只对其做穷尽的用户可见
   文案映射。
9. 单元测试把 English string expectations 原子替换为完整 semantic object equality，并继续断言 unchanged
   entry/chunk view reference stability。
10. Browser Mode 保留全部默认 English 测试，只增加一个 `zh-CN` vertical slice；使用 async render 和
    可重试 `await expect.element(...)` locator assertion，不查询 HeroUI 内部 DOM。
11. generator 提取本 Task message，补齐 `zh-CN` 翻译后重新运行 clean extract，要求输出 `Missing 0`，
    且无 fuzzy 或 stale demo entry。

### Interface 覆盖

- 三种 sub-agent activity 与五种 collab tool 的 in-progress/terminal copy；
- 七种 agent status、resume fallback、wait 空结果、omitted count、spawn model/effort suffix；
- entry interrupted/failed、global reconnect、empty transcript、region/turn accessible name；
- `Intermediate updates` 的 1/多 item plural 与四种 `TurnStatus` 用户可见映射；
- 复用同一 store 并先捕获 selector view，分别挂载 `en` 与 `zh-CN` provider；两次挂载之间
  `await unmount()`，重新 select 后仍 `toBe` 原 semantic view，用户可见文案分别对应 locale；
- thread ID、agent path、prompt、model、effort 和后端 message 逐字不变；
- selector view identity、started → terminal 原位更新、100-entry chunk、final 后折叠内容不挂载；
- message/Markdown/live streaming source 不经过 Lingui。

### 验证与提交

先生成 catalog、补齐 `zh-CN` 翻译、重新生成并确认 Lingui 输出 `Missing 0`。只格式化 Task TS/TSX
allowlist，然后执行：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/transcriptState/transcriptStateModel.ts src/features/transcriptState/transcriptStateSelectors.ts src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
rg -n -e '^#, fuzzy$|^msgstr(?:\[[0-9]+\])? ""$' src/locales/zh-CN.po
```

最后一个 `rg` 只允许输出 PO header 的空 `msgstr`，不得出现 message/plural 缺失或 fuzzy。只 stage Task 2
精确文件，执行 staged diff 三项检查。确认没有 stored state、policy、projection、CSS、package/config、
其他 production renderer、纯顺序调整或项目文档后提交；随后核对提交文件清单和 worktree。

## Task 3：其余 production GUI 固定文案本地化

依赖：Task 1、Task 2 已提交，catalog 与 Browser locale test seam 已稳定。

提交：`feat(gui): localize production interface`

### 精确文件

生产文件：

- 修改 `codex-gui/src/features/appShell/AppShell.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改 `codex-gui/src/features/qrAccess/QrAccessPopover.tsx`
- 修改 `codex-gui/src/NotFoundPage.tsx`
- 由 Lingui 更新 `codex-gui/src/locales/en.po`
- 由 Lingui 更新 `codex-gui/src/locales/zh-CN.po`

测试文件：

- 修改 `codex-gui/src/__tests__/App.browser.test.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改 `codex-gui/src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx`
- 新建 `codex-gui/src/__tests__/NotFoundPage.browser.test.tsx`

### 实施与不变量

1. AppShell 只翻译 `Unable to start Codex GUI` 外层标题；`status.message` 原样显示。
2. Composer 翻译 composer label、placeholder、Send、Stop 与发送/停止失败 Toast 标题；
   `errorDescription(error)` 的动态详情、用户草稿和提交文本保持原文。
3. QR access 翻译入口、Popover heading、不可用说明和项目提供的二维码 accessibility label；QR URL、
   thread ID、token 与二维码值保持原文。
4. 404 翻译页面标题、说明、返回首页和联系支持；`404`、`mailto:` 地址、URL 和装饰箭头保持原文。
5. JSX children 使用 `Trans`，attribute、Toast、HeroUI props 使用 macro 版本 `useLingui().t`；动态插值
   使用有名称的变量，不把动态内容变成 msgid。
6. 不修改 HeroUI component、variant、token、DOM、focus、事件、URL 构造、错误标准化或 App 装配。
7. 默认 English Browser tests 保持现有 locator 与行为；每个 owner 只增加一个聚焦的 `zh-CN` 行为覆盖，
   不批量重写所有 English locator。
8. App test 同时断言中文 AppShell 标题与原文动态错误；Composer test 同时断言中文控件/Toast 标题与
   原文错误详情；QR test 同时断言中文壳层与原样 URL；404 新测试覆盖中英文 accessible UI。
9. generator 加入本 Task message，补齐所有 `zh-CN` 翻译后重新运行 clean extract，要求 `Missing 0`、
   无 fuzzy、无 demo/stale entry。

### Interface 覆盖

- AppShell、Composer、QR、404 的 English 与简体中文固定文案；
- placeholder、button accessible name、region/dialog name、Toast title、二维码 label；
- `status.message`、network/interrupt error、用户文本、QR URL、thread/token 与邮件地址逐字不变；
- HeroUI/QR library 内部行为、focus、disabled 状态和 URL 生成不变；
- `Codex` 和技术标识保持原文；
- 全部 production source 已无未接入 Lingui 的项目自有固定 GUI 文案，排除项保持原文。

### Focused 与最终验证

先生成 catalog、补齐翻译、重新生成并确认 `Missing 0`。只格式化 Task TS/TSX allowlist，然后执行：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/appShell/AppShell.tsx src/features/composerTurnControl/ComposerTurnControl.tsx src/features/qrAccess/QrAccessPopover.tsx src/NotFoundPage.tsx src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx src/__tests__/NotFoundPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx src/__tests__/NotFoundPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
rg -n -e '^#, fuzzy$|^msgstr(?:\[[0-9]+\])? ""$' src/locales/zh-CN.po
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run
/opt/homebrew/bin/fnm exec --using-file pnpm run build
```

全量前端验证通过后，从 `/Users/jiangsheng/cnb/codex/codex-rs` 运行：

```text
just fmt
```

按项目规则，`just fmt` 之后不再重跑测试。只执行 `git diff --check`、累计 diff 与 Task 3 allowlist 检查；
预期 `just fmt` 不产生 Rust diff。若产生计划外修改，不 stage、不修复，停止并报告。

只 stage Task 3 精确文件，执行 `git diff --cached --name-only`、`git diff --cached --check` 和
`git diff --cached`。确认没有 transcript、package/config/lockfile、third-party translation、纯顺序调整、
Rust 或项目文档后提交；随后核对提交文件清单和 worktree，不追加第四个提交。

## 验收标准

- 启动 locale 只来自浏览器候选，不读取或写入 `localStorage`；
- 只支持 `en` 与 `zh-CN`，明确简体环境映射简体中文，明确繁体环境映射 English，其他语言 fallback
  English；
- locale 只在启动时解析，不监听运行期变化；
- 首次 React render 前 catalog 已激活，`<html lang>` 与 active locale 一致；
- 设置页、切换器、storage API 与三个 demo scaffold 均不存在；
- AppShell、Composer、QR、Transcript、协作活动和 404 的项目固定文案都有 English/简体中文目录覆盖；
- 用户、模型、工具、prompt、ID/path/model/effort、URL、服务端错误和协议内容逐字不变；
- Streamdown、HeroUI 和浏览器控件内部文案未被接管；
- transcript stored state、selector cache、identity、revision、chunk、scroll、折叠隐藏 DOM 与动态
  Markdown/live streaming 性能不变量保持；
- `messages:extract:clean` 最终报告 `zh-CN Missing 0`，catalog 无 fuzzy、demo 或 stale entry；
- format、lint、type-check、unit、Browser Mode、frontend build 与最终 `just fmt` 通过；
- 最终代码历史严格为三个计划内行为提交，没有 compatibility、order-only 混入、validation-only 或
  catch-all 提交；
- 未安装程序或依赖，未修改 package/lockfile/Lingui build config，未操作 Git 远程。

## 计划完成边界

三个 Task 合并后的最终状态满足全部验收标准，本计划即完成并终止。中间提交不要求单独完成全部 GUI
中文化，但每个 Task 自身的 owner、测试、catalog delta、staged diff 和提交边界必须完整。

实现期间只闭环本计划变更直接引入的失败；预存或无关问题只报告，不借本计划修复。若实现必须修改计划外
文件、新增依赖或脚本、改变 locale/动态内容/第三方文案边界、扩展接口或安全语义，立即停止并回到计划
确认；否则不得为等价实现细节追加用户决策或第四轮工作。
