# 第一组连接恢复 Story 实施计划

日期：2026-09-13

阶段：任务拆分已确认，计划落盘；实施节点尚未授权执行。

## 依据与目标

设计依据：[连接恢复 Story 设计](../../../../../specs/2026/09/13/2026-09-13-codex-gui-storybook-connection-recovery-design.md)。

交付直接复用 `ConnectionRecoveryNotice` 的第一组完整业务 Story：四种独立状态，以及确定成功、确定失败的可操作演示。所有模拟限于预览，不连接真实后端，不发送消息，不修改产品恢复策略。

用户已确认两个 ticket 相互没有阻塞依赖；分别实现、验收与提交，最后汇合验证。不进行组件搬迁、依赖变更、产品主题入口开放或全量错误目录建设。

## 任务与修改边界

| 任务 | 阻塞依赖 | 可演示交付 | 独立文件范围 |
| --- | --- | --- | --- |
| [01 独立状态](issues/01-connection-recovery-states.md) | 无 | 启动失败、连接中断、重连中、重连失败及诊断弹窗 | `codex-gui/src/storybook/ConnectionRecovery.stories.tsx`；`codex-gui/e2e/storybookConnectionRecovery.spec.ts` |
| [02 交互演示](issues/02-connection-recovery-interactions.md) | 无 | 点击后等待、成功移除提示或再次失败、重试、重置与隔离 | `codex-gui/src/storybook/ConnectionRecoveryInteractions.stories.tsx`；必要的同目录 `ConnectionRecoverySimulation.tsx`；`codex-gui/e2e/storybookConnectionRecoveryInteractions.spec.ts` |

两项各自消费现有组件及 props 权威类型，不从另一项导入 fixture 或新增模拟模型。独立状态作为固定预览输入，交互演示的局部状态由其唯一模拟容器持有；这不是产品旧新实现并存。产品组件源码与已有 Environment Story 不在修改范围。

HeroUI 沿用产品的 Alert、Button、Spinner、Modal 组合及现有变体。若交互演示需要重新开始按钮，使用 HeroUI Button 和有语境说明的 Lingui 消息。成功仅移除恢复提示，不新增产品成功提示。不得复制组件内部 JSX、业务文案或连接协议类型。

## 可执行性与验证

已核对现有 `test:e2e` 为 `playwright test`；Playwright 配置以无头模式运行 Chromium、Firefox、WebKit，并通过 webServer 启动 Vite 与 Storybook。实施时重新确认 fnm 的 Node/pnpm 来源、已安装依赖及浏览器、端口对应服务和实际测试收集；不得安装、下载浏览器或用历史测试结果证明当前版本通过。

以下命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`。新测试文件必须先存在并确认被收集。

- 任务 01：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookConnectionRecovery.spec.ts`。
- 任务 02：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookConnectionRecoveryInteractions.spec.ts`。
- 最终静态检查：`/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`、`/opt/homebrew/bin/fnm exec --using-file pnpm run lint`、`/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`。
- 最终构建：`/opt/homebrew/bin/fnm exec --using-file pnpm run build-storybook --disable-telemetry`。
- 最终聚焦回归：同一 `test:e2e` 调用传入两个新增文件及已有 `e2e/storybookRendering.spec.ts`，验证集成后的业务 Story 与共享渲染环境。任务验证已覆盖最终相同稳定内容时可复用证据，集成或修正使证据失效时才重跑对应范围。
- 格式修复优先项目 Oxfmt 入口，执行前核实其文件过滤能力，限定本次文件；现有全目录 fix 会超范围时采用工具链允许的精确文件入口，不顺手格式化其他文件。

测试通过用户可见文案、角色、按钮状态、弹窗、焦点和几何判断结果，不锁定局部状态变量或定时器实现。确定等待阶段须可被可靠观察，不能靠随意 sleep 断言成功。失败演示支持重复重试；重置和切换期间的未完成回调不能污染新状态。无业务 WebSocket 或消息副作用是验收项，开发服务自身的 HMR 连接不应被误判为业务连接。

以现有环境覆盖中英文、浅深色及窄容器，不机械枚举全部参数组合。Level 1 适用并要求通过；Level 2、Level 3 对本轮仅新增隔离 Story 不适用。本轮不替代上一轮尚缺的真实产品验收，也不声明验证真实会话恢复。若必须修改产品交互，暂停受影响范围并重新确认。

## Lingui 生成边界

真实产品文案直接复用。新增演示控制文案时，权威入口为 `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`，输入是现有 Lingui 配置包含的 `src`，完整输出为 `codex-gui/src/locales/en.po` 和 `codex-gui/src/locales/zh-CN.po`。先提取，再人工补译，再重复提取确认稳定；禁止手工模拟提取结果。

目录由主代理独占写入。任务 01 不新增消息，只使用现有组件与无敏感诊断数据；新增演示控制消息归任务 02。提取会合法更新其他源码引用元数据，必须审查完整 diff，保留已有消息语义。超出输出边界、无关语义漂移或重复提取不稳定时先诊断，不通过删消息、改基线或放宽检查解决。

## 执行图契约

采用 `.codex` 项目约束及全局 `delegating-micro-stages` 的执行图契约。下列默认字段与节点表共同构成节点记录；运行时在执行上下文维护实际状态，不回写本计划。

- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` 工作树和 `dev` 分支；当前 index 为 `/Users/jiangsheng/cnb/codex/.git/index`，执行前再核验。不创建分支或 worktree。
- `authorizationGate`：当前实现、验证、stage、commit 节点均为 pending；本次确认只授权计划文件落盘。后续实施授权由 action-authorization 按节点形成最小能力信封。
- `owner`：主代理负责共享目录、验证协调和唯一 Git index 写入；可将 02-edit 的不相交源码与测试编辑委派给一个子代理，主代理推进 01-edit。审查由未参与对应编辑的代理完成。子代理不得 stage、commit 或改写共享语言目录。
- `subdelegation`：false。
- `estimatedCost`：调查和 Git 节点小；编辑、验证与审查中；02 的交互与隔离验证预计为较长分支。成本不作为停止条件。
- `deferralEvidence`：无预设暂缓。发生真实资源冲突时按锁排队，不添加业务依赖边。
- `readSet`：当前设计、计划、适用规则、所属任务文件、现有产品组件和权威类型、Storybook 与测试配置、既有相关测试。
- `writeSet`：编辑只写任务表范围；生成/补译只写两个语言目录；格式仅任务文件；验证仅正常缓存、构建和测试产物；stage/commit 仅明确文档或任务 allowlist 与本地 Git 状态；调查、审查和 fan-in 不写文件。
- `stateEffects`：对应节点的单一动作及已授权程序正常自动产物，不由编辑推导安装或其他外部操作。
- `commandScope`：只读 rg/cat 与 Git 状态/diff；普通源码 patch；上述项目检查、生成和格式入口；明确路径的 `git add --` 和新的本地 commit。禁止 remote、force、amend、忽略文件暂存、安装、后端构建与可见浏览器。
- `resourceLocks`：任务表中的 canonical 源码路径分别写锁；语言目录提取期间锁定两个目录及其生成输入，等待另一编辑分支源码稳定；检查期间冻结所消费的源码。测试端口 localhost:5173/6006、`codex-gui/test-results`、`codex-gui/playwright-report`、`codex-gui/storybook-static` 按使用阶段独占写；Git index 与 dev 引用由主代理独占写。
- `verification`：对应 ticket 外部行为验收与上述固化入口；实际收集的目标全部通过，零测试不算成功。提交需检查普通/staged diff、精确 allowlist 和 `git diff --check`。
- `failureDomain`：本节点及消费其产物的后继；局部 Story 失败不阻塞另一项编辑。共享生成或环境失效仅传播到实际消费者。
- `replanTriggers`：权威输入失真、必要工具缺失或资源变化时重新核对局部图；新增产品行为、外部写入或安装需求需用户处理。计划内实现问题继续修正与复验，不弱化测试，不加入 fallback。

表中 T 分别实例化为 01、02。每个模板节点有唯一 ID，任务编号不产生额外依赖。

| nodeId | taskBoundary | operationKind | hardPredecessors / 原因 | outcome / produces | consumes / completionEvidence |
| --- | --- | --- | --- | --- | --- |
| P | 无 | 调查 | 无 | 当前基线和授权预检 | 配置与文件；可执行证据 |
| D-stage | 文档 | stage | P，确认文档范围 | 四份文档 staged 快照 | 设计、计划、两个 ticket；diff 检查 |
| D-commit | 文档 | commit | D-stage，消费 index | 独立文档提交 | 明确 commit id |
| T-edit | T | 编辑 | D-commit，实现前文档门禁 | 本任务 Story 和测试 | 现有组件；稳定源码 diff |
| 02-extract | 02 | 生成 | 02-edit，消息输入稳定 | 提取目录或无需提取证据 | 完整目录 diff；提取成功 |
| 02-translate | 02 | 编辑 | 02-extract，消费消息 | 新消息完整翻译 | 翻译 diff 审查 |
| 02-stability | 02 | 生成 | 02-translate，检验完整目录 | 重复提取稳定证据 | 再提取无漂移 |
| T-format | T | 格式化 | 01 使用 01-edit；02 使用 02-stability | 规范化本任务文件 | 限定范围格式结果 |
| T-verify | T | 验证 | T-format，消费稳定源码 | 本任务外部行为证据 | 对应测试通过 |
| T-review | T | 审查 | T-verify，消费 diff 与证据 | 独立审查结果 | 无未闭合范围内问题 |
| T-stage | T | stage | T-review，消费审查产物 | 精确任务 staged 快照 | allowlist 与 staged 检查 |
| T-commit | T | commit | T-stage，消费 index | 独立任务提交 | commit id 与文件集合 |
| F | 无 | 验证 | 01-commit、02-commit，消费最终状态 | 合并后的静态、构建与聚焦验收 | 实际检查通过与适用层级记录 |
| Z | 无 | fan-in | F，最终证据齐备 | 交付汇总 | 文档、任务及修正提交全部闭合 |

没有新消息时，02 的三个语言节点以只读核验“无新增消息、无需生成”完成，不执行无意义写入。

## 调度、提交与完成

实施授权后初始 ready set 为 P；文档提交后 01-edit 和 02-edit 同时 ready。两项没有共享新增接口或 fixture，允许并行编辑；语言生成、消费全工作树的检查和 Git 写入因真实共享资源串行。任务 01 的提交不阻塞任务 02 编辑，反之亦然。

预计关键路径为文档门禁、较长的交互分支、最终验证和汇总。fan-out 位于文档提交后，fan-in 为 F。两个任务提交的物理先后按就绪与 index 锁确定；每个 ticket 保留独立提交身份，不 squash。文档先独立提交，allowlist 是本设计、本计划和两个 ticket。

本轮计划编写为有界文档动作，由主代理完成；实施并行编辑有不相交产物，独立审查检查未参与编写的另一分支。所有委派须使用单节点最小能力信封，禁止额外继续委派。

修正已提交内容使用新的独立提交。行为变更不混入纯重排，不创建临时双路径或兼容层。最终验收按所有任务与修正集成后的状态判断；已完成的同一内容不重复全量测试。只在当前授权内修正本轮问题，范围外问题单独报告。

结束时报告提交身份、实际验证范围、验收层级、实际并行、关键路径以及未启动 ready 节点及原因。全部必需节点与修正完成后本轮终止，不自行追加下一组 Story。
