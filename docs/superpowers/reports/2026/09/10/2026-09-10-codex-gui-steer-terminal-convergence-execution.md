# QR-B09-004 实施与验证记录

日期：2026-09-10。工作目录：`/Users/jiangsheng/cnb/codex`，分支：`dev`。

设计：[设计规格](../../../../specs/2026/09/10/2026-09-10-codex-gui-steer-terminal-convergence-design.md)。计划：[实施计划](../../../../plans/2026/09/10/2026-09-10-codex-gui-steer-terminal-convergence-plan.md)。

结论：计划范围内的实现、持久化迁移、独立审查及修正已完成并提交。CI 和本问题定向回归通过。额外完整 Browser Mode 套件仍有焦点可见性用例在三个浏览器中失败，单独复测也失败；真实运行验收未执行。不能宣称完整验证或全量测试全部通过。

## 授权与边界

- 用户“确认，开始实现”及 implement 明确授权按设计、计划实施、验证、审查并提交当前分支；承接历史数据规则及选择 A。
- 先提交设计与计划，再执行两项产品任务。主代理是唯一文件编辑、运行记录、Git index 和本地提交 owner。
- 修改仅位于计划白名单。未修改 Rust、TUI、依赖、协议生成物、界面文案、焦点测试或焦点样式；没有安装、后端构建、可见窗口、worktree 或远程操作。
- 规范和规格审查由两个只读子代理执行；禁止它们编辑、运行测试、Git 写入和继续委派。迁移 owner 闭包另有一次只读核验。
- Tracker 未配置，本轮未创建、发布或关闭 tickets；配置需通过 `/setup-matt-pocock-skills`。

## 实现结果

合法 accepted 在 claim 和目标匹配后检查原目标终态。已关闭目标立即释放 pending，并按既有 rejection batch 与 intent 次序归位。队列补齐下一次 start 或 steer 调度，仍受当前 turn、未知交付、恢复区、编辑和持久化屏障约束。

closedTargets 保存唯一的 automatic/manualRecovery 处置，并通过既有 export、rehydrate、fork/adopt 和事务链保存。本地停止后的晚到确认进入手动恢复。只转移本次收敛的消息 ID；之前已点击继续发送的内容不会被再次收回，后来确认的内容仍需再次操作。

已有恢复区通过 queue 的统一合并操作保持一个恢复 batch。start 未接收消息保留为普通恢复内容；steer 未接收 transfer 保留原能力及恢复路径；rejected transfer 先按已有排序恢复，再精确取走形成合并 owner。序列化校验覆盖这些 owner 和 knownMessageIds，不靠丢弃身份或绕过校验完成合并。

queue payload 升至 version 2，通用 envelope 与 coordinator 外层仍为 version 1。旧格式只在解码边界补足缺失的目标处置，不推断 local/nonLocal、不在 codec 中把 issuing 改成 unknown。真正恢复时按原规则处理交付未知；snapshot 先按精确 client ID 匹配 pending 的 commit，再把已关闭目标上未提交的 accepted 转入手动恢复。旧 transfer 继续使用原 owner，所有目标记录保留。成功后只写新格式，非法记录显式失败，临时存储失败不覆盖原数据。

## 提交

| 提交 | 交付 |
| --- | --- |
| `2310eab38` | 独立提交确认后的设计与计划 |
| `87772d18e` | 当前消息终态乱序收敛、本地停止恢复合并及回归 |
| `9d50a52ee` | 旧格式迁移、混合恢复 owner、snapshot 排序及回归 |
| `ec67361e3` | 独立审查发现的 pending interrupt/recovery 冲突修正，以及新测试 lint 修正 |

调查与审查起点为 `4368fba1bc165738ae6c1cfcaf1c2a617cbcc8de`。最终代码为 `ec67361e30f8002fc3bbb76f202e5290435ddaa1`。本报告独立提交，未 amend 任一已有提交。

## 执行图与失败吸收

所有节点继承确认计划的最小能力信封，grantSource 为本轮明确实施授权；执行者、读写范围与副作用按实际节点收窄，操作结束即释放锁。没有向只读代理下放写入能力。

| 节点 | 运行结果与稳定证据 |
| --- | --- |
| D0/D1 | 完成；两份文档经过 staged 检查，形成 `2310eab38`，解锁实现 |
| R1/V1/E1 | 完成；首条 coordinator 回归精确失败于 late accepted 后 guidingCount 仍为 1；修复后通过。随后本地恢复三种状态先红后绿 |
| T1/S1/C1 | 完成；124 条定向 unit、三浏览器应用恢复测试与类型检查通过，提交 `87772d18e` |
| R2/V2/E2 | 完成；旧格式解码先精确报 version/owner 错误，再加入迁移；混合 recovery 和旧 rejection batch 次序分别通过红绿验证 |
| T2/S2/C2 | 完成；定向 unit、旧格式启动 Browser Mode、类型和格式检查通过，提交 `9d50a52ee` |
| F1 | 完成；Standards 与 Spec 两轴并行审查固定提交；Spec 的一个 P1 经修正和限定独立复核闭合 |
| F2 | 完成计划入口；最终 CI 通过，完整并行 Browser Mode 包含本问题所有应用回归并通过 |
| F3 | 已核验条件并记录缺口；无当前完整 GUI URL，工具目录中无 launch_gui，真实场景未执行 |
| 修正节点 | 新增条件断言、空回调及 async lint 修正；新增 restore/projection 两入口的 interrupt 冲突回归，精确红灯后修复并另提交 |
| 额外完整 Browser Mode | 已执行；并行部分通过，顺序部分 3 条焦点断言失败。限定单文件复测及只读源码、diff、截图诊断完成；未擅自扩大焦点代码写范围 |
| J1 | 已汇合：实现与计划入口通过，完整套件和真实验收的缺口单列，不用局部通过覆盖失败 |
| L1/L2/L3 | 本执行报告落盘，范围和 staged 内容检查后独立本地提交 |

实际并行：迁移闭包只读核验与主代理实现前阅读重叠；F1 两个独立审查与第一次 F2 CI 重叠；P1 的限定复核与修正后 CI 重叠。实现期间保持相同源码读写互斥，审查消费固定提交；Git index 始终由主代理独占。

关键路径：文档提交 → 当前消息回归与实现 → 历史迁移 → 审查/CI 汇合 → P1 与 lint 修正 → 最终 CI → 完整浏览器验证及失败诊断 → 执行报告。

未立即启动的 ready 节点：完整浏览器运行等待同一 `codex-gui` 浏览器 runner 上的 CI smoke 结束。其余无未说明的等待；01/02 的串行来自格式、owner 稳定产物依赖与相同文件写入，不来自任务编号。

失败处理：前两次 CI 分别停于新测试 conditional expect 和 ESLint 规则，未进入全量测试；保留断言内容并修正后第三次 CI 全部通过。ESLint 对这些规则无自动修正，限定文件 `--fix` 返回相同错误后才手工修正。没有忽略、跳过、降级、基线修改或放宽断言。

## 验证结果

命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`，使用用户 fnm 的 Node v24.17.0 / pnpm 10.34.5；所有浏览器入口为 headless。项目全目录 formatter fix 会超出白名单，因此普通源码格式化使用限定路径的原生 oxfmt，随后用 check 验证。

| 验证 | 结果 |
| --- | --- |
| coordinator / queue / codec / persistence 定向 unit | 通过；覆盖终态先到、local 三种恢复状态、选择 A、completed/interrupted/failed、commit/unknown/mismatch、存储回滚、旧格式四阶段、merged start owner、混合 recovery 和 interrupt 共存 |
| `pnpm run type-check` | 通过 |
| `pnpm run ci` | 最终通过；validator、oxfmt、oxlint、ESLint、type-check；99 个 unit 文件、1,241 条测试通过；3 个 smoke 文件、5 条测试通过 |
| `pnpm run test:browser:parallel src/__tests__/AppPendingInputRecovery.browser.test.tsx` | 三浏览器、15 条通过；含晚到 accepted 可见恢复及旧格式启动手动恢复 |
| `pnpm run test:browser` 并行部分 | 171 个浏览器文件实例、1,530 条测试通过，无类型错误 |
| 同上顺序部分 | 21 个文件实例/45 条通过；3 个文件实例/3 条失败，均为 composer-focus 的同一断言 |
| 单文件 `pnpm run test:browser:sequential src/__tests__/sequential/composer-focus.browser.test.tsx` | 三浏览器再次失败于第 155 行，无类型错误 |
| `git diff --check` / staged check | 通过；仅暂存各次明确文件范围 |

### 顺序浏览器失败的证据边界

失败位于 `src/__tests__/sequential/composer-focus.browser.test.tsx:155` 的 `hasUnclippedFocusPaint` 轮询。此前输入内容及焦点归属断言已通过。截图显示面板焦点环触及左右视口边缘；测试只设置 `paddingBlock`，`.task-bottom-shell` 只有下方 padding。测试、ComposerTurnControl、ComposerEditor、相关 fixture 与 `src/index.css` 相对实施起点均没有变化。

本轮没有运行基线版本对照，也没有给该失败添加插桩，不能将“相关文件未改”表述为已证明基线运行失败，或将三浏览器稳定失败称为偶发。焦点布局/测试的修正超出本计划源码白名单；本轮保留失败和截图，不修改该测试、不放宽断言，不据此宣称整个 Browser Mode 套件通过。

### GUI 验收等级

- Level 1：本问题定向与完整并行 Browser Mode 通过；额外顺序套件仍有上述焦点失败。
- Level 2：真实恢复交互与完整 Guardian 竞态均未执行；缺当前完整 URL，且没有 launch_gui 工具。未猜测 URL、制造后端拒绝或改写真实用户存储。
- Level 3：不适用；没有打开可见浏览器或桌面窗口。

## Standards

独立审查固定范围 `4368fba1b...9d50a52ee`，0 项需修正规范问题。协议和 fixtures 使用权威来源；修改位于白名单；没有混入代码重排、双运行模型或检查豁免。工具检查结果单列，不以审查意见替代。

## Spec

独立审查发现 1 项 P1：snapshot 先把旧 accepted 转为 userStopped，随后 pending interrupt 结算仍拒绝已有非 steer recovery，导致事务抛错。已在 `ec67361e3` 修正，两个恢复入口的正式回归先精确复现异常，再验证消息完整、无自动发送、持久化往返及发送顺序。原审查代理的限定复核确认闭合，未发现修正引入的新问题。

最终未闭合的计划内审查问题：0。额外完整浏览器失败及真实运行验收缺口保留如上，不自动扩展为新的修复任务。
