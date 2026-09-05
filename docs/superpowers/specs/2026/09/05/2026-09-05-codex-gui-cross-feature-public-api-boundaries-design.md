# Codex GUI 跨 feature 公共 API 边界设计

日期：2026-09-05

状态：设计已落盘；尚未进入实施计划或实现阶段。

## 目标与已确认范围

明确 Codex GUI 各 feature 对外提供的接口、允许的依赖方向，并通过静态检查阻止越界使用，保持现有界面和业务行为不变。

用户已确认主目标，并选择范围 A：本轮治理公共边界；active-thread/session 与 thread runtime、Composer editor 与 input queue 的契约归属继续由各自 issue 处理。本轮不宣称消除了全部双向依赖。

关联问题：

- [跨 feature 公共 API 边界](../../../../issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-01-cross-feature-public-api-boundaries.md)
- [Active-thread 与 runtime 契约方向](../../../../issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-02-active-thread-runtime-contract-direction.md)
- [Composer draft 与 input payload 契约方向](../../../../issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-03-composer-draft-input-contract-direction.md)

## 当前证据与根因

本轮读取源码时的 Git HEAD 为 `99211083de4f57d08b12953d31c6032437b65442`，工作区无已有变更。

- `codex-gui/eslint.config.ts` 的 `no-restricted-imports` 只限制未类型化的 React Redux hooks，没有治理 feature 公共入口和依赖方向。
- `codex-gui/tsconfig.app.json` 提供统一 `@/*` 和生成协议 alias；路径解析能力本身不构成访问控制。
- `threadHistory/ThreadHistoryDetailContent.tsx` 使用完整的 `ReadOnlyCommittedTranscriptSurface`，属于有明确语义的能力复用。具体文件路径 import 本身不足以证明越界。
- `activeThreadSession/activeThreadProjection.ts` 消费 `threadRuntimeSlice.ts` 中的 replay helpers，后者又消费 session action 与 projection fact，存在 feature 级双向依赖。
- `composerEditor/composerDraft.ts` 与 `composerInputQueue/composerInputQueueContracts.ts` 互相消费类型契约。这不等同于已证实的 JavaScript 文件级运行时循环。

根因是现有复用没有显式的公共性声明和依赖约束；调用方无法区分稳定契约与内部实现。历史研究中的 import 数量未在本轮重新全量统计，不作为本设计的规模或完成阈值。

## 公共接口的表达与准入

建立机器可读的公共接口登记，以 feature、模块路径、允许的导出名称、用途和所属领域为基本信息。登记是检查规则的权威输入，避免文档和检查配置各自维护一套名单。

优先把现有具备明确语义的模块登记为公共入口，不要求每个 feature 新增统一 barrel，也不为了入口形式增加转发函数、复制类型或搬入万能 `shared/**`。同一文件包含多个 export 时，登记具体允许跨边界使用的名称，而非自动公开所有 export。

公开接口必须满足：

- 对外表达完整能力或必要领域契约，调用方不需要理解内部组装细节。
- 权威定义和维护责任明确；类型直接来自其 owner，或由权威类型机械派生。
- 真实消费者的用途明确，公开范围只覆盖该用途所需能力。
- 依赖方向经过判断，不以“现在有人调用”为自动批准理由。

未登记的模块或导出默认内部使用。公共登记不承诺永久不变；修改公共契约时应同步审查消费者，保留类型检查对不兼容修改的失败传播。

## 依赖方向与消费规则

登记允许的跨 feature 有向依赖。一个调用必须同时满足“目标接口已公开”和“来源 feature 可以依赖目标 feature”，只满足其中之一仍然违规。

同一 feature 内部正常使用内部模块，不要求绕经公共入口。feature 外部的生产消费者，包括应用入口和页面组装代码，都必须遵守公共接口边界；应用组装层需要的能力也应明确登记，不授予任意读取内部文件的权限。

两处暂不调整的双向关系按实际方向和必要接口登记，并关联原 issue，明确契约归属尚待解决。这是已确认范围内的现状表达，不是跳过这些 feature 的检查：其他内部导出、新消费者或新增依赖仍须满足完整规则。后续方向治理完成时同步收窄登记。

生成协议继续以现有 `@codex-protocol`、`@codex-gui-host-contract` 对应的生成文件为权威来源。公共接口治理不建立协议副本，不改变协议生成链或领域状态 owner。

## 静态检查

接入现有 lint 流程，以实际解析后的源文件和目标模块判断边界，不只匹配 import 字符串前缀。因此 `@/` 路径、相对路径及转导出不能成为绕过方式。

检查范围包括普通 import、type-only import、具名及通配转导出、动态 import 和其他可访问模块命名空间的形式。无法静态确定目标或使用范围的跨边界访问不得默认放行；应改为可以明确检查的引用形式。

命名空间导入、默认导出和通配导出必须遵守相同的公开名称约束，不能借导入整个模块访问未登记成员。具体语法处理由实施计划结合现有用法确定，不能以语法差异扩大公开范围。

错误应指出调用文件、目标接口、违反的是公共性还是依赖方向，并在存在合法入口时给出入口提示。登记中的失效路径和不存在的导出也应报错，防止配置与代码脱节。

不新增运行时权限检查，不改变业务失败恢复行为；违规在开发检查阶段直接失败，不采用只警告、全目录忽略或旧调用自动豁免。

## 测试边界

同一 feature 的测试可以访问本 feature 内部实现。跨 feature 复用的 fixtures、builders 和测试工具通过独立测试公共接口登记；生产代码不得引用这些入口。

测试入口继续保留原领域 owner，不重复定义生成协议或已有权威 fixture。跨 feature 测试调用生产能力时仍使用生产公共接口，不把测试目录作为任意穿透其他 feature 内部的通行证。

## 完成标准与验证要求

- 当前跨 feature 引用经过完整分类，公开接口、允许方向及测试入口均可核验；未分类调用不能静默通过。
- 合法消费通过检查；内部导出访问、未允许方向、相对路径绕过、转导出绕过以及生产引用测试入口均有可证明的拒绝行为。
- type-only 引用同样受治理，但诊断不将类型依赖误报为已证实的运行时循环。
- 公共声明引用真实定义，保持现有权威类型与不兼容变更的编译期失败传播。
- 保留两处契约方向 issue 的未完成边界，不因本轮公共 API 治理完成而关闭它们。
- 现有消费者类型检查及与受影响能力相关的回归检查通过，界面和业务行为保持不变。

本轮仅落盘设计，未执行 lint、测试或构建。实施计划需确定检查器入口、完整消费清单和验证范围。若实现仅涉及静态治理与语义不变的引用调整，Level 1 覆盖规则和相关回归；Level 2、Level 3 不因文件位于前端目录而自动触发。若发现装载、渲染或生命周期影响，须重新评估适用验收，不能用静态通过替代运行时证据。

## 排除范围与后续阶段

不迁移全部复用代码到共享目录，不新增通用 UI 包装层，不顺带处理 helper 去重，不调整会话、replay、草稿提交与恢复语义，不新增依赖安装要求。

本文件是设计，不包含实施任务图、实际迁移清单或执行授权。后续先确认设计，再编写并确认实施计划；本次落盘不授权代码修改、提交或关闭 issue。
