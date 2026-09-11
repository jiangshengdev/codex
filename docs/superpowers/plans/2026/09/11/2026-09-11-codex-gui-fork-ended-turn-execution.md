# 已结束 turn fork 执行记录

日期：2026-09-11。实现分支：`dev`。起点：`9a4ac81a9`。计划：同目录 `2026-09-11-codex-gui-fork-ended-turn.md`。

## 实现结果与提交

- D 完成：`7528559f5` 独立提交设计和计划，随后才开始源码编辑。
- E1/G1/V1/C1 完成：`0f12050a1` 接通 GUI-host、权威协议与当前聊天入口，App 生命周期 owner 保留已知 ID，提供跨页恢复，未知结果无自动重发。
- E2/V2/C2 完成：`31cd47d65` 历史预览使用其自己的来源 ID；跨分页只显示末尾入口。
- R 修正完成：`8a6b7c8b3` 按 Standards finding 增加共享 interrupted turn builder，删除测试局部状态构造。独立复核已闭合。

用户最后纠正已保留：只在现有已展示且已结束的 turn 提供入口，没有新增空内容判断或展示逻辑。未实现 parent 入口、fork 图、worktree、文件快照、模型选择或持久化格式改动。

## 调度和失败吸收

主代理为当前 checkout 唯一生成、格式化、index 和 commit owner。源码 owner 子代理仅写 `threadForkOwner.ts`；主代理同时接通独立协议/UI 边界。输入稳定后组合验证。E2 消费 E1 的共享操作契约，没有创建隔离 worktree 或横向临时兼容层。

生成物静态审查与页面实现使用不相交读写集合；最终 Standards/Spec 两轴在固定提交范围 `7528559f5...31cd47d65` 只读并行。无子代理获得 Git 写或继续委派能力。运行中的 Browser、类型检查与源码编辑没有交叠，生成器和 catalogs 在验证后独占处理。

失败及修正：

- 首个 Browser 红灯精确验证入口缺失，接入后通过。
- HeroUI pending spinner 改变按钮可访问名称，补稳定的本地化 aria-label，重复提交检查通过。
- 类型检查发现 constructor 参数属性不满足 erasableSyntaxOnly、错误 fixture 字段缺失；分别改显式属性和合法权威 fixture。
- 独立恢复链审查发现 Router promise 完成不保证抵达目标；Provider 现在检查实际 currentTask/threadId，未抵达保留恢复项。页面覆盖导航抛错和导航未抵达两种情况。
- 新增文件 lint 问题先使用定向 ESLint fix，无法自动修复的冗余条件人工删除，非 fix 验证通过。
- 全量 Browser 失败后仅复跑相关失败文件和 fork 文件；未删除测试、放宽断言或改变现有样式。

## 验证证据

Level 1：

- fork 页面测试：当前聊天 8 场景、历史预览 2 场景，Chromium/Firefox/WebKit 共 30 项通过。覆盖精确请求、显示截断 fixture、原草稿归属、新会话发送、失败/中断/进行中入口、创建 pending、离页旧响应、已知 ID 激活/导航恢复、未知结果手动新请求、跨 context page 入口。
- 全量 unit：99 文件、1250 项通过。
- 全量 parallel Browser：183 个浏览器文件实例，1667 项通过、25 项失败。
- 全量 sequential Browser：27 个浏览器文件实例、57 项通过。aggregate 前半失败后单独运行 sequential 固化入口，没有跳过后半组。
- 失败定向复查加 fork 回归：15 个浏览器文件实例，75 项通过、24 项失败。fork 30 项均通过；先前 Chromium pending editor backdrop 超时此次通过，但不据此声称修复了该间歇失败。
- Rust `just test -p codex-gui-host filter::tests`：3 项通过，77 项因显式过滤未运行。
- 最终 `type-check`、本次修改文件 ESLint、oxlint、`format:oxfmt`、`protocol:check-validators`、仓库 `just fmt` / `just fmt-check` 通过。
- 全量 ESLint 未通过：3 个未修改的 composer 测试文件中有 7 处原有 `no-meaningless-void-operator`。Git 基线内容核验确认这些表达式此前已存在。本次未改动这些表达式或相关检查规则。

尚未通过的 24 项 Browser 对齐断言：`HistoryPreviewChatLayout` 4 场景与 `AppProjectionAvailability` host-close 4 场景，各在三浏览器失败，差值均为 4px。独立源码核验确认基线 `7528559f5` 的 `.composer-frame p-1` 与内层 `.composer-panel.task-bottom-panel` 嵌套来自既有 `a9781ca26a`，测试却要求内层 panel 与 transcript 左右差不超过 1px。相关 CSS、composer 和两测试文件均未在本次修改。没有运行基线 checkout 测试，因此记录为基线源码已存在的布局/断言冲突，不宣称已在基线运行复现。

Level 2：未执行。当前没有可用的完整 GUI URL 和已包含本次 GUI-host allowlist 修改的真实运行时，且禁止助手构建/启动后端。真实持久化截断、父线程继续生成、新输入的实际后端归属仍待用户提供运行条件后验收。现有 app-server terminal-prefix 测试仅检查源码覆盖，本次未运行其测试。Browser fixtures 不替代真实后端证据。

Level 3：不适用，未打开任何可见浏览器或桌面窗口。

## 生成物闭环

权威入口 `protocol:generate-validators` 生成，`protocol:check-validators` 最终通过。独立审查：只有 4 个 app-server generated 文件变化，旧 22 个导出的可达定义统一生成标识符映射后保持一致，135 个可达定义无语义差异；原有 71 个 validator 函数保留，只增加 fork response 对应函数与 schema。GUI-host generated 边界无变化。

Lingui 仅 `src/locales/en.po`、`src/locales/zh-CN.po`，7 个新增 message，补齐中文；既有改动只有 source-reference 行号。完整 diff 已审阅。重复 extraction 后摘要不变：en `3aeb0d9a4b15a96cb8ee73eb652e36b6ad8d5bf1`，zh-CN `dd7c3a91d2f53fa537c8286978f1f36b2ed89a76`，无缺失翻译。

## 独立审查结论

Standards：初审 1 项 fixture 规则问题，已修正并复核闭合，剩余 0 项。

Spec：0 项功能缺口或范围外行为；保留 Level 2 未验收的明确限制。

实现与计划内审查修正已提交；最终验证不能声明全绿或完整真实集成验收。全量遗留检查及 Level 2 前提仅影响相应完成声明，没有为其扩大本次 fork 的产品范围。未执行远程 Git、安装、后端构建、amend 或项目外主动改动。
