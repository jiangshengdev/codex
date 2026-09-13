# Storybook 真实渲染环境实施计划

日期：2026-09-13

状态：任务拆分已确认，计划已落盘，尚未授权执行。

设计依据：[真实渲染环境设计](../../../../../specs/2026/09/13/2026-09-13-codex-gui-storybook-rendering-environment-design.md)。

## 目标与边界

打通 Storybook 与应用一致的样式、语言、主题及必要 Provider。三态偏好为 `light | dark | system`，默认 `system`；仅页面内有效，刷新或重新打开恢复 `system`。产品暂不挂载切换入口，继续跟随系统。

不创建组件库、不迁移错误反馈目录、不制作完整业务 Story 目录、不连接真实后端发送消息、不安装依赖、不操作 Git 远程。本轮只写计划和三个本地 ticket，不发布 tracker、不 stage 或 commit。ticket 的 `ready-for-agent` 表示拆分已就绪，不替代执行授权。

## 任务与产物

| 任务 | 阻塞于 | 独立可验证结果 |
| --- | --- | --- |
| [01 基础真实渲染](issues/01-base-rendering.md) | 无 | 真实组件在 Storybook 中使用应用样式和翻译正确渲染 |
| [02 三态主题预览](issues/02-theme-preview.md) | 01 | 预览三态切换、刷新复位，产品维持跟随系统 |
| [03 有状态组件预览](issues/03-stateful-preview.md) | 01 | Redux 与 Router 上下文可用，Story 状态和导航隔离 |

最终合并验收属于计划完成门禁，不增加第四个功能 ticket。没有需要提前单独提交的无行为重排或兼容层重构。

## 当前证据与实施前提

- 当前工作目录是 `/Users/jiangsheng/cnb/codex`，分支为 `dev`；写计划前只有本次设计文档未跟踪。实施前重新核验状态，不纳入后来出现的无关变更。
- Storybook 已有框架和插件配置；预览尚未接入应用上下文。应用提供主题 Provider、语言解析与目录加载、`makeStore` 工厂。
- 当前 GUI 的 CI 调用 `ci`，其格式入口为 `format:oxfmt`，不要并列增加 Prettier 门禁。
- 已确认 fnm 可执行，fnm 环境中 pnpm 为 10.34.5，Storybook、Playwright、TypeScript 项目入口存在。项目没有 `.nvmrc` 或 `.node-version`；现有 fnm 调用能通过 package engines 解析运行环境。
- 本次未运行构建或浏览器测试，未核验全部浏览器二进制、运行中的 Codex URL。实施预检必须核验；缺失时不得安装或用未执行冒充通过。

## 修改范围与职责

以下路径相对于仓库根，是实施计划的预计范围；ticket 正文只描述用户行为。

### 01：基础真实渲染

- 入口：`codex-gui/.storybook/main.ts`、`codex-gui/.storybook/preview.tsx`。
- 新预览支持与最小 Story：`codex-gui/src/storybook/`；共享环境加载真实 CSS、语言目录与现有 ThemeProvider。
- 必要配置：`codex-gui/vite.config.ts`、`codex-gui/tsconfig.app.json`、`codex-gui/tsconfig.node.json`，只在现有继承或收集不能覆盖新文件时修改，不扩大排除范围。
- 现有参考：`codex-gui/src/main.tsx`、`codex-gui/src/index.css`、`codex-gui/src/i18n.ts`、`codex-gui/src/utils/test-utils.tsx` 和现有错误反馈组件。默认不修改错误反馈业务行为。
- 回归与验收：`codex-gui/src/storybook/__tests__/`、`codex-gui/e2e/storybookRendering.spec.ts`；优先现有 Playwright 项目入口，用绝对 Storybook URL 访问预览，避免将默认产品 baseURL 当作 Storybook 地址。

### 02：三态主题预览

- 主题 owner：`codex-gui/src/app/ThemeProvider.tsx`；可在同目录新增主题上下文与选择控件模块，保留唯一主题解析及根节点应用逻辑。
- 预览接线：`codex-gui/src/storybook/` 与 `.storybook/preview.tsx` 的主题集成；可复用选择控件不挂载到产品布局。
- HeroUI 使用 `ToggleButtonGroup`、`ToggleButton`，单选且禁止空选，遵循组件自带选中样式和语义 token；图标采用现有图标依赖。
- 验证：`codex-gui/src/app/__tests__/`、`codex-gui/e2e/storybookTheme.spec.ts`。验证真实页面刷新和重新打开、系统深浅色变化及产品回归。
- 可翻译名称通过 Lingui 宏并提供语境说明；目录生成边界见下节。

### 03：有状态组件预览

- 在 `codex-gui/src/storybook/` 增加按需 store 与路由环境及最小验证 Story，使用现有 `makeStore` 和权威状态类型，不复制产品状态声明。
- 使用隔离路由，不直接挂载会启动产品连接生命周期的完整应用路由树。保留主题、语言、Redux、Router 的相对嵌套顺序。
- 验证：`codex-gui/src/storybook/__tests__/`、`codex-gui/e2e/storybookStateful.spec.ts`。切换 Story 后验证业务状态重建，路由跳转不替换 Storybook 管理页面，不发起真实业务 WebSocket 连接。
- 共享入口改动由主代理集成，任务 03 不重写任务 02 的主题选择逻辑。

### 生成边界

若新增可翻译消息，权威入口为 `messages:extract`，输入由 `lingui.config.ts` 的 `src` 范围决定；完整输出边界是 `codex-gui/src/locales/en.po` 与 `codex-gui/src/locales/zh-CN.po`。只允许人工补充消息翻译，不能手工模拟目录提取。检查完整 diff，区分合法引用元数据与消息语义变化；补译后再次提取验证稳定。范围外输出、输入不明或不稳定时暂停该生成节点并核验原因，不以修改基线掩盖问题。不涉及协议生成、Rust schema 或锁文件更新。

## 验证入口与通过条件

命令均在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，执行前重读工具链规则，核验 fnm 的实际 Node/pnpm 来源、目标收集和已有浏览器；禁止安装。本文列出的新测试文件由对应任务先创建并确认收集后才能执行。

- 类型：`/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`。
- lint：`/opt/homebrew/bin/fnm exec --using-file pnpm run lint`。
- 格式检查：`/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`；修复使用项目 Oxfmt 入口并限定到本次文件，若现有脚本不能安全限定则按工具链规则选择受支持入口，禁止先手改格式。
- Storybook 构建：`/opt/homebrew/bin/fnm exec --using-file pnpm run build-storybook`，默认产物 `storybook-static`；成功不等于交互验收通过。
- 国际化既有回归：`/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/__tests__/i18n.browser.test.tsx`。
- 新 Browser 回归走 `test:browser:parallel --run`，传入对应任务实际新增的完整测试文件路径，不过滤 aggregate `test:browser`，不得零测试通过。
- Storybook 实际页面回归：`PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/storybookRendering.spec.ts e2e/storybookTheme.spec.ts e2e/storybookStateful.spec.ts`；单任务阶段只传已经存在的所属文件。已有 E2E 会启动产品 Vite 服务，测试另需已授权的 Storybook 服务。
- Storybook 服务使用 `storybook` 项目脚本，实施时先核验当前 CLI 的禁止自动打开浏览器选项，通过该脚本启动无可见窗口的服务，不能直接执行可能打开浏览器的默认启动方式。测试使用确认的服务地址，不假定端口未占用。
- 提取：`/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`，只在消息变化时执行并检查重复提取稳定性。

Level 1：真实预览的样式和英文/简体中文首次渲染、三态选择和辅助技术语义、刷新恢复、上下文与导航隔离。至少在已有 runner 配置声明的浏览器范围内完成相关目标，若工具缺失记录缺口，不降级既定断言或删除覆盖。

Level 2：获得当前完整 GUI URL 后，以无头浏览器确认真实产品继续跟随系统且无主题入口；不发送消息。不能使用历史 URL 或用 fixture 代替真实应用。若现有运行时不包含本次代码且需要原生构建，由用户运行，助手只报告阻塞及建议命令，不运行后端构建。

Level 3：不适用。不得打开可见浏览器、DevTools 或报告窗口。

每个任务完成相关检查后才形成任务提交；最终验收读取三项合并后的稳定状态，补齐跨任务交互与 Level 2。已对同一稳定内容完成的检查可复用证据；只有集成变化或失败使证据失效时重跑相关范围，不扩大到完整测试套件。

## 执行图、资源与提交契约

### 统一节点字段

以下默认字段与节点表共同构成每个节点的完整记录；实施时按执行图契约记录实际结果，不将计划正文改写成运行日志。

- `owner`：主代理为协调、共享入口和 Git index 的唯一 owner。本次计划编写由主代理完成；实施中无冲突的局部编辑可按委派 skill 与能力信封交给子代理，禁止继续委派。
- `subdelegation`：false；任何委派都只覆盖单节点动作，不包含隐含 stage/commit 或范围扩大。
- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` 工作树、`dev` 分支和本工作树 Git index；不创建 worktree 或分支。实施时用 Git 核验 canonical index 路径并记录，不能猜测 `.git` 一定是目录。
- `authorizationGate`：当前全部实施节点为 pending；来源仅为后续明确批准实施本计划。当前确认只授权本地文档落盘。实施前由 action-authorization 生成逐节点能力信封，检查目标、动作和自动产物边界。
- `estimatedCost`：预检、stage、commit 为小；单任务编辑/验证为中；最终汇合验收为中，不以时间预算作为停止条件。
- `deferralEvidence`：无预设暂缓。资源冲突由锁协调；若运行时出现额外成本，记录具体争用对象、收益、复查点和失效条件。
- `readSet`：节点消费的设计、计划、所属任务范围和依赖稳定产物。
- `writeSet`：编辑节点只写所属任务范围；生成节点只写目录边界；格式节点只写本任务源码；验证节点只产生正常测试/构建产物；stage 写 index；commit 写 index 与本地 Git 对象/引用；fan-in 只产出汇总证据。
- `stateEffects`：严格对应 `operationKind`，不从验证推出编辑、不从编辑推出提交。普通命令自动产生的缓存与报告按能力信封处理。
- `commandScope`：编辑仅普通源码 patch；格式、提取、测试及构建仅上述固化入口与所属文件；Git 仅只读检查、明确路径的普通 `git add --` 和新建本地 commit。禁止强制操作、amend、忽略文件暂存和所有远程操作。
- `resourceLocks`：相关源码 canonical 路径按 read/write 加锁；`.storybook/preview.tsx` 写锁归主代理；语言目录和生成器输入在提取期间加读写锁，禁止并行改动输入；`codex-gui/storybook-static`、实际报告/截图目录和测试所用服务端口按写资源互斥；Git index 及本地引用仅 Git owner 可写。读取稳定快照可以并行。
- `verification`：所属任务验收条件和本节入口；目标全部被收集并通过才成功。提交节点另核验 staged allowlist 和 diff 检查。
- `failureDomain`：节点产物及直接消费它的传递后继；01 的环境基础失效影响 02/03，02 或 03 的局部失败不自动阻塞另一分支。
- `replanTriggers`：必要依赖缺失、共享接口或生成链证据失真时重编局部图；需要产品行为、外部路径、依赖安装或授权变化时只暂停相应分支并报告。普通计划内失败继续诊断、修正和相关复验，不以首次失败终止。

### 节点与硬前置

`T` 分别取 01、02、03。模板实例化后的节点 ID 唯一；每种动作独立，不将编辑、验证和提交合并成一个节点。

| nodeId | taskBoundary | operationKind | hardPredecessors 与原因 | outcome / produces | consumes / completionEvidence |
| --- | --- | --- | --- | --- | --- |
| P | 无提交 | 调查 | 无 | 当前源码、工具、runner 与授权预检记录 | 现有配置；关键前提核验结果 |
| D-stage | 文档 | stage | P；需要核验当前文件及授权 | 仅本次设计、计划、三个 ticket 的 staged 快照 | 文档 allowlist、staged diff 与检查通过 |
| D-commit | 文档 | commit | D-stage；消费已核验 index | 独立文档提交 | 文档 commit id；实现前门禁 |
| 01-edit | 01 | 编辑 | D-commit；遵循文档先提交门禁 | 可渲染基础环境与测试源码 | 设计及基线；明确文件 diff |
| 02-edit | 02 | 编辑 | 01-verify；需要已验证预览环境接口 | 三态主题能力、预览及测试源码 | 基础环境稳定快照；明确文件 diff |
| 03-edit | 03 | 编辑 | 01-verify；需要已验证预览环境接口 | 隔离上下文、预览及测试源码 | 基础环境稳定快照；明确文件 diff |
| T-generate | T | 生成 | T-edit；消息输入稳定 | 必要语言目录更新或无变化记录 | 完整目录 diff、补译后重复提取稳定证据 |
| T-format | T | 格式化 | T-generate；消费完整源码/目录产物 | 本任务规范化源码 | scoped formatter 结果与实际 diff |
| T-verify | T | 验证 | T-format；消费稳定源码 | 所属任务可见行为证据 | 聚焦检查、构建及对应验收通过 |
| T-review | T | 审查 | T-verify；消费测试证据与 diff | 范围、依赖及约束审查记录 | 无未闭合的计划内问题 |
| T-stage | T | stage | T-review；消费已审查产物 | 本任务 staged 快照 | allowlist、staged diff 和 diff 检查通过 |
| T-commit | T | commit | T-stage；消费 index | 单独本地任务提交 | commit id 与提交文件集合 |
| F | 无提交 | 验证 | 01-commit、02-commit、03-commit；消费所有最终提交 | 合并状态最终验收证据 | 三项最终内容、必要组合复验、Level 1/2 结果 |
| Z | 无提交 | fan-in | F；完成证据已闭合 | 最终交付汇总 | 全部节点与修正提交完成，没有未执行的必需验收 |

生成节点内部若需要人工翻译，将其拆成“提取、补译、重复提取”三个独立动作节点；不新增产品目标，也不能绕过先生成后补译的顺序。

### 调度与提交拓扑

- 初始 ready set：执行授权 active 后为 P；预检完成后文档 stage/commit，随后 01。
- 01-verify 产物稳定后，02-edit 和 03-edit 同时具备业务前提。01 的审查/提交不是两者的全局启动栅栏；index 写入仍串行。
- 预计关键路径：文档门禁、01 基础环境、02/03 中较长分支、F、Z。02/03 间无硬依赖。
- 同工作树存在共享入口、运行服务和输出目录争用。局部文件集合无交集时可以并行编辑；主代理串行集成共享入口，运行消费可变工作树的检查时冻结其相关输入。不能仅因共用工作树伪造 02 → 03 的依赖。
- 委派判断：本次文档编写是一个有界归纳动作，直接完成；实施的 02/03 局部模块具有独立产物，可在分配互不相交写集合后委派。共享入口与 index 不委派给多个 owner，不创建额外 worktree。
- 提交顺序：文档提交先于实现；三个 ticket 各有独立行为提交。02 和 03 的物理提交先后由 index 锁和完成时间决定，不能倒推出业务阻塞边。
- 不进行顺手 import/声明重排；如发现确需独立无行为重排，应单独说明其必要性及提交范围，不能混入行为提交。不新增临时双路径、fallback 或兼容层以让中间提交“完整”。
- 每次修正已有提交都新建独立提交，禁止 amend；最终完成按所有任务及修正合并后的状态判断。

## 完成与报告

计划执行期间由主代理在执行上下文维护节点状态、锁、产物身份、失败与动态修正，不回写已确认计划正文。只有三个任务提交、计划内修正和最终验收全部完成才报告完成；关键工具或运行时缺失时明确报告具体未执行项。

最终报告列出文档与任务 commit id、实际验证范围和 Level 1/2 结果，并按执行图契约报告实际并行、关键路径、未启动 ready 节点及原因。Level 3 不适用。
