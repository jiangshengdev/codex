# Codex GUI 重试行为统一执行记录

日期：2026-09-09

状态：本轮实现、独立审查、自动化验证及任务提交完成；真实 GUI 验收未执行。

依据：[实施计划](../../../../plans/2026/09/09/2026-09-09-codex-gui-retry-action-behavior-plan.md)。用户本轮明确授权“确认，开始执行”；计划历史状态不回写。

## 授权与执行上下文

- 主目标、产品语义及 T0–T8 文件集合沿用已确认设计与计划；QR-X03-002 恢复能力不在本轮实现范围。
- grantSource：本轮用户执行确认。允许计划内编辑、生成、格式化、验证、独立审查和本地独立提交；不安装、不操作远程、不构建后端、不主动修改项目外状态、不打开可见窗口。
- 当前目录及 canonical root：`/Users/jiangsheng/cnb/codex`；分支 `dev`；基线 `6cfe20968c060ec38e8e2708b6108e93c25c9e91`；共享 index 为该根目录下 `.git/index`。主代理独占 index/HEAD、格式化、生成、runner 与执行记录。
- 节点的 objective、operationKind、outcome、依赖、读写集合、verification、failureDomain、replanTriggers、resourceLocks、estimatedCost、deferralEvidence 继承计划第 6 节，授权状态更新为 active。各节点仅有其动作类型及文件集合的能力，返回/完成即到期；子代理不得继续委派。
- E1–E5 分别持有自己的文件写锁；读取其他分支依赖时使用 `356b976fb` 的 Git 稳定快照。共享按钮接口已发布；公共 fixture 由 E6 独占。没有测试在可变组合源码上运行。

## 节点事件

| 节点 | 状态/产物 | 事件与资源 |
| --- | --- | --- |
| P0s/P0c | 完成，`356b976fb` | 核验工作区仅两个工作文档、ignore 与 staged diff 后独立提交；释放 index/HEAD 锁 |
| E0/T0 | 完成并通过组合验证 | 纯展示 RetryActionButton：ButtonProps 派生，children/pendingChildren/isPending；不持有业务状态 |
| E1/T1 | 编辑完成，02:22:30 UTC | history_error_audit；10 文件，新增 initialRetrying/appendRetrying/retrying；释放文件锁 |
| E2/T2 | 编辑完成，02:25 UTC | current_task_retry；7 文件；保留旧错误、公开执行状态和页面请求隔离；释放文件锁 |
| E3/T3 | 编辑完成，02:20 UTC | recovery_scope；4 文件，pending.previousFailure 派生失败类别；释放文件锁 |
| E4/T4 | 编辑完成，02:20 UTC | creation_retry；6 文件，保留 failure 且 phase 独立；释放文件锁 |
| E5/T5 | 编辑完成，02:19:30 UTC | compaction_retry；7 文件，claim 到 unknown 保留 startFailure；释放文件锁 |
| E6a/T6 | 完成 | E3 合同和 E4 标签发布后提前处理不相交 fixture/E2E；不等待无关分支，增加 held attach 与同步保存再失败验证 |
| E6b/T6 | 完成 | E2 发布 retryAction/retryPending/removalPending 必填字段，公共 collection fixture 补齐 |
| F/G/R/V1–V3/A/S0–S7/C0–C7 | 完成 | 结果与修正过程见下文；V4/Level 2 单独记录未执行 |

E1–E5 在约 02:16–02:19 UTC 存在实际并行编辑重叠。E6a/E6b 使用已发布合同提前集成，不读取其他分支未稳定内容。首次派发时未逐节点采集精确时钟，以上只记录可证实的时间区间。

### 动态修正节点

- T1-D1：主代理源码核对发现 ContinueTaskAction 的 ready 分支在导航前释放请求，且 `void navigate` 没有捕获拒绝；新 pending 展示可能停留。节点目标为导航失败恢复原动作和更新错误；operationKind=编辑，owner=history_error_audit，writeSet 仅 T1 的 ContinueTaskAction 与 ThreadHistoryDetailContinuation Browser 用例，其他能力沿用 E1；依赖 E1 稳定源码，产生完整继续/导航请求生命周期。失败域为该入口及 F/R/V 后继；无产品范围变化。02:25 UTC 启动，F 等待该两文件写锁释放。

## 环境预检与边界

已核验项目 rules、Node/pnpm 来源、package scripts 与 CI 权威入口。本轮 fnm Node `v24.17.0`、pnpm `10.34.5`；HeroUI 本地及解析版本均 `3.2.4`。Vitest、oxfmt、Lingui、TypeScript、ESLint、oxlint 可解析；三浏览器 executable 均存在。

预检中的 CJS `require.resolve` 不适用于 HeroUI ESM exports；改用 ESM `import.meta.resolve` 后确认可用。这是预检命令方式错误，不是依赖缺失或产品故障。一次文档搜索因 shell glob 未匹配、一次计划读取 cwd 错误，均已用明确路径纠正，无有状态副作用。

Level 1 正在运行。Level 2 尚无当前完整 URL、真实失败状态或具体业务测试对象；可用工具未发现 `launch_gui`。已异步询问用户，不猜测入口、不启动后端；该证据缺口不阻断源码与自动化验证。Level 3 不适用。

## 审查、生成与验证事件

- T1-D1 于 02:27:37 UTC 完成，导航加入同一请求生命周期；激活后导航失败只重试导航，并补能力替换隔离用例。
- F：项目 oxfmt fix 后非 fix 通过；实际 diff 均在计划集合内。
- R 与 G1–G3 实际重叠：独立审查未发现阻断代码缺陷。Rc 要求补移除动作边界的 translator comment 与中文，纳入 T2-F1/T7 修正。
- G1–G3：新增 15 条消息，zh-CN 缺失为 0；既有翻译保持，Retry 无生产引用而转 obsolete。其余 source refs 仅涉及 8 个计划内文件。完整去 refs 语义 diff 已审查；补译后第二次同入口提取 hash 不变（en `57a6e3b1a5a114a37b193d067b7668d6e747cf0715a41ba24fee97e471e21ef3`，zh-CN `10b9b4c7fc75e9b02fc812fbaa56187ceb6955d5da6a661cf6c589b033650935`）。T2-F1 增加注释后重新生成并验证稳定。
- V1 首次：protocol 与格式通过；oxlint 报 T0 mock 缺少类型、T2/T3 Browser 条件 expect，未进入后续 CI gates。V1-D1 独立 type-check 收集到 E6 一个 collection fixture 缺字段及 T0 spinner 查询 Element 类型过宽。均为本次变更，未绕过检查。
- 修正节点：T0-F1（主代理、T0 test）、T2-F1（current_task_retry、T2 两文件）、T3-F1（recovery_scope、T3 Browser test）、T6-F1（主代理、菜单 fixture）按原节点能力和文件写锁并行。无新增授权范围；修正后 F/G/V1 重新取证。
- Rc-F1 已独立闭环：列表移除注释与中文准确，测试改写未降低覆盖；二次提取最终 hash 为 en `5c831c6ca844788ee40a8c10864d6ee3a1c06ffb030c0802e1631af6c101452b`、zh-CN `65e677de3304a07b9093e5f3c38520a170f14f9c640a2f2240ffa9f7113464c5`。
- V1 第二次：oxlint 已通过，ESLint 发现 CurrentTaskPage 修改 memo 对象违反 React immutability，及跨 await 条件被 TS 窄化；导航回归两处 void union 违反类型风格。T2-F2 将 scope 改为不可变身份＋ref 当前性＋React pending 状态，保留请求防重与过期隔离；T1-F2 修正测试类型。仅原任务文件，编辑完成后重取格式/生成/验证证据。
- R-F2 独立复核通过，scope/ref/state 修正保持隔离、防重及旧错误语义；类型派生未降低导航回归。
- G 最终重复提取稳定：en `0c03616babcd65cdc5cd05d2a48f28f8da4f1a18a549d73b7bd520b4ca0f08f3`、zh-CN `eae11a97cae727ae35437f7a1ede430633621d2b9ce4f8529abf1e90d68773bb`。相较 Rc-F1 仅当前任务源码定位随修正变化。
- V1 第三次通过（02:40 UTC）：protocol、oxfmt、oxlint、ESLint、type-check，97 个 unit 文件／1148 个测试，3 个 Chromium smoke 文件／5 个测试全部通过，无类型错误。目标 owner 单测由既有 Vitest 收集入口命中。
- V2 parallel 于 02:41 UTC 取得 runner/cache 写锁运行计划精确有界集合；V2 sequential 与 V3 等待该共享资源锁。源码保持冻结，执行记录为唯一可变文档。
- V2 parallel 通过：93 个浏览器实例文件／936 个测试，Chromium、Firefox、WebKit，无类型错误，45.31 秒。V2 sequential 随即取得锁并通过：9 个实例文件／30 个测试，三个浏览器，无类型错误，7.65 秒。
- V3 开始前再次核验 5173 无监听进程，使用计划 E2E 入口自行启动当前项目 Vite，无头、`PLAYWRIGHT_HTML_OPEN=never`；未接管用户服务、未启动后端。
- V3 通过：81/81（三个 spec × 三个浏览器），56.1 秒。Vite 输出一次 `Cannot update a component (DocumentTitleOwner) while rendering a different component (HeroUI.ProgressCircle)`；测试成功不作为该警告不存在的证据。
- V3-D1 独立只读诊断完成：标题更新的显式注册位于 effect、ProgressCircle 本地组合无直接更新标题路径，相关源及依赖未变；但不能证明其为基线问题。归因尚未确定。
- V3-D2 追加有界诊断验证：operationKind=验证，owner=主代理，沿用 V3 相同三个 spec、三个浏览器、无头及工具入口，参数增加 `--workers=1 --trace=on`，日志写系统临时文件 `/tmp/codex-gui-retry-e2e-diagnostic.log`，trace 为 runner 正常产物。串行是为了把控制台警告定位到具体测试；无源码或协议改动，不降低断言。持有同一 runner/cache/端口写锁；完成后分类复现结果，再确定是否有本轮根因可修正。
- V3-D2 完成：81/81 通过，4.6 分钟，串行三浏览器未再次记录该 React 警告。现有证据无法定位发生用例或更新调用栈；保留一次观察及归因未定的限制，不宣称基线问题，也不据此修改范围外模块。正常 React 错误检查和断言均未关闭。

## 最终验收分类与汇合

- Level 1：计划内自动化全部通过。CI 为 1148 unit＋5 smoke；有界 Browser 为 936 parallel＋30 sequential；E2E 为 81 场景通过，额外串行诊断同样 81 场景通过。
- Level 2：未执行。当前完整 GUI URL、真实失败场景和授权业务测试对象未提供；无可用 launch_gui 工具，不猜测入口、不运行后端。自动化为 mock/harness 环境，不能替代真实运行验收。
- Level 3：不适用，未打开可见窗口。
- R/Rc 及本轮修正均已闭环；E2E 中一次未复现 React 警告仍归因未定。实现与自动化完成，不声明完整真实 GUI 验证完成。
- A 汇合完成。验证源码集合为 T0–T7 实际 48 文件，其路径＋字节组合 SHA256 为 `688105b5dd3327eda2c5b5306d9a5874d669a5174d1f1598617ba648e1e9dbbc`；后续仅 stage/commit 与执行记录，不变更已验证源码。

## 本地提交与调度终态

文档前置提交：`356b976fb`。每个 S/C 对独占 index/HEAD，检查 ignore、staged allowlist 和 diff 后独立提交；无交叉暂存、amend、squash、远程或临时兼容层。

| 任务 | Commit | 内容 |
| --- | --- | --- |
| T0 | `cdf3efb25` | feat(gui): unify retry action button presentation |
| T1 | `50ace3efe` | fix(gui): retain history failures during retry |
| T2 | `eab3f1248` | fix(gui): preserve task retry state and failure feedback |
| T3 | `8af454f7c` | fix(gui): retain skill errors while retrying |
| T4 | `6dd7c4647` | fix(gui): stabilize creation and pending recovery actions |
| T5 | `ba0eda4c1` | fix(gui): retain compaction failure during retry |
| T6 | `ceaf271ab` | test(gui): cover retry behavior across entrypoints |
| T7 | `fcc694a9a` | chore(gui): update retry action translations |

最终产品源码身份：`fcc694a9a`。T8 为本执行记录的独立提交；不把自身 commit hash 写进文件形成循环引用。未新增纯顺序调整任务；没有产品布局重排。

- 实际并行：E1–E5 五条编辑分支；已发布合同后的 E6 集成与剩余分支；R 与翻译生成；T0/T2/T3/T6 有界修正。均有不相交写集合或稳定读产物。
- 关键路径：文档提交 → 共享按钮 → 当前任务/历史导航完成 → 集成 → 格式/翻译/审查修正 → CI → Browser → E2E及一次警告诊断 → 独立任务提交 → 执行记录。
- 未启动 ready 节点：V2 sequential、V3 曾因同一工作树 runner/cache/端口锁等待，前项完成即执行，最终无遗留 ready 节点。F 在历史导航修正期间等待相交文件锁。Level 2 的前提未满足，属于未就绪验收，不是遗漏 ready 节点。
- 无安装、后端构建、可见窗口或 Git 远程操作。项目外没有主动持久修改；诊断日志为系统临时文件，测试 trace 为正常 runner 产物。
