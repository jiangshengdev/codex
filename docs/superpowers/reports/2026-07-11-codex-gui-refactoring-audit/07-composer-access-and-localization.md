# 07 Composer、访问能力与本地化

状态：完成

## 审计范围

状态：完成。

计划范围：composer/turn control、QR/access、i18n、LanguageSwitcher、viewport resize、输入与错误展示辅助逻辑，以及 production 范围内的示例页面。

## 范围交界

状态：完成。

- 允许交界：AppShell 与 platform/environment。
- 禁止扩张：host transport、transcript state。

- 交界引用：[RA-01-001](./01-app-entry-shell-and-platform.md#ra-01-001)
- 本报告仅使用的交界事实：AppShell 拥有 composition 与 Mac Apple WebKit heuristic 的输入侧，本报告只拥有 Composer 的消费行为。
- Evidence owner：`01-app-entry-shell-and-platform.md`

- 交界引用：[RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001)
- 本报告仅使用的交界事实：`GuiHostStatus`、`GuiHostCommands`、`LaunchParams` 的协议与 transport owner 保持在 GUI host client，本报告只审核 Composer 与 QR 的消费边界。
- Evidence owner：`02-gui-host-transport-and-protocol.md`

- 交界引用：[RA-03-004](./03-projection-ingress-and-thread-runtime.md#ra-03-004)
- 本报告仅使用的交界事实：thread identity/runtime action 与 selector owner 保持在 projection/runtime，本报告只审核 Composer 的 availability 与 turn action UI。
- Evidence owner：`03-projection-ingress-and-thread-runtime.md`

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| 报告审计 | 完成 | Composer、viewport、QR/access、i18n 初始化、未接入示例/切换器、catalog 与 production NotFound 均已覆盖。 | RA-07-001 至 RA-07-004 | 本报告“文件覆盖状态”“Findings”“已排除项”“风险” |
| R07-COMPOSER（依赖 `SCAFFOLD-COMMITTED`） | `complete` | model、UI 与 command transport owner 分工清晰，但 send/stop pending 生命周期不对称：send 由 `isSending` 阻止重复提交，stop 没有对应 pending 门禁，首个 interrupt 未完成时仍可重复触发。 | RA-07-001；确认重构点，P2 | `ComposerTurnControl.tsx:38-65,69-107,169-185`；`composerTurnControlModel.ts:26-63`；`ComposerTurnControl.browser.test.tsx:521-613`；`composerTurnControlModel.test.ts:71-105`；`guiHostClient.ts:34-37,205-208` |
| R07-ACCESS / VIEWPORT（依赖 `SCAFFOLD-COMMITTED`） | `complete`（子阶段） | viewport feature detection、focus/blur armed 状态、RAF 合并、覆盖计算和 cleanup 已集中在独立 hook；唯一 production 调用方只提供 Composer shell ref，依赖方向清晰。 | 已由现有抽象覆盖；非 finding | `useRevealComposerOnViewportResize.ts:5-93`；`ComposerTurnControl.tsx:40,67,143-147`；`ComposerTurnControl.browser.test.tsx:72-122,200-304`；production 引用仅命中该 hook 与唯一调用方 |
| R07-ACCESS / QR-ACCESS（依赖 `SCAFFOLD-COMMITTED`） | `complete`（子阶段） | URL builder 独立拥有 origin/threadId/token 构造与编码，popover 拥有 nullable launch params 到 QR/UI 的适配；唯一 production 调用链为 Bridge → AppShell → Composer → QR。 | 已由现有抽象覆盖；非 finding | `qrAccessUrl.ts:1-12`；`QrAccessPopover.tsx:8-67`；`qrAccessUrl.test.ts:4-24`；`QrAccessPopover.browser.test.tsx:5-23`；`guiHostClient.ts:29-32` |
| R07-ACCESS（VIEWPORT + QR-ACCESS） | `complete` | 两个子阶段均已有清晰 owner、独立变化原因和单向依赖；不支持新增公共 environment、URL 或 UI 抽象。 | RA-07-004；已由现有抽象覆盖，非 finding | VIEWPORT 与 QR-ACCESS 子阶段证据 |
| R07-I18N / INIT-SWITCHER（依赖 `SCAFFOLD-COMMITTED`） | `complete`（子阶段） | `i18n.ts` 集中拥有 locale 列表、初始解析、catalog 加载激活与 document language，且由 production bootstrap 使用；`LanguageSwitcher` 无 production/test consumer，却维持本地 locale state、保存入口和 catalog message。 | 被 R07-I18N 统一遗留候选覆盖；`i18n.ts` 已由现有抽象覆盖 | `i18n.ts:3-19,21-65`；`main.tsx:5-28`；`LanguageSwitcher.tsx:5-56`；`en.po:28-31`；`zh-CN.po:28-31`；全局引用仅命中定义与 catalog source 注释 |
| R07-I18N / EXAMPLES-NOTFOUND（依赖 `SCAFFOLD-COMMITTED`） | `complete`（子阶段） | `MsgExample`、`PluralExample` 与 `LanguageSwitcher` 均无 production/test consumer，并贡献两份 catalog 的全部消息；`NotFoundPage` 则由 router 实际挂载，但硬编码英文且无 catalog/test 覆盖。 | RA-07-002 确认/P2；RA-07-003 候选/P3 | `MsgExample.tsx:4-52`；`PluralExample.tsx:4-20`；`router.tsx:1-17`；`NotFoundPage.tsx:4-39`；`en.po:16-38`；`zh-CN.po:16-38`；全局 production/test 引用核对 |
| R07-I18N（INIT-SWITCHER + EXAMPLES-NOTFOUND） | `complete` | production 初始化 owner 合理；未接入的 Switcher/示例/catalog 构成统一遗留边界。Production NotFound 属于不同变化原因，不与清理批次合并。 | RA-07-002 确认/P2；RA-07-003 候选/P3 | 两个 R07-I18N 子阶段证据 |
| R07-BOUNDARY（依赖 `R07-COMPOSER,R07-ACCESS,R07-I18N`） | `complete` | 所有计划文件与 shell/platform 交界均已覆盖；三类最小批次分离，否定结论有明确 owner。 | RA-07-001 至 RA-07-004；释放 R07-DRAFT | 本报告完整结论 |

## 文件覆盖状态

| 文件或目录 | 覆盖状态 | 结论或关联条目 | 关键证据 |
| --- | --- | --- | --- |
| `features/composerTurnControl/ComposerTurnControl.tsx`、`composerTurnControlModel.ts` | 已审核 | turn action owner 清晰；stop pending 门禁缺失，RA-07-001 | `ComposerTurnControl.tsx:38-107,169-185`；`composerTurnControlModel.ts:26-63` |
| `features/composerTurnControl/useRevealComposerOnViewportResize.ts` | 已审核 | 浏览器 viewport 副作用已由独立 hook 覆盖，RA-07-004 | `useRevealComposerOnViewportResize.ts:5-93` |
| `features/composerTurnControl/__tests__/**` | 已审核 | 覆盖 availability、IME、viewport、send pending 与 action error；缺少 pending stop 覆盖 | `composerTurnControlModel.test.ts:15-105`；`ComposerTurnControl.browser.test.tsx:141-613` |
| `features/qrAccess/QrAccessPopover.tsx`、`qrAccessUrl.ts` | 已审核 | URL 与 UI owner 清晰，RA-07-004 | `QrAccessPopover.tsx:8-67`；`qrAccessUrl.ts:1-12` |
| `features/qrAccess/__tests__/**` | 已审核 | 覆盖 URL 构造/编码与可用态 popover | `QrAccessPopover.browser.test.tsx:5-23`；`qrAccessUrl.test.ts:4-24` |
| `i18n.ts`、`main.tsx` | 已审核 | production locale 初始化、catalog 激活与 provider owner 清晰 | `i18n.ts:3-65`；`main.tsx:5-28` |
| `LanguageSwitcher.tsx`、`MsgExample.tsx`、`PluralExample.tsx` | 已审核 | 无 production/test consumer，统一归属 RA-07-002 | `LanguageSwitcher.tsx:5-56`；`MsgExample.tsx:4-52`；`PluralExample.tsx:4-20` |
| `locales/en.po`、`locales/zh-CN.po` | 已审核 | 全部业务消息仅由未接入组件贡献，RA-07-002 | 两份 catalog `:16-38` 及全部 source 注释 |
| `NotFoundPage.tsx`、`router.tsx` | 已审核 | production route 硬编码英文、无 catalog/test 覆盖，RA-07-003 | `router.tsx:1-17`；`NotFoundPage.tsx:4-39` |
| `App.tsx`、`AppShell.tsx` | 已审核交界 | 顶层 host/shell owner 不重复审计；唯一 Composer 挂载与传参边界清晰 | `App.tsx:10-29`；`AppShell.tsx:18-23,50-82` |

## Findings

状态：审计完成；包含两个“确认重构点”、一个“候选待补证据”和一个“已由现有抽象覆盖”条目。

### RA-07-001 Composer stop 缺少 pending 门禁

- Finding ID: RA-07-001
- 主报告: 07-composer-access-and-localization
- Evidence owner: 07-composer-access-and-localization
- 状态: 确认重构点
- 重构优先级: P2
- 结论摘要: Composer 对 send 使用 `isSending` 禁止重复提交并保护 draft transaction，但 stop 没有对应 pending 状态；首次 `turn/interrupt` 尚未完成时 Stop 仍保持可用，可以重复发起相同请求。该 finding 不声称服务端已出现非幂等故障。
- 当前 owner 与当前职责: `ComposerTurnControl` 拥有 draft、IME、send/stop command 生命周期与 toast；`composerTurnControlModel` 拥有 connection/send/stop availability 纯判断；GUI host client 只拥有 command transport。
- 问题类型: 同一 UI owner 内异步 action pending 生命周期不一致、重复提交门禁缺失；不是 transport、runtime 或通用错误系统问题。
- 影响文件、定义侧、构造方、调用方和消费方: `composerTurnControlModel.ts:26-44` 定义 availability；`ComposerTurnControl.tsx:38-107` 构造本地状态并调用 commands；`:169-185` 消费 availability 渲染 Stop/Send；`AppShell.tsx:77-82` 是唯一 production 构造方；`guiHostClient.ts:34-37,205-208` 是 command type/transport owner。
- 共同语义或变化原因: send 与 stop 都是 Composer 发起的异步 turn action，都需要在请求 pending 期间阻止同一用户操作重复进入；draft 清理只属于 send，不要求把两者强行抽成通用 command 框架。
- 推荐边界、建议 owner 和允许的依赖方向: 在现有 Composer owner 内增加 stop pending 门禁，并让 `canStop` 或等价本地推导显式接收该状态；Composer 继续依赖 typed GUI host commands 与 runtime selectors，transport 不反向依赖 UI。
- 预期收益: 阻止重复 interrupt 请求，使 send/stop 操作反馈与可用性一致，并保持改动局限在现有 owner。
- 建议变更范围、最小可审查批次和明确排除范围: 最小批次只修改 `ComposerTurnControl.tsx`、`composerTurnControlModel.ts` 及其专属测试，新增 pending interrupt 重复点击覆盖。明确排除 `guiHostClient`、WebSocket/request transport、thread runtime、transcript state、toast 架构、viewport、QR 和组件全面拆分。
- 行为、契约、状态、性能和测试风险: pending 状态清理必须覆盖 resolve/reject；错误后应重新允许 Stop；不得改变 active turn 判定、draft 内容、send pending 行为或 interrupt payload。
- 后续实施时建议的验证范围: 增加 deferred interrupt browser test，验证 pending 时 Stop disabled 且只调用一次、成功/失败后恢复；保持现有 send、active turn、manual reconnect 与 toast 测试。本轮未运行测试。
- 当前代码关键证据路径与行号: `ComposerTurnControl.tsx:38-65,69-107,169-185`；`composerTurnControlModel.ts:26-44`；`ComposerTurnControl.browser.test.tsx:521-613`；`composerTurnControlModel.test.ts:71-98`。
- 关联的既有报告、issue 或专项设计: [RA-01-001](./01-app-entry-shell-and-platform.md#ra-01-001)、[RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001)、[RA-03-004](./03-projection-ingress-and-thread-runtime.md#ra-03-004) 分别提供 app/shell、host transport 与 runtime 交界；本 finding 只拥有 Composer 消费侧 pending 语义。
- 已排除项: 未因 Composer 同时拥有 draft、IME、commands 与 toast 就判定需要全面拆分；未把错误文本归一化或 command transport 纳入 finding；未声称重复 interrupt 已造成用户可见故障。
- 报告建议: 保留为 RA-07-001、状态“确认重构点”、优先级 P2；后续只实施 stop pending 一致化。

### RA-07-002 未接入 production 的 i18n 示例与切换表面

- Finding ID: RA-07-002
- 主报告: 07-composer-access-and-localization
- Evidence owner: 07-composer-access-and-localization
- 状态: 确认重构点
- 重构优先级: P2
- 结论摘要: `LanguageSwitcher`、`MsgExample` 与 `PluralExample` 没有 production 或测试 consumer，却共同贡献 `en.po` 与 `zh-CN.po` 的全部业务消息；它们构成未接入 production 的 i18n 示例/切换遗留，而 `i18n.ts` 初始化仍由 production bootstrap 正常使用。
- 当前 owner 与当前职责: `i18n.ts` 拥有 locale 列表、初始解析、catalog 激活与 document language；`LanguageSwitcher` 另持有本地 locale/loading、catalog 切换与 storage 保存；两个 Example 只演示 Lingui message/plural macro；两份 catalog 保存这些未接入消息。
- 问题类型: 无 production/test consumer 的示例与切换表面、无效 catalog 维护面；不是 production i18n bootstrap 或 provider owner 错误。
- 影响文件、定义侧、构造方、调用方和消费方: 定义侧为 `LanguageSwitcher.tsx:5-56`、`MsgExample.tsx:4-52`、`PluralExample.tsx:4-20`；catalog 为 `locales/en.po:16-38`、`zh-CN.po:16-38`；全局引用只命中定义与 catalog source 注释，没有 production/test 构造方或消费者。
- 共同语义或变化原因: 三个组件都属于未接入的 Lingui 示例/切换 UI，并共同驱动当前 catalog 内容；它们随是否保留示例或正式接入 locale switching 一起变化，与 production NotFound 翻译有不同变化原因。
- 推荐边界、建议 owner 和允许的依赖方向: 保持 `i18n.ts` 与 `main.tsx` 为 production 初始化 owner；删除或收缩未接入组件及其专属 helpers/messages。若未来需要正式 locale switcher，必须另行设计挂载位置、runtime locale 单一事实来源、失败反馈和测试，不能把当前组件直接视为既定 product contract。
- 预期收益: 移除无消费者代码与 catalog 噪声，避免示例消息制造 production localization 已覆盖的假象，并保留清晰的 bootstrap owner。
- 建议变更范围、最小可审查批次和明确排除范围: 最小批次只处理 `LanguageSwitcher.tsx`、`MsgExample.tsx`、`PluralExample.tsx`、仅由它们使用的 `i18n.ts` helper，以及两份 catalog 的对应消息；catalog 必须通过项目 Lingui 流程更新。明确排除 `main.tsx`/`I18nProvider` 初始化、NotFound localization、Composer/QR、其他 production 文案和新 locale store。
- 行为、契约、状态、性能和测试风险: 清理 helper 时不得移除仍由 initial locale resolution 使用的 locale 类型、browser/storage 读取或 catalog loader；catalog 更新必须避免留下 stale source 注释；若保留 Switcher 则需要处理 runtime locale 与本地 state 漂移。
- 后续实施时建议的验证范围: 重新核对三个组件和专属 helper 的 production/test 引用为零，运行 Lingui extract/compile 与受影响 TypeScript/测试检查，并确认 production bootstrap 仍可加载 en/zh-CN catalog。本轮未运行任何命令。
- 当前代码关键证据路径与行号: `i18n.ts:3-65`；`main.tsx:5-28`；`LanguageSwitcher.tsx:5-56`；`MsgExample.tsx:4-52`；`PluralExample.tsx:4-20`；`locales/en.po:16-38`；`locales/zh-CN.po:16-38`。
- 关联的既有报告、issue 或专项设计: 与上述稳定 RA 条目无直接 finding 关联；本 finding 独立拥有未接入 i18n feature 与 catalog 维护边界，无已知专项设计要求保留这些示例。
- 已排除项: 不把 `i18n.ts` 初始化、`main.tsx` provider 或 locale catalog loader 判为错误 owner；不把 production NotFound 翻译并入遗留删除；不据此决定全应用 localization 策略。
- 报告建议: 保留为 RA-07-002、状态“确认重构点”、优先级 P2；后续优先删除或收缩遗留，不顺带设计新切换器。

### RA-07-003 Production NotFound localization 覆盖不足

- Finding ID: RA-07-003
- 主报告: 07-composer-access-and-localization
- Evidence owner: 07-composer-access-and-localization
- 状态: 候选待补证据
- 重构优先级: P3
- 结论摘要: `NotFoundPage` 是 router 实际挂载的 production 页面，但标题、说明、返回操作和支持链接全部硬编码英文，没有 catalog message 或页面测试。证据确认局部 localization 覆盖风险，但本轮未审计全应用文案，也未确认产品要求所有 production UI 完整本地化，因此暂不升级为确认重构点。
- 当前 owner 与当前职责: `router.tsx` 拥有 route tree 与 not-found component 注册；`NotFoundPage` 拥有 404 页面 UI、回首页导航和支持链接；当前 catalog 不包含该页面消息。
- 问题类型: production localization/test 覆盖候选；不是未接入示例清理、router 抽象或全应用 i18n 架构 finding。
- 影响文件、定义侧、构造方、调用方和消费方: `NotFoundPage.tsx:4-39` 定义页面与硬编码文案；`router.tsx:1-17` 是 production 构造/调用方；两份 catalog 无 `NotFoundPage` source 注释；测试搜索无页面或文案消费。
- 共同语义或变化原因: 页面内四组文案共同随 production 404 体验与 localization 要求变化；它们与删除未挂载示例没有共同生命周期，必须独立处理。
- 推荐边界、建议 owner 和允许的依赖方向: 先确认本产品 production localization 范围及 NotFound 测试要求；若确认，应由 `NotFoundPage` 使用 Lingui macro，并让 catalog 通过正常提取流程获得消息，router 继续只依赖页面组件。
- 预期收益: 若候选成立，可让实际 404 体验随 active locale 变化，并获得 production 页面级覆盖；在证据补齐前避免以单页代表全应用策略。
- 建议变更范围、最小可审查批次和明确排除范围: 候选批次只涉及 `NotFoundPage.tsx`、对应 catalog messages 与独立 route/page 测试。明确不与 RA-07-002 遗留删除合并，不扩张到全应用文案翻译、router 重构、Composer、QR 或 transport。
- 行为、契约、状态、性能和测试风险: 邮件链接、返回首页导航和 404 layout 必须保持不变；在未确认 broader localization policy 前直接翻译单页可能造成不一致体验；新增消息需避免手工 catalog 漂移。
- 后续实施时建议的验证范围: 先补产品/设计范围证据或执行独立 production 文案审计；若升级 finding，再增加 active locale 下的 NotFound browser/route 覆盖并运行 Lingui 流程。本轮未运行命令。
- 当前代码关键证据路径与行号: `router.tsx:1-17`；`NotFoundPage.tsx:4-39`；`locales/en.po`、`locales/zh-CN.po` 的全部 source 注释；全局 test message/reference 搜索。
- 关联的既有报告、issue 或专项设计: 与上述稳定 RA 条目无直接 finding 关联；本候选仅拥有 NotFound localization 消费侧，未发现明确的全应用 localization 专项设计。
- 已排除项: 本轮未审计所有 production UI 文案；不把未翻译单页直接推广为全应用缺陷；不与 RA-07-002 同批删除；不把 mailto 地址或 router API 纳入候选。
- 报告建议: 保留为 RA-07-003、状态“候选待补证据”、优先级 P3；补齐产品 localization 范围后再决定是否实施。

### RA-07-004 Viewport 与 QR/access 已由现有抽象覆盖

- Finding ID: RA-07-004
- 主报告: 07-composer-access-and-localization
- Evidence owner: 07-composer-access-and-localization
- 状态: 已由现有抽象覆盖
- 重构优先级: 非 finding
- 结论摘要: viewport resize 与 QR/access 分别具有独立变化原因，并已由专用 hook、纯 URL builder 和 popover 组件覆盖；生产调用方唯一、依赖方向清晰，不支持新增公共 environment、URL 或 UI abstraction。
- 当前 owner 与当前职责: `useRevealComposerOnViewportResize` 拥有 visual viewport feature detection、focus/blur armed 状态、RAF、覆盖计算与 cleanup；`qrAccessUrl` 拥有 origin/threadId/token URL 构造编码；`QrAccessPopover` 拥有 nullable launch params、QR SVG 与 popover UI。
- 问题类型: 已有抽象覆盖；不是单调用方 helper、环境检测或相邻 Composer UI 的重复边界。
- 影响文件、定义侧、构造方、调用方和消费方: viewport 定义侧为 `useRevealComposerOnViewportResize.ts:5-93`，唯一调用为 `ComposerTurnControl.tsx:40,67,143-147`；QR 定义侧为 `qrAccessUrl.ts:1-12`、`QrAccessPopover.tsx:8-67`，唯一 production 构造为 `ComposerTurnControl.tsx:9,167`。
- 共同语义或变化原因: viewport 随浏览器键盘/布局副作用变化；QR 随 launch params、URL schema 与 access UI 变化。二者只共享 Composer 布局位置，没有稳定共同领域语义。
- 推荐边界、建议 owner 和允许的依赖方向: 保持现有三个 owner；Composer 向 viewport hook 提供 shell ref、向 QR popover 提供 launch params，纯 URL builder 不依赖 React 或 GUI host transport；不新增跨二者的 environment/access facade。
- 预期收益: 维持小而直接的副作用和 URL/UI 边界，避免无意义间接层或把不同平台行为绑定到同一生命周期。
- 建议变更范围、最小可审查批次和明确排除范围: 当前不需要代码变更。若未来处理 viewport one-shot 或 QR unavailable 文案，应分别建立独立小批次；排除 Composer actions、i18n 遗留、transport、全局 platform abstraction 与 QR schema 重设计。
- 行为、契约、状态、性能和测试风险: 现有 viewport one-shot armed 行为可能遗漏后续 keyboard animation resize，但测试明确固化只滚动一次；QR disabled trigger 使 unavailable 文案不可打开。两项均缺少用户可见失败证据，不升级为 finding。
- 后续实施时建议的验证范围: 维持现有 viewport 可见/遮挡/blur browser tests与 QR URL encoding/popover tests；未来若改行为需针对真实产品需求增加覆盖。本轮未运行测试。
- 当前代码关键证据路径与行号: `useRevealComposerOnViewportResize.ts:5-93`；`ComposerTurnControl.browser.test.tsx:200-304`；`qrAccessUrl.ts:1-12`；`QrAccessPopover.tsx:8-67`；`qrAccessUrl.test.ts:4-24`；`QrAccessPopover.browser.test.tsx:5-23`。
- 关联的既有报告、issue 或专项设计: [RA-01-001](./01-app-entry-shell-and-platform.md#ra-01-001) 与 [RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001) 提供 AppShell/platform 输入侧和 LaunchParams/transport 交界；本条只确认 feature 消费边界，无新的实施设计。
- 已排除项: 不因 hook/URL builder 只有一个调用方就判定应内联；不把 viewport 与 QR 合并；不把 nullable unavailable 文案或 one-shot 风险解释为已复现 bug。
- 报告建议: 保留为 RA-07-004、状态“已由现有抽象覆盖”、优先级“非 finding”；保持现状。

## 已排除项

状态：完成。

- 未审计 accessibility 或本报告范围外的其他 production UI 文案。
- 未进入 WebSocket/request transport、thread runtime 或 transcript state 内部。
- 已排除当前需要全面拆分 Composer 或抽取通用错误系统：现有 model、UI 与 command owner 依赖方向清晰。
- 已排除 viewport resize 需要新增公共抽象或合并回 Composer：现有 hook 已完整拥有独立浏览器副作用生命周期。
- 已排除 QR/access 需要新增公共 environment/URL/UI 抽象：纯 URL builder、popover 与 launch params 类型边界已清晰分离。
- 未审计 token URL schema、QR 库内部实现或 transport 安全模型。
- 已排除 `i18n.ts` production 初始化 owner 需要重构：`main.tsx` 使用同一 Lingui instance 完成加载并提供 `I18nProvider`。
- 已排除 `NotFoundPage` 属于未接入遗留清理边界：它由 router production 挂载，变化原因是 localization 覆盖。
- 未运行 catalog extract/compile，也未审计 catalog 之外的其他硬编码 UI 文案。
- 未重审报告 01 的 AppShell composition/platform finding、报告 02 的 host transport/type owner或报告 03 的 runtime state/action owner。

## 风险

状态：完成。

- pending interrupt 缺少门禁，可能在首次请求完成前产生多个相同 `turn/interrupt` 请求；服务端幂等性未在本阶段确认，不声称已复现功能故障。
- 后续最小批次必须限定在现有 Composer owner 内统一 send/stop pending 状态并补充重复 Stop 覆盖，避免扩张 transport、错误展示架构或组件全面拆分。
- viewport hook 在首次 resize 后解除 armed 状态；后续键盘动画再次改变 viewport 时不会继续调整。现有测试明确固化只滚动一次，且没有用户可见失败证据，因此仅记录风险，不建立 finding。
- `launchParams == null` 时 QR trigger 被禁用，popover 内 unavailable 文案无法由用户打开；这是局部 UI 冗余/可达性风险，不建立 finding。
- `LanguageSwitcher`、`MsgExample` 与 `PluralExample` 当前未挂载且无测试，却维持两份 catalog 的全部消息；删除或收缩时需同步 catalog，并避免顺带移除仍由 production bootstrap 使用的 i18n 初始化。
- `NotFoundPage` 是 production route，但用户文案均为硬编码英文且无 catalog/test 覆盖；当前保留为 RA-07-003 候选待补证据，不能与删除遗留示例放入同一最小批次。
