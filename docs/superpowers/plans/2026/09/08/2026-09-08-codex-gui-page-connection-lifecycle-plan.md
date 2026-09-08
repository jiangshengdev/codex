# Codex GUI 页面恢复与连接生命周期实施计划

日期：2026-09-08。

状态：设计文档已由用户确认；用户已授权落盘本计划，计划内容待确认。未开始源码实现、测试或 Git 提交。

设计依据：[页面恢复与连接生命周期设计](../../../../specs/2026/09/08/2026-09-08-codex-gui-page-connection-lifecycle-design.md)。

计划基线：仓库 `/Users/jiangsheng/cnb/codex`，分支 `dev`，HEAD `f468657b1`。编写时只有本主题设计文档未跟踪。路径除特别说明外相对仓库根目录。

## 目标与授权边界

仅在 `codex-gui` 内集中页面恢复与连接生命周期的协调逻辑，提高可测试性，同时保持现有恢复、输入保留及发送行为不变。

本次确认只用于计划落盘。执行须等待用户明确确认本计划；该确认点拟覆盖下述源码与测试编辑、必要前端验证、无头验收及精确范围的独立本地提交。执行前先独立提交本设计和本计划。禁止 remote、amend、force、依赖或浏览器安装、后端/native/CLI 构建及可见桌面窗口。保留 `dev` 的 Rust workspace version `0.0.0`，不修改 Rust 文件。

不创建 worktree 或分支。所有实现使用当前 checkout；主代理是唯一 Git index 写 owner。文件内容编辑使用原生编辑工具；格式问题使用已核验的项目格式入口，不能手写模拟生成物或格式化。文档沿用 `docs/superpowers/**`，不扩展源码范围。

## 计划前证据闭包

| 字段 | 当前证据及计划结论 |
| --- | --- |
| 权威入口 | `codex-gui/src/main.tsx` 的 StrictMode → `src/App.tsx` → `src/features/appShell/GuiHostConnectionBridge.tsx`。Bridge 是页面连接编排的生产入口；Host、collection、NewSessionOwner 和 queue 各自继续拥有内部语义。 |
| 已追踪链路 | 授权消费及存储/fragment 副作用 → Host 握手、commands、通知 → collection 恢复及队列暂停 → AppCapabilities 和页面消费者。`App.tsx:72` 的路由 view 独立于初始恢复目标。Host 使用现有生成协议分类与 validator，新 module 不增加解析或生成链。 |
| 修改范围 | 新 module 吸收 Bridge 的轮次编排；Bridge 保留 React 挂载/释放与 setter 绑定；新增 interface 测试并补足真实 React 接线的行为缺口，具体白名单见下文。 |
| 验证映射 | module 单测检验轮次与错误时序；AppRouting、AppActiveThreadSession、AppProjectionAvailability Browser 检验接线和能力；persistence/newSession E2E 检验恢复、草稿与未知投递；既有 Host/session/newSession 单测继续保留底层检查能力。 |
| 排除项 | `App.tsx:14–30` 已提供稳定 owner 与四个 setter，不需要生产改动。Host、collection 和 queue 已实现错误分类、成员暂停、恢复及投递规则，新 module 只调用它们。无 UI 结构、HeroUI 组件、variant、token、文案、协议、存储格式、依赖和 Rust 变化。 |
| 剩余未知 | 当次真实 GUI URL、运行时版本和安全可复现状态尚未取得；这些是执行期 Level 2 的明确输入，缺失只阻塞相关验收及完整验证声明，不改变本计划范围。工具来源已核验；执行前仍须核验 browser executable、完整生成输入和实际测试收集。 |

独立只读反向审计已核对设计、App、Bridge 和恢复测试：不需要扩大到 App；测试编写不依赖新 module 完成；最终审查和验证必须绑定稳定组合状态；Level 2 不能把模拟未知投递当作真实状态。已将这些结论纳入依赖与验证要求。本轮所有行为证据来自源码及测试定义，未运行测试。

## 精确写入范围与实现任务

生产与 module 测试集合 `M`：

- 新增 `codex-gui/src/features/appShell/guiHostConnectionLifecycle.ts`。
- 修改 `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`。
- 新增 `codex-gui/src/features/appShell/__tests__/guiHostConnectionLifecycle.test.ts`。

调用链回归集合 `B`：

- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`。
- `codex-gui/src/__tests__/AppActiveThreadSession.browser.test.tsx`。
- `codex-gui/src/__tests__/AppProjectionAvailability.browser.test.tsx`。
- `codex-gui/e2e/persistence.spec.ts`。
- `codex-gui/e2e/newSession.spec.ts`。

`B` 是允许补充的文件集合，不要求每个文件都产生 diff。已有覆盖足够时直接保留并执行，不增加镜像实现的测试。任何新增范围先回到计划门禁，不借验证扩大修复。

工作文档集合 `D` 为本计划及其设计文件。执行状态记录保留在对话执行上下文中，不回写已确认计划，不增加报告文件或其他交付物。

### 生命周期 module 与 React adapter

采用 `startGuiHostConnectionLifecycle` 作为唯一启动 interface，接收稳定初始目标、现有 owner、dispatch、能力 setter 和必要环境 seam，返回单个释放函数。调用方不持有或操作连接轮次、controller 或内部清理序列。

生产 adapter 绑定浏览器 location/history、页面事件、frame scheduler、microtask 及现有 Host 创建入口。测试 adapter 提供可控事件和回调。依赖按实际需要取最小范围，不引入全局注册框架、通用容器或第二条实现路径。`GuiHostStatus`、`GuiHostCommands`、`StartGuiHostConnectionOptions`、collection controller、授权对象、NewSessionOwner 直接引用权威定义或机械派生，禁止手工镜像 DTO/schema 和擦除类型后重建契约。

implementation 内区分页面挂载、连接轮次、能力绑定和释放职责。恢复时旧轮次必须先失效及清理，再创建新轮次；旧 callback 不能操作新 controller 或清除新绑定。保留错误可见性，不添加异常吞并或新的释放保证。Bridge 保留冻结初始目标和 effect adapter，删除 `pageSessionRevision` 及原有编排，App 和路由职责保持现状。

### 必须编码的验收契约

| 场景 | 预期与覆盖 |
| --- | --- |
| 启动 | 每轮调用既有授权消费入口；ready 顺序保持 commands → collection → owner 连接 → active session → recovery；通知交给所属轮次。module 单测覆盖。 |
| 授权失败 | 不启动 Host、不安装页面监听器；延迟发布错误；卸载后微任务无效。module 单测覆盖。 |
| Host 同步失败 | 延迟路径先 unavailable 后 error；socket error/close 与协议错误仍分别保留其不同通知顺序。module 与既有 Host 单测覆盖。 |
| pagehide | 任意 persisted 值都同步暂停全部成员；尚未 attach 完的成员继承暂停。module、AppRouting 与既有 collection 测试分层覆盖。 |
| pageshow | persisted=false 不重建；persisted=true 先暂停再释放与重建；恢复继续使用冻结初始目标，当前路由仍独立 view。module 与 AppRouting 覆盖，增加导航后恢复断言。 |
| unavailable | 不自动重连；先解除 owner 连接，再终结 controller，再清 commands；暂时保留 disposed session 引用，轮次 cleanup 才清 null。module、AppProjectionAvailability 覆盖。 |
| 清理 | 迟到通知、cleanup 内重入 unavailable、错误微任务不能污染新轮次或卸载后页面；StrictMode 只保留一套 live queue；dispose 抛错保持可见。module、AppActiveThreadSession 和既有 session 测试覆盖。 |
| 草稿与创建 | owner 跨连接存活；draft/capture/threadId 保留，旧 generation 不再 activate/handoff；未知创建不能自动 Retry。既有 NewSessionOwner 单测及 newSession E2E 覆盖。 |
| 发送恢复 | 空队列恢复后能正常首次发送；已有队列旧 Continue sending 许可撤销；未知 Send/Guide 不能因恢复或 Continue sending 重发。persistence E2E 与既有 queue/session 测试覆盖。 |

测试从 interface 输入和可观察输出断言，不锁定私有轮次载体。Browser 测试沿用既有 render/provider/fixture，await render 与异步 DOM 断言，使用 `expect.element`；协议合法数据复用现有共享 builder。不得改变既有断言、基线或检查以接受行为漂移。

## 验证入口及执行前预检

已读取 `codex-gui/package.json`、Vitest/Playwright 配置及 `.github/workflows/codex-gui.yml`。CI 的权威快检为 `pnpm run ci`，格式 owner 为 oxfmt。本文不触发根 `just fmt`。

已核验 `/opt/homebrew/bin/fnm` 可用；在 package cwd 按 `fnm env --shell zsh` 输出设置环境后，`fnm exec --using-file` 解析到 fnm 的 Node `v24.17.0` 与 pnpm `10.34.5`，均不来自 Codex runtime shim。没有依赖版本文件作假设；当前启用 `FNM_RESOLVE_ENGINES=true`，package engines 为 `^22.18.0 || >=24.12.0`。node_modules、Vitest 入口及三种浏览器缓存目录存在，但目录存在不等于可执行性已经验收。

执行前重新核验 cwd、fnm/pnpm 来源、生成协议/validator/fixture 输入、当前源码与测试收集、三种 browser executable。缺少工具不安装，报告精确缺口及用户操作建议。不要复用本文预检产生的临时 fnm multishell 路径。

以下命令均在 `/Users/jiangsheng/cnb/codex/codex-gui`，完成当次 fnm 环境预检后执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/__tests__/AppRouting.browser.test.tsx src/__tests__/AppActiveThreadSession.browser.test.tsx src/__tests__/AppProjectionAvailability.browser.test.tsx
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/persistence.spec.ts e2e/newSession.spec.ts
```

CI 包含 protocol validator check、oxfmt check、lint、type-check、全量 unit 和 chromium Browser smoke。定向 Browser 入口覆盖 chromium/firefox/webkit；E2E 一次调用覆盖两个文件与配置中的三种引擎。记录实际收集数、通过数、失败与产物，零目标不能算通过。禁止因环境问题删减引擎或跳过测试后宣称通过。

实现节点的局部验证先使用 `test:unit` 携带 module 测试路径，必要时同入口补充 activeThreadSession、newSessionOwner 和 Host 相关测试；最终 CI 已覆盖这些 unit 时不无依据重复。格式修复在项目 oxfmt 入口核验精确文件参数后仅作用于实际变更文件，随后使用非 fix 检查。禁止无差别运行会改写范围外文件的全项目 fix。

Playwright 默认使用 5173 的 dev server，CI 环境使用 4173 的 preview。执行前检查继承的 CI 设置及服务身份；已有端口只能在确认属于本 checkout 和正确内容后复用。不得停止用户服务或绕过入口。CI preview 若需要前端构建，使用 package build 入口并记录产物来源。E2E HTML 报告不自动打开。

### Level 2：真实 Codex 集成

使用当次 `/gui` 或 outer `launch_gui` 返回的完整 URL，不猜测、不拼接、不复用历史 URL。先核实可用运行时、目标路由、其加载的本次前端产物和显式 headless session 证据；没有这些输入不执行相关场景。URL/token 不写入普通源码、提交消息或公开输出。完成后关闭本次控制的无头会话。

| 场景 | 状态准备、动作及成功证据 |
| --- | --- |
| 当前任务恢复 | 使用已授权的当前任务与可读取的真实线程；观察连接 ready 和当前任务呈现，再刷新页面，核对恢复目标及任务身份。仅观察，不提交提示词。 |
| 新会话草稿保留 | 在本次浏览器 session 的 `/new` 输入明确未发送的测试草稿，在同一页面挂载内通过 persisted 页面事件触发连接替换，核对文本及新会话状态；不使用整页刷新，因为 NewSessionOwner 是 App 内存 owner，本设计不承诺草稿跨 reload 持久化。记录没有主动发送操作；输入与浏览器存储属于本次验收副作用。 |
| 页面恢复处理 | 在上述真实应用中触发 pagehide/pageshow 处理并核对恢复后的连接和草稿状态；如使用合成 PageTransitionEvent，证据只称“真实应用中的事件处理验收”，不称真实 BFCache 导航资格验收。 |
| 队列许可与未知投递 | Level 1 用可控 Host 明确覆盖。Level 2 仅在已有合法、已授权且可复现的对应真实状态下检查；不为了制造该状态发送提示词、切断宿主或丢弃真实响应。若缺少状态，分别记为未执行，不以 mock 结果替代。 |

真实发送、创建未知结果的故障注入或影响用户会话的控制，不由 URL 存在自动授权。需要时只请求该动作的精确授权，其他分支继续。Level 2 必需场景缺少输入时，保留验收缺口，不宣称完整验证。Level 3 不适用，不启动可见窗口。

## 描述式 DAG 与提交拓扑

下述默认字段适用于每个节点，与节点表合并后构成完整记录。执行时按 `$action-authorization` 的能力信封与 `$delegating-micro-stages` 的执行图契约细化命令和状态，不把本文当作自动授权。

- `executionContext`：当前仓库、`dev`、共享 worktree 与 `/Users/jiangsheng/cnb/codex/.git/index`；Git owner 唯一为主代理，不创建 worktree。先核实真实 git-dir/index 身份再加锁。
- `authorizationGate`：当前全部执行节点为 pending，等待用户确认本计划；Level 2 对应场景还依赖当次 URL、真实状态与动作授权。`grantSource` 为后续计划确认；`objective` 为本文唯一目标；`phase` 随节点为实现/验证；`parameterBounds` 为本文 cwd、白名单和无头入口。未列动作不授予。
- `allowedOperations`/`grantedOperation`/`commandScope`：只允许节点所列单一动作的有界步骤；编辑用 apply_patch，读取用 cat/rg/git 只读命令，格式化与验证用本节已核验项目入口，stage/commit 仅操作 D 或 M∪B 的实际 diff。Git 提交先核对 ignore/status/diff，精确 `git add -- <allowlist>`，`git diff --cached --check` 后新建本地 commit，不包含无关改动。
- `canonicalTargets`、`readSet`、`writeSet`：节点表列出的集合按仓库绝对路径解析。读取集合 `R` 为本文设计/计划、适用规则、codex-gui 源码、测试、配置、已存在依赖及现有协议生成输入与产物；仅为目标证据读取，不写生成物、依赖或其他项目。I/B 并发时，I 的 readSet 为稳定基线中的 R 加自己的 M 工作副本，B 的 readSet 为稳定基线中的 R 加自己的 B 工作副本；需要对方文件时用已提交基线读取，不读取对方正在修改的工作副本。F 之后的验证读取冻结的组合工作树。
- `negativeConstraints`：本文范围与禁止项全部生效；`specialApprovals`/`requiredApprovalIds` 默认空，新增特殊动作必须单独满足；`subdelegation=false`。主代理直接分配子节点不授予子代理继续委派能力。
- `lifecycle`：节点启动时以有效授权激活，返回或前提失效时到期。`replanTriggers`：产品行为/范围/协议/权限改变则回对应门禁；计划内失败则插入有界诊断、修正和复验节点，不扩大目标或降低检查。
- `deferralEvidence`：初始为空。所有有价值且无锁冲突的 ready 节点及时运行，不以任务编号或同仓库制造依赖。`failureDomain` 默认仅本节点、消费失效产物的节点及其后继；共享环境缺失按实际消费者传播。
- `resourceLocks`：编辑独占对应写文件，审查/验证对源码只读；格式化独占实际变更文件；Git 写独占真实 index；Vitest 调用共享 node_modules/.vite 缓存及类型检查输出时互斥；E2E 独占实际 5173/4173 服务与 test-results/playwright-report；真实验收独占本次受控浏览器 session。读写资源相交即等待锁，释放后立即重算，不把锁变成伪依赖。

| nodeId / taskBoundary / operationKind / owner | hardPredecessors 与 consumes | outcome / produces / completionEvidence / verification | readSet / writeSet / stateEffects | estimatedCost |
| --- | --- | --- | --- | --- |
| D-stage / 文档 / stage / 主代理 | 计划确认；消费 D 的审阅版本 | 仅 D 已暂存，staged diff 与 ignore 核验通过 | D、Git 状态 / index / 精确暂存 | 短 |
| D-commit / 文档 / commit / 主代理 | D-stage 的准确 index | 独立设计与计划 commit id；记录父提交与 status | D、index / Git 本地提交元数据 / 文档提交 | 短 |
| I / 生命周期提取 / 编辑 / 主代理 | D-commit，消费已提交设计与计划 | M 的单一路径实现与 interface 单测；完整 diff 可审阅，无旧编排 | R / M / 源码与测试编辑 | 中 |
| B / 生命周期提取 / 编辑 / 独立子代理 | D-commit，消费既有 App/页面 interface 及契约表；不依赖 I | B 中必要回归补充及覆盖映射；不复制 module 私有结构 | R / B / 测试编辑 | 中 |
| U / 无提交 / 调查 / 主代理 | 计划确认，无源码产物依赖 | 核实当次真实 URL 的取得入口、runtime/状态可达性；缺口按场景返回 | R、当次工具只读结果 / 无 / 仅对话结果 | 短 |
| F / 生命周期提取 / 格式化 / 主代理 | I 与 B 的编辑产物，读取组合 diff | 对实际变更文件运行受限项目 formatter，再非 fix 检查；发布稳定组合状态标识 | R、M∪B / M∪B 中实际变更 / 必要格式修复 | 短 |
| Rv / 无提交 / 审查 / 未参与编辑的子代理 | F 的稳定状态 | 按设计反向审查 scope、时序、权威类型、删除旧路径和回归覆盖；具体发现或无发现证据 | R、稳定 M∪B / 无 / 对话审查结果 | 中 |
| V-ci / 无提交 / 验证 / 主代理 | F 的稳定状态 | 本文 ci 入口收集并通过所有规定检查，记录结果 | R、M∪B / 无主动源码输出 / 项目命令自动测试与缓存产物 | 中 |
| V-browser / 无提交 / 验证 / 验证子代理 | F 的稳定状态 | 本文定向 Browser 三引擎通过，实际命中三个 App 文件 | R、M∪B / 无主动源码输出 / 测试与缓存产物 | 中 |
| V-e2e / 无提交 / 验证 / 验证子代理 | F 的稳定状态 | 本文 E2E 两文件三引擎通过，服务来源明确 | R、M∪B、服务身份 / 无主动源码输出 / 已授权 dev/preview 服务及测试报告 | 中 |
| V-runtime / 无提交 / 验证 / 主代理 | F 的稳定产物与 U 的场景输入；不以 Level 名称依赖其他验证 | 各适用 Level 2 场景的真实观察、产物身份与 headless 证据；缺口单列 | 本次前端产物、授权 runtime / 本次浏览器 session / 表中明确的浏览器交互与存储 | 中，依赖当次输入 |
| J / 无提交 / fan-in / 主代理 | Rv、V-ci、V-browser、V-e2e、V-runtime 的有效证据 | 对齐同一最终状态；所有计划内发现已修正，适用验收无缺口才解锁完成 | 全部结果、最终 diff / 无 / 对话汇总 | 短 |
| T-stage / 生命周期提取 / stage / 主代理 | J 的通过证据及组合 diff | 仅 M∪B 实际变更暂存，staged diff/check 通过 | M∪B、Git 状态 / index / 精确暂存 | 短 |
| T-commit / 生命周期提取 / commit / 主代理 | T-stage 的准确 index | 独立重构及测试 commit id；最终范围与 status 核验通过 | index、staged diff / Git 本地提交元数据 / 实现任务提交 | 短 |

执行确认后的初始 ready set 为 D-stage、U；D-commit 后 fan-out 为 I 与 B。二者写集合不相交且消费现有接口，可并行编辑；读取对方正在修改的文件前先等待稳定产物。I/B 同属一个重构提交任务，避免为并行编辑引入多余 worktree。

I/B 汇合至 F；F 后 Rv 与验证分支 fan-out。V-ci 与 V-browser 若共享 Vitest 缓存/类型输出则因资源锁顺序运行，Rv 和无冲突 E2E 不必等待；实际资源身份由执行前预检确认。V-runtime 的前置是本次稳定前端、URL 和合法真实状态，可与无冲突自动化并行；不为层级编号添加串行边。

预计关键路径为 D-stage/D-commit → 较慢的 I/B → F → 最慢的验证/修正分支 → J → T-stage/T-commit；真实状态缺失可能成为 V-runtime 的等待点。任务提交拓扑为文档提交 → 生命周期提取提交。此任务保持行为，不加入无关重排；若发现必须改变可观察行为，先回设计，且不得与纯顺序调整同提交。

## 失败、修正与完成

稳定审查或验证期间不修改其读取文件。出现计划内失败，记录具体失败证据和 owner，继续无冲突分支；写入修正前让相关读取释放锁，再插入修正、格式检查及受影响复验。修正失效哪些测试和审查证据就重跑哪些，不盲目重复全部检查，不把首次失败作为任务终止条件。

独立审查发现由原编辑 owner 修正，并由未参与修正者核验。已有提交需要修正时创建新的独立提交，不 amend；不为中间完整性建立临时兼容、双读双写或 fallback。若工具、真实输入或授权缺失且没有安全替代路径，精确暂停受影响节点，继续其他已授权分支，保留未完成状态。

最终状态必须同时满足：Bridge 不再编排轮次；只保留一条生命周期实现；已确认行为与权威契约保持；全部必要任务及计划内修正形成独立本地提交；最终组合状态的检查与适用验收成立。Level 1、Level 2 分别报告，Level 3 标明不适用。合成事件不证明 BFCache 资格，缺少真实状态不得声称该场景完整验收。

执行终态按契约报告实际并行、关键路径、未启动 ready 节点及原因，并提供提交、验证结果和剩余缺口。全部任务及最终验证完成后结束本轮，不再主动追加下一轮工作。
