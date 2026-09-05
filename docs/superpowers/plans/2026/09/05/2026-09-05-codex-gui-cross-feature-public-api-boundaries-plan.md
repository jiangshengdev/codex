# Codex GUI 跨 feature 公共 API 边界实施计划

日期：2026-09-05

状态：待用户确认；本文件落盘不代表已获实现或提交授权。

设计：[公共 API 边界设计](../../../../specs/2026/09/05/2026-09-05-codex-gui-cross-feature-public-api-boundaries-design.md)。用户已确认设计，并要求落盘计划。

## 目标与范围

将跨 feature 的公开模块、导出名称、消费方向与测试入口变成可执行规则，接入现有 lint，阻止内部越界。保留原领域 owner 和业务行为。

沿用设计范围 A：active-thread/session ↔ thread runtime、Composer editor ↔ input queue 的现有必要接口和方向明确登记、关联原 issue，不在本轮调整契约归属或关闭这两份 issue。登记不是目录豁免，也不自动批准新接口、新消费者或新增方向。

实现采用一个集成任务边界，内部多个不相交编辑节点并行。规则、接口清单与接线共同构成同一检查能力；它们不是需要分别落地的独立产品任务。文档与实现分别提交，已提交内容的后续修正另建提交。

## 计划前证据闭包

| 字段 | 当前证据与计划含义 |
| --- | --- |
| 权威入口 | `codex-gui/package.json` 的 `lint`、`ci`；`.github/workflows/codex-gui.yml` quick job 调用 `pnpm run ci`。新增检查接入现有链，不另建 CI。领域定义仍位于各 feature，协议仍由已有生成源拥有。 |
| 已追踪链路 | `src/App.tsx`、`router.tsx`、`routerComponents.tsx`、`NotFoundPage.tsx`、`app/store.ts` 消费 feature；`src/generated/**` 的 TS 与声明文件消费 `guiHost/appServerProtocol`；两份 AppRouting 测试获取整模块。检查须覆盖这些调用，不能只扫描 feature 目录。 |
| 修改范围 | 新增 `scripts/featureBoundaries/**`，修改 `package.json` 接入检查，收窄两份路由测试中的 namespace/整模块转发。生产 feature 与生成物保持原定义和路径。 |
| 验证映射 | `vitest.config.ts` 收集脚本下 `*.test.ts`；`tsconfig.node.json` 包含 `scripts/**/*.ts`；现有 Browser parallel/smoke 配置分别收集两份目标测试；共享配置显式 `headless: true`。 |
| 排除项 | 不改变 `activeThreadSession`、replay、queue、draft 的状态转换；不改变 DOM、交互或协议生成输入。`src/i18n.ts` 的 locale 动态资源加载不是跨 feature 调用。生成文件只纳入扫描，不改写。 |
| 剩余未知 | 完整符号清单需由实现的统一 AST 分析器复核，当前词法调查不作为自动批准名单。该工作在已知登记范围内；若发现无法在现有 owner 下公开的业务内部能力，暂停对应迁移并返回设计，禁止把它直接加入名单。 |

计划准备时 HEAD 为 `99211083de4f57d08b12953d31c6032437b65442`，分支 `dev`；原设计文档未提交，未发现其他已有变更。执行前必须重新核验工作区和 HEAD，保留后来出现的无关变更。

## 实现结构

### 检查器与登记

新增目录 `codex-gui/scripts/featureBoundaries/`，按职责分为：

- `contracts.ts`：登记格式与检查结果类型，不承载业务契约副本。
- `policy.ts`：显式公共模块、导出名称、领域 owner、用途、允许方向、测试公共接口及已知方向问题关联。
- `analyze.ts`：基于现有 TypeScript compiler API 的模块解析、边界判断与诊断；必要的同职责辅助文件允许留在该目录内。
- `cli.ts`：读取完整输入，执行分析，输出位置明确的错误，违规或登记失效时非零退出；不写报告或自动修复文件。
- `*.test.ts`：检查器行为与 CLI 集成验证，测试数据使用内存源码或系统临时目录，不能给真实仓库注入违规文件。

新增 `lint:boundaries` 脚本，值为 `tsx scripts/featureBoundaries/cli.ts`；将其接入 `lint`，再继续原有 oxlint 与 ESLint；同时在 `lint:fix` 原有修复链末尾执行它，确保自动修复后也核验边界。检查器本身不提供 fix，也不自动改写登记。每次 lint 都执行边界检查，不受 ESLint `--cache` 影响；不新增或安装依赖。

扫描 `src/**` 的 TypeScript 源码与声明文件，包括 `.ts`、`.tsx`、`.mts`、`.cts` 及相应声明形式。由实际文件发现补齐测试、未暂存和新增源文件，不只使用应用 tsconfig 的生产 include，也不只使用 Git tracked 清单。解析采用现有 tsconfig alias 与模块解析规则，记录无法解析的本地访问为错误；第三方包和生成协议的外部权威目标分类处理。

登记校验路径存在、导出存在、owner 合法、生产/测试身份与允许方向一致。新增 feature 默认没有外部访问权限；相同 source/target 的内部调用正常允许。对 feature 外消费者明确区分应用组装、测试工具和生成消费身份，不给整个非 feature 目录万能权限。生产经中间模块引用测试工具仍应被识别，不能只看直接 import。

测试身份覆盖 `__tests__` 中的辅助文件及明确的 `src/utils/test-utils.tsx`、`TestProvider.tsx` 等测试设施，不能只按 `.test.*` 后缀判断。先执行“生产不得引用测试能力”，再执行“同 feature 内部允许”，防止内部访问规则覆盖生产/测试隔离。审核清单时拒绝模块导出通配、消费者通配以及按现有调用自动公开全部 export。

### 语法与绕过边界

检查普通/type-only import、default、具名转导出、星号转导出、namespace、动态 import、import type、静态 require/import-equals，以及测试框架的模块访问入口。解析后按真实目标和公开符号判定，不能只匹配 `@/features/` 字符串。

对整模块访问必须证明可访问成员均符合公开范围，否则要求具名访问；不能靠类型断言、模块 spread 或改成相对路径放行。转导出链需要追踪来源，不能把未公开成员经公共模块重新包装后绕过限制。

对非字面量动态路径，只有能够证明目标范围不进入受治理边界时才判为不适用，例如当前 locale 资源加载；无法确定的跨边界访问报错，不用全局动态 import 豁免。这里是静态架构检查，不声称提供恶意任意代码的运行时沙箱。

`vi.mock`、`vi.doMock`、`vi.importActual` 与 factory `importOriginal` 等访问应校验目标、方向及实际取用成员；测试 mock 不是内部访问特权。合法同 feature spy 与第三方库 mock 保持可用。

### 当前迁移与登记重点

生产模块继续使用现有路径，不新增 barrel 或业务 adapter。应用 store 使用 slice 的 `default` 导出是合理契约，需要明确登记 `default` 及组装消费者。

已有生成文件引用的 `ProtocolValidator`、`RequestResponse` 纳入真实消费身份检查，不修改生成器或生成产物，也不因 ESLint 忽略规则丢失这些边。

跨 feature 测试公共模块候选：

- `activeThreadSession/__tests__/activeThreadSessionHarness`
- `composerEditor/__tests__/composerEditorCompositionBrowserTestSupport`
- `composerInputQueue/__tests__/composerInputQueueTestFixtures`
- `projection/__tests__/projectionFixtures`
- `projection/__tests__/projectionTestBuilders`

按真实用途登记所需 export；这些候选不等于公开整个模块或测试目录。

两份源码编辑目标：

- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`
- `codex-gui/src/__tests__/smoke/AppRouting.smoke.browser.test.tsx`

将 `import type * as ActiveThreadSessionModule` 与 `...actual` 收窄为具名权威类型和明确 mock 工厂成员。使用现有 `CreateActiveThreadSessionInput`、函数的 `typeof` 等机械关联类型；保留真实 factory 调用、controller 注入、全部场景和断言。不复制函数签名，不降低测试覆盖，不顺手重排 import。

## 精确写集合与排除项

执行期代码写集合仅包含：

1. `codex-gui/scripts/featureBoundaries/**`
2. `codex-gui/package.json`
3. 上述两份 AppRouting 测试文件

文档提交仅包含本计划及关联设计文件。执行事件由协调者在会话中维护，不回写已确认计划正文，不新增共享执行日志文件。

不修改 `eslint.config.ts`、tsconfig、锁文件、生成代码、Rust、CI、业务生产代码和 issue。当前配置已经覆盖脚本与测试，无需预先增加配置变更。如果新的证据证明必须越出写集合，先判断范围和授权，不直接修改。

## 执行上下文与提交拓扑

本计划不创建 worktree、不创建分支、不操作远程。执行上下文为 `/Users/jiangsheng/cnb/codex` 的现有 `dev` 与共享 Git index；修改前确认该路径仍指向此工作区。新文件不存在冲突、未被 ignore、当前无 merge/rebase 等未完成 Git 操作后才继续。

文档边界 D：先将关联设计与本计划创建独立本地提交。只 stage 两份文档，不夹带其他文件；该提交成功前所有实现节点等待。

实现边界 I：并行编辑节点汇合、组合验证通过后，由唯一 Git owner 提交精确代码写集合。两个边界均使用新提交，禁止 amend、squash、强制暂存或远程操作。`dev` 的 `codex-rs/Cargo.toml` workspace version 必须保持 `0.0.0`。

同一实现任务内各编辑节点的写集合不相交，因此共享 worktree 无需增加隔离副本。格式化和组合验证会读取或写入这些集合，应等待相关编辑产物稳定；不能一边修改一边把测试结果作为最终证据。

## 描述式 DAG

下列公共字段与节点表共同构成完整节点记录；未覆盖的能力默认不授予。

公共字段：

- `executionContext`：上述主工作区、`dev`、由 `git rev-parse --git-path index` 核实的 canonical index。
- `authorizationGate`：全部执行节点当前为 `pending`，等待用户确认本计划。执行时由 action-authorization 为每个节点形成最小能力信封，grantSource 指向用户的计划确认；不得把本次“落盘计划”当作执行授权。
- `subdelegation`：false；主代理负责调度，编辑、格式化、stage、commit 交给下表唯一子代理 owner。
- `deferralEvidence`：无预设暂缓。共享 index 锁不阻止无 index 操作的独立编辑。
- `readSet`：已确认设计和计划、适用规则、对应节点 consumes 与 writeSet，外加按需只读 `codex-gui/src/**`、配置和现有依赖 API。节点不得通过读取完整 mutable diff 与其他编辑并发。
- `resourceLocks`：每个节点对其 writeSet 取 canonical 文件写锁，对 consumes 文件取读锁；Git stage/commit 另取共享 index 写锁。格式化锁覆盖精确目标集合，验证锁覆盖读取的最终源文件与对应 runner。读取静态配置可以并发。
- `stateEffects`：编辑/格式化只改变各自 writeSet；验证仅允许已授权 runner 的缓存和临时产物；stage 改 index；commit 新增本地提交；审查和汇合无文件写入。
- `commandScope`：调查/审查限只读搜索和本地 Git；普通代码编辑使用原生编辑工具，格式化限下节入口；验证限下节验证命令；stage 限 `git add --` 精确文件，commit 限新建本地提交。
- `failureDomain`：本节点及消费其失效产物的传递后继，非相交分支继续。
- `replanTriggers`：写集合扩大、需要安装、生产语义变化、契约归属需调整、工具/输入缺失或基线失真时重新判断；计划内检查失败先诊断和修正，不自动结束。
- `verification`：编辑节点以交付完整 diff 供任务组合验证为完成条件；格式化由非 fix 检查验证；stage 审查 cached diff；commit 验证提交身份和路径集合。其余节点见表。

| nodeId | taskBoundary / operationKind / owner | hardPredecessors（等待的产物） | consumes → produces / outcome | writeSet | estimatedCost / completionEvidence |
| --- | --- | --- | --- | --- | --- |
| D-review | D / 审查 / 文档 Git owner | 无 | 两份文档与当前 Git 状态 → 可提交的精确文档范围 | 空 | 小；文件内容、ignore、分支状态已核对 |
| D-stage | D / stage / 文档 Git owner | D-review：审查结果 | 两份文档 → staged 文档 | 两份文档的 index entries | 小；cached diff 仅含两份文档且 check 通过 |
| D-commit | D / commit / 文档 Git owner | D-stage：staged 文档 | index → 文档提交 | index/本地 Git 对象与当前分支 | 小；记录新 commit id |
| I-contract | I / 编辑 / 契约节点 owner | D-commit：文档提交门禁 | 已确认设计 → 稳定登记/诊断类型 | `scripts/featureBoundaries/contracts.ts` | 小；类型文件发布后本任务内保持稳定 |
| I-policy | I / 编辑 / 清单节点 owner | I-contract：登记类型 | 当前真实消费与 schema → 经过用途审查的清单 | `scripts/featureBoundaries/policy.ts` | 中；每项 owner、名称、方向、用途可核验 |
| I-engine | I / 编辑 / 检查器节点 owner | I-contract：接口契约 | schema、现有解析器 API → 分析器与 CLI | `scripts/featureBoundaries/**`，排除 contracts、policy、`*.test.ts` | 大；完整诊断能力 diff，入口可供组合测试调用 |
| I-tests | I / 编辑 / 规则测试节点 owner | I-contract：诊断接口 | 设计要求与 schema → 正反例和 CLI 测试 | `scripts/featureBoundaries/*.test.ts` | 中；每项规则有可观察行为断言 |
| I-routing | I / 编辑 / 路由测试节点 owner | D-commit：文档提交门禁 | 当前两份 mock、权威函数类型 → 明确成员访问 | 两份 AppRouting 测试 | 小；原断言及真实调用路径保留 |
| I-wire | I / 编辑 / 接线节点 owner | D-commit：文档提交门禁 | 固定 CLI 路径、现有 lint → package 接线 | `codex-gui/package.json` | 小；不改依赖、不删原 lint 子命令 |
| I-join | I / fan-in / 主代理 | I-policy、I-engine、I-tests、I-routing、I-wire：完整编辑结果 | 不相交编辑 → 稳定组合输入 | 空 | 小；写集合无越界，未引入兼容层或生产语义变化 |
| I-format | I / 格式化 / 实现 Git owner | I-join：稳定源文件 | 组合输入 → 格式化后输入 | 精确代码写集合 | 小；完整 diff 无范围外或纯顺序调整 |
| V-static | I / 验证 / 静态验证 owner | I-format：稳定组合状态 | 最终文件 → lint、类型、格式证据 | 无主动源码写入 | 中；下节静态验证成功 |
| V-unit | I / 验证 / 规则验证 owner | I-format：稳定组合状态 | 最终检查器 → 规则与 CLI 证据 | 无主动源码写入 | 中；目标测试确实收集且通过 |
| V-browser | I / 验证 / 路由验证 owner | I-format：稳定组合状态 | 两份最终路由测试 → 无头回归证据 | 无主动源码写入 | 中；两个目标按所属配置通过 |
| I-review | I / 审查 / 独立审查 owner | V-static、V-unit、V-browser：组合证据 | 稳定 diff、验证结果 → 范围与设计符合性审查 | 空 | 中；无未解决的计划内问题 |
| I-stage | I / stage / 实现 Git owner | I-review：通过的审查 | 精确代码写集合 → staged 实现 | 对应 index entries | 小；cached diff/check 与验证输入一致 |
| I-commit | I / commit / 实现 Git owner | I-stage：已核验 index | staged 实现 → 本地提交 | index/本地 Git 对象与当前分支 | 小；新 commit id 和文件集合已核对 |
| F-close | 无 / fan-in / 主代理 | I-commit：最终提交 | 提交与证据 → 最终完成报告 | 空 | 小；HEAD 内容等于验证输入，所有任务与修正完成 |

初始 ready set 为 D-review（须先满足计划执行授权）。D-commit 完成后 I-contract、I-routing、I-wire 同时 ready；I-contract 完成后 I-policy、I-engine、I-tests 同时 ready。最终 fan-in 为 I-join，验证分支汇于 I-review。

预期关键路径：文档提交 → 登记接口 → 检查器 → 组合格式化 → 最慢的适用验证 → 审查与实现提交。清单与测试不等待检查器写完；接线只依赖已在计划中确定的 CLI 路径，不依赖检查器实现。验证读取相同稳定文件可并发；实际共享 Vite 端口或 runner 资源冲突只限制有关 runner，不能串行全部验证。

## 验证入口与成功条件

所有前端命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`，采用 `/opt/homebrew/bin/fnm exec --using-file`。计划准备时确认 Node `v24.17.0`、pnpm `10.34.5`，pnpm 位于用户 fnm 的 Node installation 下；TypeScript、tsx、Vitest、ESLint、oxfmt 已存在。执行前重新检查工具与浏览器实际 executable，缺失时停止对应验证，告知用户自行安装，禁止代装。

以下新增命令只在 I-wire/I-engine 完成后存在：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run lint:boundaries
```

最终静态验证通过现有入口完成，`lint` 已包含上述检查，不额外重复完整扫描：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

规则与 CLI 测试使用现有收集入口，成功须包含目标测试而非零收集：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- scripts/featureBoundaries
```

无头 Browser 验证使用实际存在的所属配置和过滤目标，不调用会串接无关 sequential suite 的总脚本：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:smoke -- src/__tests__/smoke/AppRouting.smoke.browser.test.tsx
```

parallel 配置覆盖 Chromium、Firefox、WebKit，smoke 配置覆盖 Chromium；分别记录实际收集和结果。共享配置已经强制 headless，不打开窗口、HTML 报告或 trace viewer。计划准备只读取配置和缓存目录，没有运行浏览器或测试。

格式化使用现有 oxfmt。当前 `format:oxfmt:fix` 固定传入 `.`，不能安全表达本任务精确写集合，故不运行该全目录修复入口；使用同一原生格式化器明确指定目标，实际 `--help` 已核实支持多路径：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write scripts/featureBoundaries package.json src/__tests__/AppRouting.browser.test.tsx src/__tests__/smoke/AppRouting.smoke.browser.test.tsx
```

随后检查完整 diff 并运行上述非 fix 格式检查。若格式化带来纯代码顺序调整，不得夹带在行为提交中；将其作为独立任务和新提交处理，并重新验证最终状态。当前计划不主动安排无关重排。仅前端和文档变更不触发根 `just fmt`。

规则测试至少覆盖以下行为，而非断言内部函数拆分或复制实现：

- 合法具名/type-only/default、同 feature 内部调用通过。
- 未公开导出、未允许方向、错误登记、解析失败、未登记新 feature 被拒绝。
- 别名与相对路径指向同一文件得到相同判定；转导出和 namespace 不泄漏内部成员。包含“内部成员 → 外层 utils 转导出 → 另一 feature”及“生产模块转导出测试接口 → 生产消费者”的拒绝案例。
- 动态访问、import type、mock/actual 获取不能绕过；当前 locale 资源与第三方库访问仍合法。
- 测试公共接口仅用于测试，生产直接或间接消费失败；同 feature 的生产调用也不能例外，非 `.test.*` 测试辅助文件分类正确。
- 生成声明文件的真实 feature 引用被检查；未跟踪新增源文件也被收集。
- 两处保留方向仍受接口检查，新增未允许访问失败。
- CLI 成功退出与违规非零退出均经过端到端测试，测试输入不能来自只验证自己期望的真实仓库白名单。

Level 1：上述自动检查及两份路由 Browser 回归。Level 2：不适用，生产装载、交互和状态转换均未修改。Level 3：不适用，无可见桌面依赖。若实际实现超出这些前提，先更新影响面与验收判断，不以静态验证替代新产生的运行时要求。

## 失败、修正与完成

节点失败作为新证据进入诊断、修正、重新验证节点，按实际依赖传播失效；主代理维护节点状态、事件、锁、失败域与提交身份，不回写本计划。未修改的稳定输入不无故重复验证。

工具缺失、需越出授权范围或发现契约归属必须变更时，只暂停受影响后继；其他独立工作继续。禁止通过忽略目录、放宽断言、删除覆盖、自动批准全部历史调用或新增兼容路径消除失败。

最终完成以全部任务和必要修正合并后的状态判断，不要求中间文件或提交具备整个功能；任何已有提交的修正新建独立提交。最终验证全部通过后，核对提交内容与验证输入一致、无意外暂存和范围外修改，报告提交、验证与保留 issue 边界。报告实际并行、关键路径及未启动 ready 节点的具体原因。

本轮仅落盘计划，未执行本节任何实现、验证、stage 或 commit。等待用户明确确认计划后开始。

## 计划反向审查记录

落盘前独立只读审查核验了输入发现、tsconfig/Vitest 收集、三引擎与 smoke 无头入口、转导出来源、测试身份、自动修复入口及两份 mock 的真实 runtime export。上述修正已纳入本计划。并行边以稳定登记类型为共同输入，清单、分析器与规则测试无相互产物依赖；共享 Git index 只在 stage/commit 持锁。未把任务编号或共享工作区当作全局串行依据。
