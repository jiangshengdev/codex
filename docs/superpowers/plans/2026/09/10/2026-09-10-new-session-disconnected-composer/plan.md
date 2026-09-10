# 新建会话断连输入区实施计划

日期：2026-09-10

状态：计划草案已落盘，待用户确认实施；本轮不修改产品代码或提交。

设计依据：[新建会话断连输入区展示设计](../../../../../specs/2026/09/10/2026-09-10-new-session-disconnected-composer-design.md)。

## 任务划分

1. **断连保留新建会话输入区**。Blocked by：无其他产品任务；实施前须独立提交本次设计和计划。交付目录、禁用编辑器、草稿保留、连接恢复和回归测试这一完整行为链。详见 [01-disconnected-composer.md](01-disconnected-composer.md)。

只有一个产品任务：编辑器挂载、技能命令生命周期及发送限制必须一起成立，拆分不能产生独立完整的用户结果。不设置纯重排或临时兼容任务。当前落盘是供审阅的计划草案，不代表已经开始执行，也不发布外部 tracker。

## 当前证据与影响面

| 字段 | 已核验结论 |
| --- | --- |
| 权威入口 | router 的新建路由挂载 NewSessionPage；NewSessionOwner 持有草稿、固定 cwd 和提交状态；AppCapabilities 暴露当前 commands。 |
| 已追踪链路 | guiHostConnectionLifecycle 在失联时清空连接能力，恢复时绑定新连接；页面当前据此卸载编辑器。ComposerEditor 已提供 disabled、initialDraft 和草稿回调；SkillCatalogOwner 在 start 时请求技能并以 generation/dispose 隔离旧结果。 |
| 修改范围 | 页面解除编辑器挂载与 commands 的绑定，局部组织技能目录生命周期；更新直接断言旧替代提示的应用 Browser 和 E2E，以及消息 catalog。 |
| 验证映射 | AppNewSession Browser 覆盖页面与连接事件；newSession E2E 已覆盖创建时断连及重连；newSessionOwner 单元测试覆盖提交屏障。 |
| 排除项 | AppShell 已渲染 ConnectionRecoveryNotice，无需新增入口；owner 已在无连接时拒绝 submit，无需改协议或全局重连实现；编辑器已有禁用和恢复草稿能力，无需第二套渲染器。 |
| 剩余未知 | 真实 GUI URL 和可观察断连状态尚未提供，仅影响 Level 2；实施前重新核验运行时及工具环境。若局部组合无法满足既有锁定或技能生命周期契约，先核验影响面，范围扩展须重新确认。 |

本任务涉及挂载及恢复生命周期，按完整影响链验证；不改变跨模块权威类型。命令类型继续由 GuiHostCommands 派生，草稿继续使用 ComposerDraft，技能状态使用 SkillCatalogState，不复制协议 DTO 或引入运行时兜底。

## 文件边界与实现方向

仓库：`/Users/jiangsheng/cnb/codex`，当前分支 `dev`。不创建 worktree，不操作远程。

允许修改：

- `codex-gui/src/features/newSession/NewSessionPage.tsx`：稳定保留输入区；断连禁用编辑及所有发送入口，删除底部重复提示；保留既有业务锁定条件。
- `codex-gui/src/features/newSession/useNewSessionSkillCatalog.ts`：仅在需要独立生命周期职责时新增局部 hook，管理当前可用连接的 catalog 订阅、启动和清理；无 commands 时不构造伪造命令，不调用失效命令，不用空成功响应掩盖不可用状态。编辑器无需因 catalog 变化重建。内部组织可留在页面中，但不得扩大为共享 owner 重构。
- `codex-gui/src/__tests__/AppNewSession.browser.test.tsx`：更新旧断连断言，新增草稿、禁用、恢复及请求边界场景。
- `codex-gui/e2e/newSession.spec.ts`：更新已有创建断连用例，保留请求数量、身份及恢复检查。
- `codex-gui/e2e/newSessionHarness.ts`：仅在既有接口不足时补充本任务断连/恢复或请求观察能力，不改变生产语义或其他测试默认行为。
- `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`：通过项目 extraction 更新移除消息及定位元数据。

只读边界包括新建会话 owner、ComposerEditor、SkillCatalogOwner、useStrictModeSafeOwner、AppCapabilities、连接生命周期、路由、顶部恢复提示、相关测试支撑与项目配置。共享实现不在写集合内；不得为绿色测试修改其他模块。

沿用 HeroUI `Surface` 外壳的 `secondary` 变体、默认内容表面、`Button` 的目录 `ghost` 变体、路径 `Popover`、发送 `primary` 变体。沿用 `surface`、`surface-secondary`、`separator`、`foreground`、`muted` 语义颜色及组件禁用表现。输入内容仍由既有 Lexical ComposerEditor 负责，不新增自制表单或只读文本副本。

## 验证与生成

先增加行为测试并确认因原有卸载行为失败，再实现并复验：

- 编辑中断连、空草稿断连、离线进入新建页：输入区可见，草稿不变，编辑和发送禁用，目录弹出仍可用。
- 失联后不新增技能加载、创建或发送请求；旧技能请求迟到不能向当前连接发布有效状态。
- 恢复后草稿和 cwd 不变，不自动发送；用户主动操作仍遵守原有创建、激活、交接未知及草稿锁定限制。
- 顶部已有连接提示及恢复入口保留，底部旧提示消失。
- 浅深主题、宽窄视口和键盘操作不溢出、不裁切；禁用仅覆盖不允许执行的操作。

Level 1：使用 codex-gui-toolchain 核验后的 fnm 环境和项目入口。运行 `test:browser:parallel` 定向收集 AppNewSession 三引擎场景，`test:e2e` 定向收集 newSession 三引擎场景，以及 `ci`（包含 unit、静态检查和 Browser smoke）。若实施入口要求完整 Browser/E2E，则补齐完整套件；不以本计划定向验证豁免其要求。禁止零测试成功冒充通过；范围外失败单独定位报告，不削弱或跳过检查。

项目入口与参数须在执行前再次按工具链 skill 核验；pnpm 使用 `/opt/homebrew/bin/fnm exec --using-file pnpm`。本轮已核验 package scripts、Browser 收集配置、Playwright 无头配置及本地工具文件存在；尚未执行运行时版本检查，不宣称执行环境已全量通过。E2E 设置 `PLAYWRIGHT_HTML_OPEN=never`，不得启动 headed 或报告窗口。

Lingui 权威入口为 `messages:extract`，输入是 lingui.config 的 `src` 消息集合，完整输出为两份 locale catalog。允许旧底部提示因不再使用变为 obsolete，不执行 clean。人工修改仅限本任务必要翻译；完整审阅消息、译文、comment、状态和 refs，再以同一入口重复提取验证稳定。范围外语义漂移、输出越界或不稳定时暂停生成后继并查明原因。

格式化与自动修复遵循项目入口，尽量限定上述目标，完成后以非 fix 检查和完整 diff 核验实际范围；不执行仓库 just fmt。

Level 2：取得本次完整 GUI URL 后以无头浏览器验收当前源码对应的真实页面、宽窄视口、浅深主题、目录交互和可观察的断连/恢复状态。不猜 URL、不复用截图地址，不主动制造真实断连或发送真实消息。缺失状态标记未执行；该缺口不阻止无依赖代码和自动化工作，但不能宣称完全验证。

Level 3：不适用，不打开可见窗口。

## 执行 DAG

以下节点共同构成执行结构，未重复字段按公共定义继承。实施时按 delegating-micro-stages 的 execution-graph 契约编译运行状态，不把执行日志回写计划正文。

公共定义：`executionContext` 为上述仓库/dev/共享 Git index；`owner` 默认主代理；`subdelegation` 默认禁止。`authorizationGate` 当前为等待用户确认实施，确认后由 action-authorization 建立各节点最小能力信封。`estimatedCost` 为编辑/自动化中等，其余较小，真实验收取决于外部状态；`deferralEvidence` 无。`replanTriggers` 为产品语义、写集合、工具入口或授权发生实质变化。`failureDomain` 默认仅本节点及消费其产物的后继，计划内失败进入诊断、修正、复验，不自动结束任务。

| nodeId / operationKind | hardPredecessors 与 consumes | outcome / produces / completionEvidence | readSet / writeSet / stateEffects / commandScope | verification / resourceLocks |
| --- | --- | --- | --- | --- |
| D / commit | 无；消费已确认设计和本计划 | 独立文档提交及 commit id | 只读并暂存本设计、本目录两文档；Git stage/check/commit | 精确 staged diff 与 diff check；仓库 Git index 写锁 |
| T / 编辑 | D：文档提交先于实施 | 断连新契约测试 diff | 读取边界内源码，写上述 Browser/E2E/harness；源码编辑工具 | diff 范围核验；目标测试文件写锁 |
| R / 验证 | T：消费测试 diff | 测试实际命中新行为且因旧实现失败的证据 | 读应用和测试；仅测试运行产物；项目定向测试入口 | 确认失败原因而非环境错误；对应 runner 与产物目录写锁 |
| I / 编辑 | R：消费红灯证据 | 完整局部实现 diff | 读已声明源码与测试；写页面及可选局部 hook；源码编辑工具 | 行为契约与写集合核验；产品源码写锁 |
| G / 生成 | I：消息输入稳定 | 两份 catalog 及重复 extraction 稳定证据 | 读 Lingui 输入，写两 catalog；messages:extract | 完整字段审查；两 catalog 写锁 |
| F / 格式化 | G：生成与手写修改齐备 | 稳定组合 diff | 读写本任务变更文件；项目格式化/自动修复入口 | 非 fix 复验；目标文件写锁 |
| V / 验证 | F：消费稳定组合 diff | Level 1 结果 | 读取项目验证输入；写 runner 自动产物；上述验证入口 | 定向测试、ci 及适用完整套件；runner/产物目录写锁 |
| L / 验证 | F：消费稳定组合 diff；另需当前真实 URL 与状态 | Level 2 分场景证据 | 只读当前应用、执行允许的无头交互；浏览器临时产物 | 无头状态与实际场景核验；独立浏览器会话写锁 |
| Q / 审查 | F：消费冻结组合 diff | Standards 与 Spec 两轴独立审查结果 | 只读任务 diff、设计、计划和必要上下文；只读工具 | 两名只读审查子代理分别负责，禁止修改、Git 写入和继续委派；源码读锁 |
| S / stage | V、L、Q：验证及审查证据汇合 | 精确暂存任务文件 | 读最终 diff、写 Git index；git add 与 staged 检查 | staged diff/check；Git index 写锁 |
| C / commit | S：消费已核验暂存内容 | 独立产品提交及提交后状态 | 只读暂存范围并创建新 commit；git commit/status | commit id 与工作区状态；Git index 写锁 |

`taskBoundary`：D 属独立文档提交；T 至 C 属任务 01，只有 C 形成产品提交。Q 的 owner 是两名独立只读审查者，其他节点由主代理完成。resourceLocks 的 canonical 文件均为仓库绝对路径加上文件边界所列相对路径；Git index 在执行时通过 Git 实际解析确认。验证进程自行生成的缓存、日志、报告不进入提交，未声明的主动产物操作无授权。

初始 ready set：用户确认实施后为 D；T 等待文档 commit。F 完成后 V、L、Q 可并发，L 缺真实 URL 时单独等待，V 和 Q 继续。共享 runner 或产物目录冲突按锁调度，不因表格次序制造依赖。关键路径为文档提交、红灯、实现、生成格式化、最长验证/审查分支、暂存及产品提交。

修正会使相关旧验证和审查证据失效，重新冻结 diff 并复验受影响部分。若用户随后明确要求立即提交，依其新授权执行当前范围提交，并明确未完成验收；不能把提交本身作为缺失证据。

## 提交与完成边界

先独立提交本次设计及本目录两份计划文档；最终只提交上述实际改动的产品文件，禁止 amend、远程操作、强制暂存 ignored 产物及顺手代码重排。

本轮仅落盘计划供用户审阅。实施终态需报告实际提交、Level 1/2/3 的适用性与结果、范围外失败以及执行图实际并行和未完成节点原因。
