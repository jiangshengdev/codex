# Codex GUI 投影恢复执行记录（QR-X03-002）

日期：2026-09-09。状态：实现、追加测试修正、最终自动化验证及独立审查完成。功能已独立提交 `c80233091`；本记录为独立报告提交。真实 Level 2 未执行，不宣称完整真实环境验证。

## 依据与授权

- [设计](../../../../specs/2026/09/09/2026-09-09-codex-gui-projection-recovery-design.md)
- [计划](../../../../plans/2026/09/09/2026-09-09-codex-gui-projection-recovery/plan.md)
- [功能 ticket](../../../../plans/2026/09/09/2026-09-09-codex-gui-projection-recovery/01-recover-current-task.md)
- 用户本轮通过 implement 明确确认开始实施与本地提交；当前工作树为 `/Users/jiangsheng/cnb/codex`，分支 `dev`，初始代码基线 `5dc0905db`。
- 设计、计划、ticket 已先独立提交：`555bf6c0b`（`docs: plan current task projection recovery`）。功能提交为 `c80233091`（`fix(gui): explain projection pauses and restore task sync`），精确包含 36 个获准文件。没有远程操作、安装、后端构建、可见浏览器或项目外主动修改。

## 已实现结果

当前任务同步暂停时显示三种原因和恢复入口；pending 保留旧错误与诊断，按钮显示“正在恢复…”，失败后仍为“恢复同步”。仅替换对应连接/任务的订阅，保留 live、composerRole、instanceId、草稿、队列和 retained 未保存编辑。固定历史错误继续显示，当前 live 通用提示由页面接管。

队列立即冻结自动发送。恢复通过持久化事务核对 pendingFacts、pendingDraft、快照及候选事件，明确区分 committed/blocked；保存失败不推进该批外部 owner。unknown、restoredPaused、独立 recovery 和停止请求归属屏障仍保留。压缩保留无关联请求；status 丢弃旧查询并使旧 waiter 跟随新代次。

## 范围确认前的执行图与实际调度

主代理独占 Git index/HEAD、生成器、格式入口、runner 及本记录。编辑代理不操作 Git、不运行 runner、不继续委派。所有节点使用当前同一工作树，无 worktree 创建或集成操作。

| 节点 | 开始与完成事件 | 当前结果与锁 |
| --- | --- | --- |
| P0s/P0c | 工作区只含三份工作文档，核验后完成 `555bf6c0b` | 完成，Git 锁释放 |
| C | 文档提交后发布最终恢复合同和队列接口 | 完成，合同稳定；后续 nullable 追加事务为计划内修正 |
| Q | C 发布后与 A/U 同时启动；11:44 首红灯，11:52 首批绿灯，后续 stop/recover 屏障修正 | 队列实现代理完成，五文件锁已释放 |
| A | C 发布后并行；11:45 status 红灯，11:46 首绿灯；11:54 扩展 owner 回归通过 | 辅助状态代理完成，六文件锁已释放 |
| U | C 发布后并行；11:46 发布页面稳定产物 | 页面代理完成；后续 lint 修正于 12:24 前释放锁 |
| L | 消费 Q/A 稳定接口后接线；11:52 member/live 首绿灯，12:14 审查修正回归通过 | 主代理完成，源码稳定 |
| I | L/U 接线稳定后启动；12:02 App/Sessions 33 项绿灯；后续 retained/布局测试完成 | 验收代理完成；遗漏文件没有擅自修改 |
| F/G | 全部编辑释放锁后格式化、提取与翻译；修正后重复执行 | 完成；完整输出限两个 PO，最终重复提取哈希相同 |
| R/Rc | F 后 Standards/Spec 两轴并行；G 同期独立进行，审查不读 mutable catalog | 三项发现已修复复核；最终 catalog 审查通过 |
| V1 | 12:25 运行 CI | 协议、格式、lint 通过；type-check 因两处待授权 fixture 失败 |
| V2 | 12:25:59 开始 parallel，随后 sequential | parallel 639/642；三个失败是同一待授权旧断言的三浏览器实例；sequential 9/9 |
| V3 | 12:27 后执行三 spec | 54/54，含恢复、宽窄屏、键盘、多任务和持久化 |
| V4 | 核查真实验收条件 | 当前 URL、真实测试对象及合法触发条件未取得，Level 2 未执行；Level 3 不适用 |
| J/S1/C1 | 等待三处范围授权与最终门禁通过 | 尚未执行，不提交未通过门禁的功能 |
| D-checkpoint | 独立验证已完成但授权待定后，新增本记录检查点 | 主代理记录现状；D 最终更新及 S2/C2 仍等待功能提交 |

实际并行是 Q/A/U 不相交编辑，以及 R 两审查轴与 G 的独立工作；L 等 Q/A 的稳定接口，不等无关步骤。runner 共享缓存/tsbuildinfo/端口，因此串行使用。未启动的剩余节点均依赖范围授权或最终门禁，无因编号或空闲代理而暂缓的 ready 节点。

有一次 lint/局部 Browser 与 U-fix 的写入时间交叠，相关局部结果不作为最终证据；随后全源码冻结后重新执行 CI 前置门禁与完整有界 Browser，以上表格使用后者结果。

## 审查发现与修正闭环

1. Spec P1：发布期间追加候选事件经无返回的普通事实入口处理，保存失败仍返回 recovered。新增公共 member 回归先复现，再使追加批次经同一 `reconcileProjection(null, facts)` 事务，committed 后才推进该批 owner/readmodel。
2. Spec P2：核对副作用期间候选 closed 未在发布前重新检查。新增 storage 写入期间通知关闭的回归先复现，再在切换前循环排空、验证和保存候选，失败保留旧正文基线。
3. Standards：live 手写了恢复状态合同。改为从 `LiveActiveThreadSessionSnapshot` 机械派生。

两项 Spec 修正后 62 项相关 owner 回归通过，独立复核无新阻断。队列增量回归另发现停止请求归属未定时可能提前发送、独立 recovery 可能释放 deferred start，均在本计划发送保护范围内修正，未放宽断言或关闭检查。

## 范围确认前的验证证据

所有 pnpm 命令 cwd 为 `codex-gui`，使用 `/opt/homebrew/bin/fnm exec --using-file pnpm`。Node v24.17.0、pnpm 10.34.5 来自用户 fnm。三浏览器 executable 已存在；E2E 使用既有 5173 服务，已核验进程 cwd 与 Vite 路径属于当前工作树，没有接管或重启该服务。浏览器全部无头，`PLAYWRIGHT_HTML_OPEN=never`。

| 入口 | 实际结果 |
| --- | --- |
| `pnpm run test:unit` | 97 文件、1172 测试全部通过（12:24:13，4.90s） |
| `pnpm run ci` | protocol:check-validators、format:oxfmt、lint 均通过；type-check 的两处测试 fixture 缺新方法，未通过；CI 后继未执行 |
| 计划列出的 Browser parallel 文件/目录 | 78 浏览器文件实例，639 通过、3 失败，共 642；唯一失败源是 Messages 旧提示断言 |
| 计划列出的 Browser sequential 两文件 | 6 浏览器文件实例、9 测试全部通过 |
| `pnpm run test:browser:smoke`（独立执行） | 3 文件、5 测试全部通过，不替代 CI 类型门禁 |
| 三个 E2E spec | 54 测试全部通过（37.6s） |
| `git diff --check` | 通过 |
| Lingui 重复 extraction | 298 消息，中文缺失 0；两文件 SHA-256 前后相同 |

E2E spec 为 `e2e/projectionRecovery.spec.ts`、`e2e/multiSession.spec.ts`、`e2e/persistence.spec.ts`。恢复 spec 覆盖 1280/390 视口下按钮右侧/下方布局、无水平溢出、键盘触发和 pending 防重复；这些是 Level 1，不能作为真实 Codex Level 2 证据。

catalog 完整 diff：新增 11 条功能消息及对应准确 translator comments，既有翻译未修改，其余变化仅 source reference 行号；无新增 fuzzy/obsolete。原有 obsolete Retry 保持不变。

```text
en.po    1378fdd3e5616e0ffeb4d46fa62376aaf83374bf6ec5392c9597614be282d9b4
zh-CN.po 23cbea793fedce009cb46fb3360e9b6bc7a40147a48609821cfb82779a42091a
```

## 追加范围与授权闭环

计划遗漏以下三个直接消费者。用户随后明确回复“确认”，授权将这三文件纳入本次最小修正；I-fix 已完成修改：

| 文件 | 必要的最小改动 | 当前失败证据 |
| --- | --- | --- |
| `codex-gui/src/__tests__/AppActiveThreadSession.browser.test.tsx` | 在手写 coordinator fixture 补 typed `setProjectionUnavailable` mock，以及 `reconcileProjection` 返回 committed 的 mock | type-check :223 及其消费者缺方法 |
| `codex-gui/src/__tests__/smoke/AppThreadSwitch.smoke.browser.test.tsx` | 同上，补新队列合同 fixture | type-check :180 及其消费者缺方法 |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceMessages.browser.test.tsx` | 将 live 正文旧通用提示的断言改为不显示，并更新测试名称；fixed 保留验证已在计划内 Sessions 测试补齐 | :589 旧 `.toBeVisible()` 在三个浏览器失败 |

只涉及测试消费者，不改变已确认产品行为、不删除测试、不跳过门禁。两个 fixture 从权威 coordinator 合同派生 mock 类型；Messages 保留暂停事实注入并验证 live 不重复显示通用提示。fixed 历史提示覆盖仍保留。真实 Level 2 的缺口仍须如实保留。

确认来源：`managing-work-stages/references/stage-gates.md` 的明确规则“实施需要计划外文件、交付物：更新计划并等待确认”。本记录仅保存动态执行现状与待确认范围，不改写已提交的历史计划正文。

## 确认后的动态节点

以下节点继承计划第 6 节的执行上下文、负面约束、单一 owner、失败域与生命周期；grantSource 为原实施确认及用户对上述三文件的最新“确认”，authorizationGate=active。canonical root 为 `/Users/jiangsheng/cnb/codex`，分支 dev；不创建工作树。无额外 special approval，无继续委派能力。各能力在节点完成时到期。

| nodeId / taskBoundary | operationKind / owner / estimatedCost | hardPredecessors、consumes 与 outcome | readSet / writeSet / stateEffects / commandScope | completionEvidence、锁与失败域 |
| --- | --- | --- | --- | --- |
| I-fix / T1 | 编辑 / 原验收代理 / 小 | 用户范围确认与失败日志 → 三文件适配 | 三文件及直接合同/测试只读；只写上述三文件；普通源码 patch | 12:36 后发布完整最小 diff，释放三文件写锁；失败仅影响最终门禁 |
| F-fix / T1 | 格式化 / 主代理 / 小 | I-fix 稳定 diff → 格式稳定源码 | GUI 读写；项目 `format:oxfmt:fix` | 已完成，无范围外变化；释放 GUI 写锁 |
| R-fixture / T1 | 审查 / 原 Standards 审查代理 / 小 | F-fix → 增量独立审查 | 三文件、直接合同及页面/fixed 对照测试只读；无写入、无 runner | 通过：类型权威派生、页面真实覆盖与 fixed 覆盖保留；只读锁释放 |
| V1-final / T1 | 验证 / 主代理 / 中 | F-fix → CI 最终证据 | GUI 与 schema 输入只读；`pnpm run ci`，仅正常 runner 产物 | CI 全通过；与 R-fixture 并行，独占 runner |
| V2-final / T1 | 验证 / 主代理 / 中 | F-fix → Browser 最终证据 | 原计划 parallel 范围追加 AppActiveThreadSession；仅正常 runner 产物 | 81 文件实例、672 测试通过，无类型错误；runner 锁释放 |

R-fixture 和 V1-final 在同一稳定源码上并行。V2-final 因同一 GUI runner/cache 与 V1-final 的写冲突串行，CI 结束即启动。此次仅追加三测试文件；原 V2 sequential、V3 E2E 的产品和测试输入未改变，既有通过证据继续有效，无理由不重复运行。J 随最终 Browser 结果汇合，S1/C1 与 D/S2/C2 仍按原提交边界执行。若失败，暂停对应消费者并按现有授权吸收修正；范围或产品变化才触发重编授权。

## 最终结果与提交闭环

- V1-final：`pnpm run ci` 退出 0。协议校验、oxfmt、lint、type-check 全通过；unit 97 文件、1172 测试通过；smoke 3 文件、5 测试通过（12:37:31）。
- V2-final：原计划 parallel 命令追加 `src/__tests__/AppActiveThreadSession.browser.test.tsx`，81 浏览器文件实例、672 测试全部通过，Type Errors 为 no errors（12:37:50，37.22s）。
- 继续有效的先前结果：sequential 9/9，三 spec E2E 54/54；两 catalog 重复提取稳定。此次追加测试未改变这些输入。
- R-fixture：独立审查通过，原核心及 catalog 审查闭环保持有效。没有删除覆盖、豁免或跳过门禁。
- J/S1/C1：最终汇合完成，`git diff --check` 与 staged check 通过；全部 36 文件未匹配 ignore，精确暂存后独立功能提交 `c80233091`。无无行为顺序调整混入。
- D/S2/C2：主代理更新并独立提交本报告；历史设计和计划不回写。全部必需实现与自动化节点已完成，无等待授权或未处理失败。
- Level 2 未执行：缺当前完整 GUI URL、真实测试对象与合法暂停触发条件；Level 3 不适用。此限制按计划单独记录，不用自动化冒充真实验收。

最终并行证据为 Q/A/U 不相交编辑、R 两轴与 G、R-fixture 与 V1-final；最终验证共享 runner 按锁串行。剩余提交节点具有真实稳定产物依赖，不存在被无依据延迟的 ready 节点。
