# QR-X03-001 正常关闭连接恢复执行记录

日期：2026-09-09。状态：实现、自动化验证与本地提交完成；后续 Level 2 部分场景通过，正常关闭与多任务真实验收仍未完成。

设计与计划：本地提交 `11b7d7307`；实现基线 `ffc118cdf`，当前分支 `dev`。用户直接调用 implement 并确认“确认，开始执行”，激活计划内实施、验证、审查和本地提交授权。计划正文保留原有提案时点，不回写历史状态。

## 执行上下文

执行图完整字段继承已确认计划第 6 节；以下只记录节点实例化、状态和动态变化。canonical root 为 `/Users/jiangsheng/cnb/codex`，共享工作树与 Git index，主代理为唯一 index 和本记录写 owner。禁止 remote、安装、后端构建、项目外主动修改和可见窗口。子代理不能继续委派。节点完成或失败返回后信封到期。

主目标保持：关闭后保留旧对话只读及全部已接收输入，手动重连全部已打开任务，保持当前查看位置，单成员失败隔离，保留 unknown 与继续发送屏障。

## 节点与证据

| 节点 | 状态 | 产物、信封与证据 |
| --- | --- | --- |
| D-stage / D-commit | 完成 | 两份文档均未被 ignore；精确 stage，cached check 通过，独立文档提交 `11b7d7307`。 |
| T1-C | 完成 | connection_contract 代理；发布 activeThreadConnection.ts、其单测及两个 session contracts。主代理核对 diff 与权威错误构造；局部 1 文件 / 3 tests 通过。写锁及 runner 锁已释放。 |
| T1-O | 执行中 | retained_owner 代理；仅 O 组及对应 owner 单测，读稳定 C/O 与既有 fixture。消费 T1-C 的 connection 状态、capture/run/revoke 和 retainDraft 合同，不读 U 运行中源码。 |
| T1-U | 执行中 | closed_ui 代理；仅 U/E/F 组和对应呈现测试，读稳定 C/U/E/F 与本地依赖文档。消费 T1-C 合同，不读 O 运行中源码。应用验收 I 文件保持冻结。 |
| T1-J / stage / commit | 完成 | 所有修正汇合，整体 type-check、lint、format check、diff check 通过；有界 Browser 63 文件 / 687 tests 通过。独立审查及补审通过，精确 38 文件 stage，提交 `9d749476a`。 |
| T2-C | 执行中 | connection_contract 代理，消费 T1 提交，C 组恢复合同与生命周期、直接 lifecycle 单测；发布后解锁 O/U。 |
| T2-C 发布 | 完成 | reconnect/dispose、实时 route getter、共享恢复状态、controller.restoreConnection、session.recoverConnection 与 live 恢复合同稳定。lifecycle 14/14 tests 通过；runner/写锁释放。 |
| T2-O | 执行中 | retained_owner 消费稳定 C，仅 O 组与对应 owner tests；复用单一恢复事务并增加 loaded/resume 前置。取得 member 单文件红绿 runner 独占锁。 |
| T2-U | 完成 | closed_ui 接入共享/成员提示、重连动作、实时 routeTarget 及全部直接 fixture；成员故障在共享恢复期间保留，按钮禁用。没有额外占用 runner。 |
| T2-O 发布 | 完成 | 3 文件 / 101 tests 通过；原位恢复、分页 loaded、必要 resume、失败再试、旧 round、候选通知和 unknown 屏障通过局部验收。 |
| T2-I | 执行中 | close_acceptance 代理，最小 AppProjectionAvailability/support 与 multiSessionHarness/connectionRecovery.spec.ts；独占 runner，Browser/E2E 串行，复用当前 5173 前端，不开报告窗口。 |

T2 组合 type-check 发现 newSessionOwner 单测完整 session mock 缺 recoverConnection，最小新增该直接 fixture 到 U 修正集合并补权威类型 mock，不放宽合同。首次启动失败此前会被共享重连 notice 误称 Connection closed；主代理按既有 startup Browser 与 HEAD 组件核验后，U 用现有 activeThreadSession 区分初次启动失败与保留会话，保留原错误标题/描述与诊断，不新增错误 owner。

T2-I Browser 三引擎 27/27 通过，E2E 首轮 6/9 通过。dirty pending edit 三引擎红测揭示真实交互阻断：retained 抽屉关闭要求丢弃编辑，而外部 Reconnect 被模态遮挡。数据未丢，但恢复入口不可达。动态新增 T2-U-drawer 节点，在同一已确认保留输入目标下最小扩展 `ComposerPendingInputDrawer.tsx` 及计划内 E 的呈现接线：抽屉内复用共享/成员恢复 notice，保留原 retained/cancel/discard 规则，不自动关窗或丢弃数据，不开离线编辑。I 保留红测并释放 runner，等待可见恢复入口后继续。

T2-U-drawer 稳定方案：App 中实时订阅 capabilities/collection，以原 composerRole 匹配成员；Provider/Drawer 可选呈现 slot 传递同一恢复 notice，Binding 排除该 slot，不冻结旧回调。I 重跑 E2E 三场景三引擎 9/9 通过，全程保留dirty编辑并在抽屉内完成共享重连、成员失败诊断与再恢复，0 sends。T2-R 独立静态审查通过。

T2 翻译完成，309 消息、zh-CN缺失0；完整字段审查只有8组新增，既有语义未变，二次 extraction SHA256稳定。lint先原生fix修复void回调花括号，剩余测试async/非空断言人工修正；live嵌套连接复核改实际状态方法，保留同步发布后的可重入门禁。lint非fix通过，开始同一有界Browser组合验证。

T2 Browser组合首轮684/690通过，仅两个缓存页用例仍断言重建controller/固定启动任务；U改为原controller.restoreConnection+实时路由getter、未新建owner、真正unmount dispose一次。4spec E2E 60/63通过，真实回归是空会话页面恢复后state.sendingBarrier仍为suspended，显式发送只入队。T2-O新增修正节点：有效快照与持久化协调后完成原页面恢复协调，保留restoredPaused/unknown和继续发送确认；局部runner给O红绿，E2E证据失效待重验，不修改原失败断言。

T1-O 局部 live seam 已完成红绿，24/24 tests 通过并释放 runner。这只验证该稳定 owner seam，不是组合验证。

T1-U 随后取得局部 composer unit/Browser runner 锁；整体 type-check 等 O/U 稳定后由主代理执行。用户最新 implement 指令要求完整 suite 在末尾运行一次，因此各切片采用所需局部 tests、类型/lint 和有界 Browser，最终执行完整 CI 与计划的组合验证。首次意外全 unit 收集保留事实记录，后续不重复无变化输入。

### 动态范围与合同修正

T1-U 新增最小直接消费者适配：`codex-gui/src/features/currentTask/ProjectionRecoveryNotice.tsx` 原按钮未消费连接状态；若同步先暂停再关闭连接，保留原诊断时按钮仍会可点击。以已发布 `snapshot.connection` 直接派生 RetryActionButton 的 `isDisabled`，不新增镜像 props，不改变 002 恢复实现、原因或协议。该一处普通源码编辑属于已确认“禁用连接操作且保留诊断”的必要实现，加入 T1-U 精确写锁；同一用户结果与授权范围内继续，不回写计划历史。

主代理抽查 T1-O 稳定初稿发现关闭时使用 `queue.setProjectionUnavailable(true)`，与独立连接屏障要求不符。T1-O 内插入修正：新增独立 connectionUnavailable 发送门禁，保留原 projectionUnavailable 合取；范围仍在 O，失效证据仅该 owner seam 及其后继。U 的 composerTurnApplication 精确 unit 11/11 通过，释放 runner；O 修正后取得 7 个局部 owner 文件 runner。

T1-O 7 文件首跑 147/148 通过，一项新增持久化错误文案断言与权威输出不符；修正后 live 单文件 26/26 通过，其他 122 项此前通过。T1-U Browser 24/24、T1-I AppProjectionAvailability Browser 24/24（均三引擎）通过。I 替换旧“关闭卸载编辑器”断言并新增 close 与 002 叠加的诊断可用性覆盖。

整体 type-check 首次发现两个测试适配缺口：新增连接单测使用 ES2024 Promise.withResolvers，改用既有 createDeferred；另一个公共 pending-input fixture 缺两个 queue 方法，最小加入 `composerTurnControlPendingInputBrowserTestSupport.tsx` 的 typed mocks。修正后整体 type-check 通过。后续 lint 指出连接单测异步 expect 时序写法，交 C owner 修正，不更改规则。

T1-G/L/G2 完成：两个 catalog 完整字段审查仅 3 条新增消息及必要 references，既有译文和状态不变；译文补齐后 SHA256 前后一致，zh-CN 缺失 0。格式化后再提取当前 source references。T1-R 独立审查与 T1-V 有界三浏览器组合回归并行，唯一正在修改的连接单测已从审查读取锁中暂时排除，待稳定后补查。

有界 Browser 首轮 672/687 通过，15 个失败为三引擎上的 5 个用例：两个断开后原来清空的断言按保留语义更新；命令 identity 改为实际转发参数、次数与返回值验证；历史标题测试沿用旧 Retry selector，核验 HEAD 组件已是 Load task history 后精确修正；实际回归是 dispose/revoke 后迟到 attach 被轮次检查提前返回而漏清理。O 修正为原请求捕获连接补偿，失败返回 cleanupError，不调用替换连接；两文件 21 项单测通过，独立补审通过。该产品修正使依赖 member 的组合 Browser 证据失效，重新运行相同有界集合。

lint 后续三处写法问题先运行项目 lint:eslint:fix，命令未能修复，随后由主代理建立最小修正节点：去掉 DOM 类型已保证非 null 的重复条件、Promise.resolve 替代无 await 的 async、optional chain 等价表达。仅三个已授权文件，无规则或断言降级，lint 非 fix 复验通过。

## 预检

当前工作树开始时只有上述两份 untracked 文档。Node 为 fnm 的 v24.17.0，pnpm 10.34.5，实际 executable 位于用户 fnm 安装目录；三个 Playwright 浏览器 executable 均已存在。已读当前 manifest、unit/Browser/E2E 配置和协议检查入口。第一次读取共享 Browser 配置时误用不带 `.config` 的文件名，随后通过实际配置 import 定位到 `vitest.browser.shared.config.ts`；这是预检路径修正，不是产品失败。

协议检查所需五个 schema 文件均存在。5173 现有前端进程 cwd 为本项目 codex-gui，E2E 可沿既有配置复用；没有停止或重启该进程。HeroUI 源码和已安装包均为 3.2.4，本地文档和 Vitest React Browser 文档可读。

局部测试命令修正：T1-C 首次 `pnpm run test:unit -- <path>` 意外收集全 unit suite，既有 97 文件 / 1172 tests 通过，新 seam 因模块尚未实现而红灯。后续使用权威脚本 `pnpm run test:unit <path>`，省略多余 `--`，核对实际局部收集；该次既有通过结果不是最终验证。

## 验收状态

- Level 1：全部计划内自动化通过，具体最终结果见末节。
- Level 2：后续真实异常关闭后草稿保留与手动重连通过；实际 close 为 1006，不能作为正常关闭验收。旧对话、多任务和部分失败真实场景仍未执行，详见末节。
- Level 3：不适用。

## 提交

- `11b7d7307`：独立设计与计划文档。
- `9d749476a`：T1 关闭保留与连接操作门禁。
- `9c63a8c7f`：T2 原位手动重连、单成员恢复及抽屉内恢复入口。
- `249444521`：T3 全部成员独立恢复、路由保持与完整草稿导航验收。
- `35378b77e`：最终 Standards 审查的协议测试构造器独立修正。

## T2 汇合与 T3 执行

T2-O 屏障修正后 queue 25 tests、live/member 49 tests 通过；AppRouting 单文件三引擎 54/54 通过，四个 E2E spec 最终 63/63 通过。整体 type-check、lint、format check、diff check 全部通过，独立补审确认保存失败不能绕过屏障、unknown/restoredPaused 保留。T2-J/stage/commit 完成，形成 `9c63a8c7f`。上述表格的 T1-O/U、T2-C/O/I 历史执行中事件均已闭合。

T3-O 消费 T2 提交，最小写集为 activeThreadSession.ts 及其单测，独占单文件 unit runner。稳定发布：当前全部成员并发恢复，preferred 只影响启动次序；旧 pending 后重新核验连接轮次和成员身份，不修改查看位置。新增多成员失败隔离、导航保留、无 live 恢复及移除不复活回归，54/54 tests 通过，写锁和 runner 释放。

T3-U 已启动，消费稳定恢复合同，仅写 AppMultiSessionIsolation.browser.test.tsx，验证恢复期间导航和集合反馈；必要生产缺口先回报。当前取得单文件 Browser runner，禁止与其他验证并发。T3-I 等待 U 稳定的应用行为证据；最终 CI 等全部切片稳定后运行。

T3-U 已稳定，三引擎 9/9 通过，无需生产 UI 变更。覆盖全部成员延迟 attach、恢复途中导航、后台先成功而当前任务失败，以及成员单独重试；原 identity 保留，无共享重启、resume 已 loaded 任务或发送。T3-I 随即取得 runner 和 connectionRecovery.spec.ts/multiSessionHarness.ts 写锁，继续 E2E 集合恢复及完整普通草稿导航交接验收。

T3-I 仅实际修改 connectionRecovery.spec.ts 与 AppProjectionAvailability.browser.test.tsx，未改 harness/产品。staleRevision 属于前端保存返回值，因此在真实 App/owner 上只注入 saveDraft 返回值，走真实 History 菜单导航卸载、重连、返回；正常保存与持续 write 失败两个变体三引擎通过，后者保留最新草稿、领域诊断和禁用发送。Browser 33/33、E2E 12/12 通过。中间失败来自测试菜单名称、存储失败下编辑器禁用语义、领域错误包装断言，均按实际合同修正，不改产品或降低要求。

T3-G/L/G2 无新增/修改消息，不需要提取或翻译。T3-F oxfmt 完成且 diff 仅五个允许文件。T3-R 与组合 lint 并行；lint 的 no-conditional-expect 发现新增 Browser 条件断言，原生 lint:oxlint:fix 不能修复。新增 T3-I-lint 节点仅调整该测试组织，保留两场景完整断言；审查暂时排除此文件，其他稳定文件继续。该节点完成后恢复补审和组合验证。

T3-I-lint 最终拆成两个具名测试，共用实际恢复流程，在调用测试中直接断言最新草稿；存储失败诊断无条件断言。ESLint 另发现保存原 Storage.prototype.setItem 的 unbound-method，原生 fix 无法修复，I 改为绑定两个实际 storage receiver。整体 lint/type-check/format 非 fix 通过，Browser 单文件三引擎 33/33 复验通过。T3-R 各稳定部分及补审闭合，T3-J/stage/commit 精确五文件提交 `249444521`。

## 最终审查与验证

V-final 与 R-final 两个独立审查轴实际并行。固定 `git diff ffc118cdf...HEAD`、四提交 `git log ffc118cdf..HEAD --oneline`，Spec 来源为已提交设计和计划，Standards 来源为当前 GUI AGENTS、项目规则及技能。

完整 `pnpm run ci` 在 `249444521` 上通过：协议校验、格式、lint、类型检查、98 文件 / 1196 单测、3 文件 / 5 Chromium smoke。完整 unit suite 按用户要求在末尾执行；后续测试构造器修正只失效其真实依赖证据，不重复未变化生产源码的 unit。

Spec 轴未发现确定缺陷、遗漏或越界。Standards 轴发现 1 项协议 fixture 规则违例（AppMultiSessionIsolation 两处手工展开 attach 改 subscriptionId），已有共享 attachWithSnapshotThread 可表达；新增 R-final-fix 节点仅修改该测试，closed_ui 为编辑 owner，主代理负责格式化/验证和独立提交。另 1 项“可能的 Duplicated Code”建议指向 member 初始化与恢复的 loaded/resume 分页步骤，属于维护建议而非确认缺陷；本计划不额外进行职责重构。

R-final-fix 已稳定，Standards 原审查者补审确认硬违规 0，两个构造器替换保留原协议值和所有断言。最终有界 parallel Browser 63 文件 / 699 tests、sequential Browser 12 文件 / 24 tests 均通过，无类型错误；四 spec E2E 66/66 通过（46.3s）。最后重新运行整体 lint、type-check、format 非 fix 和 diff check 均通过，精确单文件提交 `35378b77e`。

### 最终证据与节点终态

| 节点 | 最终状态 | 证据与边界 |
| --- | --- | --- |
| T1 / T2 / T3 全部实现、生成、翻译、审查及任务提交 | 完成 | 上述独立提交和局部证据；无临时双路径或未完成集成。T3 无消息变更，生成/翻译节点不适用。 |
| R-final Standards / Spec | 完成 | Standards 硬违规 0、维护建议 1；Spec 确定缺陷 0。审查建议与确认缺陷分开，未启动额外重构。 |
| V-final | 完成 | 完整 CI：1196 unit + 5 smoke；有界 Browser：699 parallel + 24 sequential；四 spec E2E：66。构造器修正后重验其 Browser、整体 lint/type/format，生产源码及 unit 输入没有变化。 |
| V-real | 环境受阻，未执行 | 已请求当前完整 GUI URL、可用真实任务及合法正常关闭触发条件，未收到所需输入；当前工具未提供 launch_gui。没有猜测旧 URL、停止用户服务或打开可见窗口。 |
| J-final | 有界汇合完成 | 实现与 Level 1 通过；Level 2 缺口保留，不宣称完全验证。Level 3 不适用。 |
| D-report | 完成 | 主代理独占记录写入；本文件经 diff/check 后单独本地提交。报告自身提交身份由本地 Git log 追溯，避免自引用改写。 |

最终验证命令均在 codex-gui 目录由 fnm 管理的 pnpm 运行，未安装组件、构建后端或操作远程：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/__tests__/AppProjectionAvailability.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/__tests__/AppActiveThreadSession.browser.test.tsx src/__tests__/AppShell.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/features/appShell src/features/composerTurnControl src/features/threadHistory
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential src/__tests__/sequential/composerPendingInputCopy.browser.test.tsx src/__tests__/sequential/composer-focus.browser.test.tsx src/__tests__/sequential/navigation-focus.browser.test.tsx src/__tests__/sequential/composer-viewport.browser.test.tsx
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/connectionRecovery.spec.ts e2e/multiSession.spec.ts e2e/persistence.spec.ts e2e/projectionRecovery.spec.ts
```

实际并行：T1/T2 的 O/U 独立编辑；切片独立审查与验证；最终 Standards、Spec 与 CI。T3-O 在上下文交接时已完成，T3-U 随后启动，未宣称二者实际并行。

关键路径：文档提交 → 关闭保留 → 单成员重连 → 集合恢复及完整草稿验收 → 审查修正 → 最终自动化 → 本执行记录提交。T3-I 的测试断言与 lint 修正占用该关键路径，未绕过检查。

未启动 ready 节点：无遗留。Browser/E2E 因同一 codex-gui runner/cache/端口互斥串行，资源释放后已运行；T3-U 在上下文交接后调度，期间 T3-O 已返回。Level 2 从未满足真实环境前置，不属于被跳过的 ready 节点。

## 后续真实验收：2026-09-09

用户提供当前完整 GUI URL，随后单独确认允许：在本次无头浏览器输入不发送的验收草稿，仅对本页面 GUI WebSocket 发起 code 1000 关闭，再点击重新连接。该授权不包含停止 cdx、发送任务消息、修改后端或伪造 close 事件。以下记录更新前述初始交付时 V-real 未执行的状态，不改写原始自动化证据。

环境核验：playwright-cli 会话 `qr-x03-real`，list --json 明确 headed=false、persistent=false、attached=false。真实页面连接本机 51507，目标任务处于空闲且没有已提交消息；实际加载的生命周期模块包含 restoreConnection，collection 模块包含全部成员恢复实现。没有沿用旧 URL，也未将 token 写入本记录。

关闭仅作用于 origin 为 ws://127.0.0.1:51507、path 为 /ws、readyState 为 OPEN 的唯一真实 WebSocket。CDP 只用于定位该对象并调用原生 close(1000)，不关闭 Vite 的连接、不停止运行进程、不修改应用 owner 或事件。实际收到 close.code=1006、wasClean=false；客户端发起 1000 不等于握手最终以 1000 完成，因此本次不能证明 QR-X03-001 的正常关闭分支在真实运行中通过。1006 的成因本轮未定位，不推断为前端缺陷，不扩展后端修复。

实际结果：关闭后页面显示连接已关闭、过期说明、诊断和重新连接入口；草稿“QR-X03-001 真实验收草稿：仅检查关闭与重连，禁止发送。”完整保留，编辑器和发送禁用。点击真实重新连接后，关闭提示数量为 0，编辑器 contenteditable=true，发送按钮恢复可用；草稿逐字一致，路由保持原任务，已提交记录仍为“暂无已提交的消息。”。未点击发送，也未产生任务消息。

结论：Level 2 的单空闲任务、真实异常关闭后普通草稿保留和手动恢复通过。正常关闭 code 1000、旧对话保留、多任务及成员部分失败真实场景未验证；原 Level 1 对这些场景的通过结果不代替真实验收。验收草稿保留在本次独立无头浏览器中，未主动清空或提交。

本次实际并行：无，浏览器动作按状态依赖顺序执行。关键路径：确认真实环境 → 取得精确关闭授权 → 写入未发送草稿 → 原生关闭及事件核验 → 手动重连 → 结果记录。未启动 ready 节点：无；真实正常关闭未命中预期事件，仅保留该证据缺口。
