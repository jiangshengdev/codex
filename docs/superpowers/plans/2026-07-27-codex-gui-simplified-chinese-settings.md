# Codex GUI 简体中文与设置页面实施计划

日期：2026-07-27
状态：待确认

## Goal

在不实现多聊天、不缓存隐藏 transcript DOM、不中断现有 GUI Host 连接的前提下，为 Codex GUI 完成 English/简体中文 production 本地化与独立 `/settings` 语言设置页，并保证语言偏好、路由切换、WebSocket 生命周期、草稿和阅读位置恢复、transcript activity 渲染期翻译及 Streamdown 控件翻译均可验证。

## Architecture

实施必须严格保持已确认设计的所有 owner 与生命周期边界：

```text
I18nProvider
└── LocaleRuntimeProvider
    └── Redux Provider
        └── RouterProvider
            └── 最小 root route（只拥有 NotFoundPage）
                └── pathless runtime route
                    └── AppRuntimeLayout（跨 / 与 /settings 持久）
                        ├── Toast.Provider
                        ├── GuiHostConnectionBridge
                        ├── AppRuntimeContext
                        ├── ChatUiSessionProvider
                        └── Outlet
                            ├── / -> App / ChatPage
                            └── /settings -> SettingsPage
```

- `LocaleRuntimeProvider` 独占 preference 读取、系统语言解析、catalog 加载、请求竞争消解、持久化、`languagechange` 与失败状态；业务组件只消费窄 React interface。
- root route 保持最小，只管理全局 404；未知路径不建立 WebSocket。
- pathless `AppRuntimeLayout` 持久拥有连接、projection coordinator、toast host、运行时句柄与聊天 UI session；切换 `/` 和 `/settings` 只替换 `Outlet`。
- primary-surface navigation 集中实现双向 `replace`、固定 pathname、原样保留 search、清空 hash；页面不得自行拼装导航规则。
- `ChatUiSessionProvider` 只保存 draft、是否置底、scroll top 与一次性待恢复标志，不保存 transcript、DOM、commands 或 WebSocket。
- transcript Redux 只保存 locale 无关的语义 union；固定产品含义在 React 边界翻译，动态原文不翻译。
- Streamdown 只通过公开 `StreamdownTranslations`/`translations` interface 本地化，不 fork、不改内部 DOM。
- transcript 继续按 chunk 选择和渲染；语言切换不得遍历或改写历史、提升 chunk revision、展开隐藏内容或扁平化整个 turn。

## Tech Stack

- React 19、TypeScript 6、Vite 8
- TanStack Router
- Redux Toolkit
- Lingui 6（`@lingui/core`、`@lingui/react/macro`、PO catalogs）
- HeroUI React v3、Tailwind CSS v4、Lucide React
- Streamdown 2.5（公开 `StreamdownTranslations`）
- Vitest unit、Vitest Browser Mode、Playwright E2E/screenshots
- 用户 fnm 管理的 Node/pnpm；所有 pnpm 命令统一使用：

  ```bash
  /opt/homebrew/bin/fnm exec --using-file pnpm ...
  ```

禁止安装或更新依赖、浏览器或运行时。若 fnm、pnpm 或既有 Playwright browser binary 缺失，停止执行并让用户自行安装。

## 参考资料

- 产品与架构唯一依据：`docs/superpowers/specs/2026-07-27-codex-gui-simplified-chinese-settings-design.md`
- 前端约束：`codex-gui/AGENTS.md`
- 工具链：`.codex/skills/codex-gui-toolchain/SKILL.md`
- Lingui：`.agents/skills/lingui-best-practices/SKILL.md`
- HeroUI v3：`.codex/skills/heroui-react/SKILL.md` 与 `codex-gui/.heroui-docs/react/components/(pickers)/autocomplete.mdx`
- Vitest Browser Mode：`.codex/skills/vitest-react-browser-docs/SKILL.md` 与 `../vitest/docs/api/browser/**`
- Streamdown：`.agents/skills/streamdown/SKILL.md` 与已安装包公开类型
- generated protocol 权威链路：`codex-rs/app-server-protocol/src/protocol/v2/item.rs` → `codex-rs/app-server-protocol/schema/typescript/v2/**` → `@codex-protocol/v2`

## 文件结构

预计新增：

```text
codex-gui/src/features/locale/
├── localeRuntime.ts
├── LocaleRuntimeProvider.tsx
├── localeRuntime.test.ts
└── LocaleRuntimeProvider.browser.test.tsx

codex-gui/src/features/appRuntime/
├── AppRuntimeContext.tsx
├── AppRuntimeLayout.tsx
├── primarySurfaceNavigation.ts
└── __tests__/
    ├── primarySurfaceNavigation.test.ts
    └── AppRuntimeLayout.browser.test.tsx

codex-gui/src/features/chatUiSession/
├── ChatUiSessionProvider.tsx
├── chatUiSession.ts
└── __tests__/
    ├── chatUiSession.test.ts
    └── ChatUiSession.browser.test.tsx

codex-gui/src/features/settings/
├── SettingsPage.tsx
├── LanguageAutocomplete.tsx
└── __tests__/
    └── SettingsPage.browser.test.tsx

codex-gui/src/__tests__/
└── NotFoundPage.browser.test.tsx
```

预计修改：

```text
codex-gui/src/main.tsx
codex-gui/src/i18n.ts
codex-gui/src/router.tsx
codex-gui/src/App.tsx
codex-gui/src/NotFoundPage.tsx
codex-gui/src/utils/test-utils.tsx
codex-gui/src/features/appShell/AppShell.tsx
codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx
codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts
codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx
codex-gui/src/features/qrAccess/QrAccessPopover.tsx
codex-gui/src/features/transcriptState/transcriptActivityMaterialization.ts
codex-gui/src/features/transcriptState/transcriptStateModel.ts
codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts
codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
codex-gui/src/features/committedTranscriptSurface/TranscriptActivityCard.tsx
codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts
codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx
codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx
codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx
codex-gui/src/locales/en.po
codex-gui/src/locales/zh-CN.po
codex-gui/src/**/__tests__/*（与上述 owner 对应的既有测试）
codex-gui/e2e/app.spec.ts
codex-gui/e2e/**（Playwright screenshot baseline，仅由 Playwright 生成）
```

预计删除：

```text
codex-gui/src/LanguageSwitcher.tsx
codex-gui/src/MsgExample.tsx
codex-gui/src/PluralExample.tsx
```

删除必须使用 `git rm`；文件移动或重命名必须使用 `git mv`。如果实施中证明确切 owner 不需要某个预计文件，保持最小文件集，不为匹配清单创建空壳。

## 任务顺序

### 任务 1：锁定工具与测试入口

- [ ] 只读确认 `/opt/homebrew/bin/fnm`、fnm-backed `pnpm`、现有 package scripts 和既有 Playwright browser binary 可用；不得安装任何组件。
- [ ] 确认 `codex-gui/package.json` 中继续存在 `messages:extract:clean`、`format:oxfmt`、`lint`、`type-check`、`test:unit`、`test:browser`、`test:e2e`。
- [ ] 确认本计划列出的 focused test 命令可接受文件路径；若 CLI 参数与当前版本不兼容，只调整命令写法，不改验证范围。

验证命令：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --version
/opt/homebrew/bin/fnm exec --using-file pnpm exec playwright --version
```

### 任务 2：以测试驱动 locale runtime

文件：

- 新建 `src/features/locale/localeRuntime.ts`
- 新建 `src/features/locale/LocaleRuntimeProvider.tsx`
- 新建 `src/features/locale/localeRuntime.test.ts`
- 新建 `src/features/locale/LocaleRuntimeProvider.browser.test.tsx`
- 修改 `src/i18n.ts`、`src/main.tsx`、`src/utils/test-utils.tsx`

- [ ] 先写 unit tests，覆盖缺失/合法旧值/`system`/无效 preference、storage 读写失败，以及 `preference` 与 `activeLocale` 分离。
- [ ] 覆盖 `en-*`、`zh-CN`、`zh-SG`、显式 `zh-Hans`、`zh-TW`、`zh-HK`、`zh-MO`、显式 `zh-Hant`、`zh-Hant-CN`、裸 `zh`、非法 tag 与不支持语言；繁体命中后不得继续扫描后续简体候选。
- [ ] 使用 `Intl.Locale` 规范化和 `maximize()`，但保留输入是否显式提供 script/region 的事实；全部不支持时回退 `en`。
- [ ] 实现窄 interface：`preference`、`activeLocale`、`isChanging`、`setPreference()`；catalog import、storage、generation 与 activation 不泄漏给组件。
- [ ] 先写 Browser Mode tests，再实现仅 system preference 监听 `languagechange`、相同 active locale 不重复加载、迟到 catalog 不覆盖最新选择。
- [ ] 实现失败语义：catalog 失败保留上一 active locale；storage 失败保留内存选择但发布可观察 warning；启动 catalog 失败保持 terminal diagnostic。
- [ ] 让 `main.tsx` 在首屏 catalog 成功后以 `I18nProvider` → `LocaleRuntimeProvider` → Redux → Router 的顺序装配；`<html lang>` 只反映 active locale。
- [ ] 扩展 `renderWithProviders` 支持显式 locale/runtime 测试，默认仍为 `en`，不弱化现有英文断言。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/locale/localeRuntime.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/locale/LocaleRuntimeProvider.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 3：建立最小 root、pathless runtime route 与持久连接

文件：

- 新建 `src/features/appRuntime/AppRuntimeContext.tsx`
- 新建 `src/features/appRuntime/AppRuntimeLayout.tsx`
- 新建 `src/features/appRuntime/primarySurfaceNavigation.ts`
- 新建对应 unit/Browser Mode tests
- 修改 `src/router.tsx`、`src/App.tsx`、`src/features/appShell/GuiHostConnectionBridge.tsx`

- [ ] 先写 router/navigation tests，锁定 `openSettings()` 与 `returnToChat()` 都使用 replace、固定 `/settings`/`/`、原样保留 search、清空 hash，且不依赖 history.back、referrer 或 route state。
- [ ] 将 root route 收窄为只拥有 `NotFoundPage`，其下增加无 pathname runtime route，再挂载 `/` index 和 `/settings`；未知路径不得挂载 runtime layout。
- [ ] 在 `AppRuntimeLayout` 提升并长期拥有 `status`、`commands`、`launchParams`，挂载唯一 `Toast.Provider` 与唯一 `GuiHostConnectionBridge`，通过窄 context 只向聊天页暴露所需能力。
- [ ] 保证 Bridge effect 不依赖 pathname/search；普通路由切换不得 cleanup、重建 WebSocket 或重建 `ProjectionApplicationCoordinator`。
- [ ] 保证设置页不订阅 commands、host status 或 transcript selectors。
- [ ] Browser Mode 覆盖 `/` ↔ `/settings` 切换仅启动一次 Bridge、设置期间 projection event/delta 继续更新 Redux、返回后呈现新消息。
- [ ] 覆盖直接刷新 `/settings?threadId=...` 时重建一次连接，以及缺少参数时设置页仍可使用、返回聊天后才展示原始连接诊断的本地化包装。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/appRuntime/__tests__/primarySurfaceNavigation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 4：建立最小聊天 UI session 并恢复 draft/scroll

文件：

- 新建 `src/features/chatUiSession/chatUiSession.ts`
- 新建 `src/features/chatUiSession/ChatUiSessionProvider.tsx`
- 新建对应 unit/Browser Mode tests
- 修改 `src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改 `src/features/appShell/AppShell.tsx`
- 修改 `src/features/appShell/useCommittedTranscriptStickyBottom.ts`

- [ ] 先写 session unit tests，状态只包含 draft、离开时是否 sticky bottom、document scroll top 与一次性 pending restore。
- [ ] 将 Composer draft 改为受控消费 session；发送成功只在提交值仍是当前值时清空，发送失败保留草稿。
- [ ] 设置入口动作必须先捕获 scroll snapshot，再调用集中式 `openSettings()`。
- [ ] 聊天页重新挂载时只消费一次 snapshot：原先置底则等待 transcript layout 后滚到最新底部，原先浏览历史则恢复保存的 scroll top。
- [ ] 恢复结束后清除 pending，再恢复现有 sticky-bottom 监听；不得把 transcript entries、DOM、observer 或完整 React tree放入 session。
- [ ] Browser Mode 覆盖草稿恢复、置底返回时包含设置期间新增消息、非置底返回原位置，以及隐藏聊天页期间不保留 transcript DOM。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/chatUiSession/__tests__/chatUiSession.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/chatUiSession/__tests__/ChatUiSession.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 5：实现独立 `/settings` 与 Language Autocomplete

文件：

- 新建 `src/features/settings/SettingsPage.tsx`
- 新建 `src/features/settings/LanguageAutocomplete.tsx`
- 新建 `src/features/settings/__tests__/SettingsPage.browser.test.tsx`
- 修改 `src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改 `src/router.tsx`

- [ ] 使用 HeroUI `Button variant="tertiary"` + `ArrowLeft` 实现带可见“返回”的返回按钮；使用语义 `main`/`section`、`Typography.Heading`、`Typography.Paragraph color="muted"`、`Surface variant="default"`。
- [ ] 页面只包含语言设置，不添加分类导航、侧栏、外观或其他设置；使用 `max-w-3xl` 与 `bg-background`、`text-foreground`、surface、separator、field、muted tokens。
- [ ] Composer 左侧在 QR 旁新增 HeroUI `Button isIconOnly size="sm" variant="tertiary"`、Lucide `Settings`、本地化 Tooltip 和一致的 accessible name。
- [ ] 按已确认 compound structure 使用 HeroUI v3 `Autocomplete`、`Label`、Trigger/Value/Indicator、Popover、Filter、`SearchField`、`ListBox`、indicator 与 `EmptyState`；不得退化为 Select 或设置面板。
- [ ] 受控 single selection 只允许 `system | en | zh-CN`，不渲染 `Autocomplete.ClearButton`；`SearchField autoFocus={false}`，filter 使用 `useFilter({ sensitivity: "base" }).contains`。
- [ ] 语言选项按当前界面显示“Follow system/跟随系统”“English/英语 · English”“Simplified Chinese · 简体中文/简体中文”；相同名称只显示一次，`textValue` 同时包含当前名称与自称。
- [ ] 选择立即 `setPreference`、加载期间禁用、成功后关闭 popover 并清空 query；搜索 placeholder、clear accessible name、空结果、loading/error/warning 全部本地化。
- [ ] 打开设置后聚焦 `h1`/route announcement target 而非搜索输入；返回后恢复设置入口焦点，入口不可用时聚焦聊天 `main`。
- [ ] Browser Mode 覆盖三项显示、双语搜索、键盘选择、无 clear、无结果、移动端不自动聚焦、即时翻译、持久化、system languagechange、tooltip/ARIA 与双向 route focus。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/settings/__tests__/SettingsPage.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 6：本地化全部 production 固定文案

文件：

- 修改 `src/NotFoundPage.tsx`
- 修改 `src/features/appShell/AppShell.tsx`
- 修改 `src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改 `src/features/qrAccess/QrAccessPopover.tsx`
- 修改 `src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- 新建 `src/__tests__/NotFoundPage.browser.test.tsx`
- 修改对应现有 Browser Mode tests

- [ ] 先对 `src/**` 做 production 可见字符串盘点，排除 tests、generated contracts、catalog、协议值与动态内容；将发现项按 owner 加入本任务，不能把下列已知文件清单当作完整覆盖边界。
- [ ] JSX 固定文案使用 `Trans`；attribute、toast、HeroUI prop 与格式化函数使用 macro 版 `useLingui().t`；module-level 固定消息使用 `msg` descriptor；count 使用 Lingui plural。
- [ ] 覆盖 Composer region/placeholder/Stop/Send/发送失败/停止失败，QR 按钮/标题/不可用说明/二维码 accessible name，AppShell 固定错误标题。
- [ ] 覆盖 transcript region、Turn label、空状态、连接中断、Interrupted/Failed、Intermediate updates plural 与 `TurnStatus` 穷尽显示映射；protocol enum 仍保留在 state/data attribute。
- [ ] 覆盖 404 标题、说明、返回首页、联系支持；邮件地址和 `Codex` 不翻译。
- [ ] 保持用户输入、模型输出、Markdown、URL、thread ID、错误 description、服务端/协议诊断原文，不把动态值写入 msgid。
- [ ] 为每个 owner 添加 English 与简体中文可见/ARIA 断言，不用删断言、模糊匹配或 ignore 隐藏变化。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/__tests__/NotFoundPage.browser.test.tsx src/__tests__/App.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 7：将 transcript activity 改为语义 union，并保持权威类型与 chunk 边界

文件：

- 修改 `src/features/transcriptState/transcriptActivityMaterialization.ts`
- 修改 `src/features/transcriptState/transcriptStateModel.ts`
- 修改 `src/features/transcriptState/transcriptEntryMaterialization.ts`
- 修改 `src/features/committedTranscriptSurface/TranscriptActivityCard.tsx`
- 修改 `src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts`
- 修改对应 transcript unit/Browser Mode tests

- [ ] 先把 tests 从英文 `title/details` 断言改为前端领域语义对象；保留 prompt/message grapheme 截断、排序、started→completed 就地更新及 replay/snapshot 行为覆盖。
- [ ] `TranscriptEntry.activity` 保存已确认设计所述 discriminated union：固定 copy kind + 显式动态字段；detail 区分 raw text 与 semantic copy。
- [ ] model/reasoning effort 分字段保存；prompt、agent message、path、thread id 保持原值；不保存最终英文、不保存完整 `ThreadItem`、不使用任意 string key/params record。
- [ ] conversion 输入继续直接使用 `Extract<ThreadItem, ...>` 与生成类型的索引类型；对 item type、tool、tool status、agent status、sub-agent kind 保持 `never` exhaustiveness。
- [ ] `TranscriptActivityCard` 在 React 边界穷尽翻译 semantic union；固定连接符、括号、状态词在渲染期形成，动态值原样插入。
- [ ] 更新 chunk comparator，对 semantic activity 做确定性字段比较；不得删除 comparator、比较本地化文案或退化为整个 turn 数组。
- [ ] 验证 locale 切换不改变同一 entry identity/revision、chunk revision 或 selector result，只改变已挂载 Card 文案。
- [ ] 保持 `TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT`、单 chunk selector/memo、折叠时隐藏 entries 不挂载；加入 101+ entries 回归，证明没有 flatten 全 turn。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 8：通过 Streamdown 公开 translations 本地化 Markdown 控件

文件：

- 修改 `src/features/committedTranscriptSurface/markdownRendering.tsx`
- 修改 `src/features/committedTranscriptSurface/MarkdownText.tsx`
- 修改 `src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- 修改 Streamdown 控件相关 Browser Mode tests

- [ ] 使用 Streamdown 公开导出的 `StreamdownTranslations`，以受 `keyof StreamdownTranslations` 约束的 module-level Lingui descriptors 覆盖 copy/copied/download/table/link warning/fullscreen 等全部字段；不得手写不受公开类型约束的平行 interface。
- [ ] 实现共享 locale-aware hook，将 descriptors 解析为 `StreamdownTranslations`，按当前 `t` memoize；committed/live 使用同一稳定对象。
- [ ] 保留 module-level `streamdownCommonProps` 的 safety、plugins、controls、parser 配置；translations 在渲染期注入，Markdown source 不参与翻译。
- [ ] 保持 live `mode="streaming"`、caret/isAnimating 与 static `mode="static"` 行为；不 fork、不 DOM patch、不字符串替换。
- [ ] Browser Mode 分别验证 English/简体中文下静态与流式 code/table 控件；保留 clipboard 不可用和 live copy disabled 的既有行为断言。
- [ ] 若发现公开 `StreamdownTranslations` 无法覆盖的内部英文，只记录为上游缺口，不通过私有 DOM 绕过。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 9：清理示例并用 Lingui clean extract 生成 catalogs

文件：

- 使用 `git rm` 删除 `src/LanguageSwitcher.tsx`、`src/MsgExample.tsx`、`src/PluralExample.tsx`
- 由 Lingui 更新 `src/locales/en.po`、`src/locales/zh-CN.po`

- [ ] 确认设置页和 runtime 已接管语言功能，三个示例/未挂载文件没有 production consumer 后再删除。
- [ ] 运行项目已有 `messages:extract:clean`，不得手写 catalog source references 或保留已删除示例的 stale messages。
- [ ] 完整填写 `zh-CN.po`；中文采用简洁自然产品语言，保留 `Codex`、命令、技术标识与所有动态值。
- [ ] 检查 English catalog source messages、plural、Streamdown keys 和中文 translations 无空缺、无 fuzzy/stale 示例条目。
- [ ] catalog 生成后重新运行 locale、settings、production 文案、activity 和 Streamdown focused tests。

任务验证：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/locale/localeRuntime.test.ts src/features/transcriptState/__tests__/transcriptActivityMaterialization.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/locale/LocaleRuntimeProvider.browser.test.tsx src/features/settings/__tests__/SettingsPage.browser.test.tsx src/__tests__/App.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 任务 10：补齐 Playwright E2E、响应式行为与 screenshot review

文件：

- 修改 `e2e/app.spec.ts`
- 由 Playwright 生成或更新对应 screenshot baseline

- [ ] E2E 覆盖从聊天打开设置、search 保留/hash 清除、双向 replace、设置期间 WebSocket 不重建、返回显示新增消息、草稿恢复和两类 scroll 恢复。
- [ ] 覆盖语言切换立即更新设置页、Composer、QR、transcript 与 activity；动态用户/模型内容保持原文。
- [ ] 覆盖 system preference、明确 preference、刷新 `/settings?threadId=...` 与缺参设置页。
- [ ] 在窄屏和桌面视口检查设置页单列布局、Autocomplete popover、Composer 设置入口、焦点和无横向溢出。
- [ ] 为 production English 与简体中文设置页、聊天主界面新增 Playwright screenshots；只更新本任务明确涉及的 baseline，逐张检查差异，不批量接受未知变化。
- [ ] screenshot baseline 更新后以非 update 模式重跑 E2E；三种 Browser Mode engine 的行为断言由 `test:browser` 保持覆盖。

任务验证与 baseline 生成：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm exec playwright test e2e/app.spec.ts --grep "settings|locale|draft|scroll|screenshot" --update-snapshots
/opt/homebrew/bin/fnm exec --using-file pnpm exec playwright test e2e/app.spec.ts --grep "settings|locale|draft|scroll|screenshot"
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

### 任务 11：格式化与最终静态/行为验证

- [ ] 先用项目原生 oxfmt fix 格式化本次变更，再只读检查 diff，确认没有范围外改动。
- [ ] 运行 clean extract，确认 catalogs 无 drift。
- [ ] 依次运行 format check、lint、type-check、全部 unit、全部 Browser Mode 和全部 E2E。
- [ ] 不通过新增 ignore、skip、降级、静默 fallback、放宽断言、删除覆盖或批量接受 baseline 让验证通过；本次变更引入的问题在已确认范围内直接修正。
- [ ] 再次核对连接只存在一个、设置页不订阅 transcript、locale 不进入 Redux、activity 不保存英文、Streamdown 仅用公开 translations、隐藏 transcript DOM 不保留。
- [ ] 核对最终只包含计划内代码、测试、Lingui 生成 catalog 和明确 screenshot baseline；不得 stage、commit 或操作 Git 远程，除非用户后续单独授权。

最终验证命令：

```bash
cd /Users/jiangsheng/cnb/codex/codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
/opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e
/opt/homebrew/bin/fnm exec --using-file pnpm run build
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

## 完成标准

- [ ] 默认 preference 为 system；明确选择持久化为 `en`/`zh-CN`，system 保持为 `system`。
- [ ] 简繁匹配、`languagechange`、竞态和 failure semantics 与设计一致。
- [ ] `/settings` 为独立页面，root 最小、`AppRuntimeLayout` pathless 且持久；不存在设置面板实现。
- [ ] `/` ↔ `/settings` 双向 replace、search 保留、hash 清除；WebSocket/projection 持续。
- [ ] draft 与置底/非置底阅读位置正确恢复，不保留隐藏 transcript DOM。
- [ ] 全部 production 固定文案、ARIA、tooltip、toast、状态和 404 支持 English/简体中文；动态内容保持原文。
- [ ] transcript activity 为 locale 无关语义 union，直接机械依赖 generated protocol 类型并保持 exhaustiveness。
- [ ] chunk selector、memo、revision、100-entry 边界与折叠不挂载行为保持。
- [ ] Streamdown committed/live 共享公开、完整、稳定的 translations 对象。
- [ ] `messages:extract:clean` 后 catalogs 无示例 stale entries、空缺或手写漂移。
- [ ] focused tests、全量静态检查、Browser Mode、E2E 与 screenshot review 全部通过。

## 非目标

- 不新增繁体中文或其他 locale，不跨设备同步语言偏好，不写入后端配置。
- 不翻译模型、用户、工具、prompt、命令、URL、thread/agent 标识、服务端错误或协议诊断。
- 不修改 Rust、app-server、GUI Host wire contract、generated protocol、runtime validators 或依赖版本。
- 不实现多聊天、聊天列表、`/threads/$threadId`、多线程 store 或按 thread 键控完整 session。
- 不使用 KeepAlive、React `Activity`、隐藏页面或缓存 transcript DOM。
- 不增加设置分类、侧栏、外观、全局搜索或语言之外的设置项；不采用设置面板。
- 不使用 push/history.back/referrer/route state 决定设置导航。
- 不 fork Streamdown、不依赖私有 DOM、不手写 catalog 生成结果。
- 不通过新增豁免、忽略、跳过、降级或弱化断言隐藏问题。
- 本计划确认前不实施；计划确认后的实现仍不得安装组件、运行后端/原生/CLI 构建或操作 Git 远程。
