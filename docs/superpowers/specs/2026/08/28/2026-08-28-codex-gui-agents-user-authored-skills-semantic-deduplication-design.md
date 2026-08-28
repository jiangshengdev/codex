# Codex GUI AGENTS 与本人 Skill 语义去重设计

日期：2026-08-28

状态：已确认

确认日期：2026-08-28

确认原文：`确认`

设计分支：`dev`

设计时 Codex HEAD：`a17aecaac3467790520e553fe968165b21d7ba8a`

## 唯一主目标

为 `codex-gui/AGENTS.md` 与 9 个本人新建的项目 skill 建立简洁、去重、单一 owner 的规则结构；保留现有触发范围、硬边界和有效行为，不修改任何上游代码或上游 skill。

本设计只定义规则归属、路由、语义压缩和验收不变量。它不是 implementation plan，不授权修改目标规则文件、Git index、提交或远程状态。

## 已确认决策

- 同时整理 `codex-gui/AGENTS.md` 与全部 9 个本人 skill。
- `AGENTS.md` 只保留项目级硬边界、简短触发条件和必要的 skill 路由。
- 详细流程只保留在对应 skill；重复内容改为短路由。
- 语言整体压缩，但不得改变行为、范围、禁止项、停止条件或机器字面量。
- 11 个上游 skill 和其他上游代码全部排除。

## 范围

设计对象：

- `codex-gui/AGENTS.md`
- `.codex/skills/codex-gui-toolchain/SKILL.md`
- `.codex/skills/codex-gui-worktree/SKILL.md`
- `.codex/skills/codex-rust-verification/SKILL.md`
- `.codex/skills/debug-responsive-gui/SKILL.md`
- `.codex/skills/gui-launch/SKILL.md`
- `.codex/skills/heroui-react/SKILL.md`
- `.codex/skills/redux-toolkit/SKILL.md`
- `.codex/skills/release-promotion/SKILL.md`
- `.codex/skills/vitest-react-browser-docs/SKILL.md`

当前 Git 身份、逐文件 `git log --follow` 与逐行 `git blame` 均确认上述规则文件属于本人提交。目录位置本身不作为作者证据。

明确排除：

- `.codex/skills/**` 中其余 11 个上游 skill。
- 9 个本人 skill 下的脚本、缓存、文档镜像和其他非规则实现文件。
- 项目根 `AGENTS.md`、产品代码、测试、schema、生成物和配置。
- 全局 skill、第三方 skill、Git 远程和依赖安装。

## 与既有设计的关系

本设计是 `2026-08-27-project-global-skill-semantic-deduplication-design.md` 的局部后续版本：只取代其中与上述 9 个项目 skill 相关的 owner、简洁化和验收定义，并新增 `codex-gui/AGENTS.md` 边界。旧设计中的全局 skill、canonical 路径和跨仓库边界保持不变；本设计不得据此修改它们。

## 规则分层

每条详细规则只能有一个 owner。其他文件只可保留：

- 触发路由：何时加载 owner。
- 领域增量：只在本文件范围成立的约束。
- 停止条件：无法由 owner 推出的局部阻断边界。

短路由不是重复。重复判断过程、完整检查表、相同状态机或相同机器字面量由多个文件分别维护，才属于本次去重对象。

## Owner 矩阵

| Owner | 唯一职责 | `codex-gui/AGENTS.md` 的关系 |
|---|---|---|
| `codex-gui/AGENTS.md` | 前端文件级硬覆盖、工程与契约不变量、验收触发边界、HeroUI 产品级约束、性能与 fixture 约束 | 只保留项目 delta 和必要路由 |
| `$codex-gui-toolchain` | 前端命令发现、cwd、Node/pnpm 环境、目标命中与执行入口 | AGENTS 只路由，不展开流程 |
| `$debug-responsive-gui` | 真实 GUI 调试与验收流程、场景证据、完成状态 | AGENTS 只定义触发边界 |
| `$gui-launch` | 普通 GUI 启动与 URL-only 输出 | AGENTS 只提供与调试入口的短路由 |
| `$heroui-react` | HeroUI v3 本地文档、包与 API 细节 | AGENTS 保留产品级设计不变量 |
| `$redux-toolkit` | Redux Toolkit 本地文档、API 与架构规则 | AGENTS 仅在相关任务中路由 |
| `$vitest-react-browser-docs` | React Vitest Browser Mode 文档查证 | 不接管测试执行或真实 GUI 验收 |
| `$codex-gui-worktree` | GUI worktree 参数、脚本、路径、稀疏范围与核验 | 不增加 AGENTS 路由 |
| `$codex-rust-verification` | Rust 窄验证与 Hard Limits | 不增加前端路由 |
| `$release-promotion` | 本地分支晋级流程与恢复入口 | 不增加前端路由 |

`codex-gui-worktree` 的触发发生在编辑 `codex-gui/**` 之前，`release-promotion` 属于仓库分支流程，`codex-rust-verification` 属于 Rust 验证；把它们路由进嵌套 AGENTS 既不可靠，也会扩大该文件职责。

## 关键收敛

### 前端命令

`codex-gui/AGENTS.md` 保留仓库级 `just fmt` 的前端硬覆盖，因为它必须覆盖根规则。命令发现、live `package.json`、fnm Node、`pnpm`、测试收集和目标命中细节统一归 `$codex-gui-toolchain`。

### 真实 GUI 验收

`codex-gui/AGENTS.md` 只保留真实 GUI 验收的触发条件和“未全部通过不得声明完整完成”的硬边界。场景选择、浏览器控制、运行时交接、截图用途、环境状态、结果记录和失败报告统一归 `$debug-responsive-gui`。

当前存在两个完成状态字面量：AGENTS 使用 `Real GUI not validated`，skill 使用 `真实 GUI 未验收`。收敛后由 `$debug-responsive-gui` 唯一保留 `真实 GUI 未验收`；AGENTS 不再维护状态字面量。

普通 `GUI 启动`、`启动 GUI`、`/gui` 或 URL-only 请求继续路由 `$gui-launch`；调试、响应式、截图和可视验收继续路由 `$debug-responsive-gui`。

### HeroUI、Redux 与 Vitest 文档

`codex-gui/AGENTS.md` 保留 HeroUI v3 默认组件系统、语义角色、token 和例外条件。包名、import、compound API、`onPress` 等依赖细节归 `$heroui-react`。

`$heroui-react`、`$redux-toolkit` 与 `$vitest-react-browser-docs` 保持独立入口，统一采用“触发范围 → 权威资料根 → 最短查证流程 → 领域规则 → 边界/转交”的简短结构，不合并成泛化资料 skill。

`$redux-toolkit` 的离线规则与缓存刷新入口按现有能力收敛为：普通任务只读本地缓存；只有明确的缓存刷新任务才使用 bundled updater。禁止临时浏览或自行拼装远程抓取流程。

Vitest 文档 skill 只回答 API、配置、locator 和交互文档问题；项目证据闭包、测试执行、fixture 约束和真实 GUI 验收仍由各自 owner 管理。

### Workflow skill

`$codex-gui-worktree` 保留项目 worktree 机制，只用短路由消费通用授权与阶段规则；不得复制授权来源、阶段状态机或通用安装禁令。

`$release-promotion` 保留 local-only、clean worktree、冲突停留、无 remote/tag/test/formatter/install/publish、无 `git reset --hard` 等脚本契约。通用授权与冲突处理只保留短路由；精确 `--continue` 恢复入口继续原样保留。

`$codex-rust-verification` 继续独占 Rust 验证 Hard Limits，不迁入前端 AGENTS。

## 简洁化规则

- frontmatter `description` 已表达用途时，正文不再重复“Use this skill”。
- 同一 owner 引用只保留一次；后文使用短引用。
- 长路径、搜索词和命令示例只保留能区分入口的最小集合。
- 精确命令、路径、状态字面量、参数顺序和输出格式不得改写。
- 禁止项、失败行为、停止条件和副作用边界不得因压缩而删除。
- 不以减少行数为验收目标；简洁只表示删除冗余，不表示缩小能力。

## 行为保持不变量

- 9 个 skill 的名称、触发语义和可发现性保持不变。
- 仓库级 `just fmt` 前端覆盖继续有效。
- 普通 GUI 启动与真实 GUI 调试仍是两个不同入口。
- 自动化环境就绪、测试通过、截图和真实 GUI 场景通过仍互不替代。
- HeroUI、Redux Toolkit 与 Vitest Browser Mode 的领域规则不合并。
- worktree 创建、Rust 验证和 release promotion 的用户结果不变。
- 不新增 fallback、兼容层、忽略、跳过、降级或放宽断言。
- 上游 skill、上游代码与其他排除文件保持字节不变。

## 设计验收

后续实现只有同时满足以下条件才符合本设计：

- 目标写集合仅包含本设计列出的 10 个规则文件。
- 每个详细协议只有一个 owner，消费者只保留路由、领域增量和停止条件。
- `Real GUI not validated` / `真实 GUI 未验收` 冲突只剩 skill 中的 `真实 GUI 未验收`。
- Redux 普通离线查证与显式缓存刷新不再互相否定。
- 所有机器字面量和有效行为均有修改前后对照证据。
- 11 个上游 skill 及其他排除文件没有 diff。

## 后续阶段门禁

本设计确认前不得创建计划文档。设计确认后，如用户要求编写计划，再单独落盘 implementation plan；计划确认前不得修改规则文件。
