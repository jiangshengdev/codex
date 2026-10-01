---
name: codex-gui-bug-investigation
description: 在 Codex GUI 中用专属工作树和正式隔离测试入口排查 BUG，适用于多个独立聊天同时调查、需要保护用户服务并保留证据的任务。
---

# Codex GUI BUG 调查隔离

各聊天自行使用本 skill。工作树归属于聊天中的调查任务，服务、缓存和报告归属于单次测试运行；Issue 编号不能作为共享可写资源的身份。

## 权威依赖

本 skill 的外部诊断依赖链接以主 checkout 的 `.codex/skills/codex-gui-bug-investigation/` 为基准。在工作树中，用 `git rev-parse --path-format=absolute --git-common-dir` 找到共享 Git 目录及其主 checkout，再解析主 checkout 中的诊断依赖链接；不要根据 Issue 或当前工作树的目录名猜测依赖位置。

- [codex-gui-worktree](../codex-gui-worktree/SKILL.md)：必须读取并使用其脚本准备、核验工作树。以目标 checkout 自带的该 skill 和脚本执行；不要复制准备流程。
- [diagnosing-bugs](../../../../codex-config/.agents/skills/diagnosing-bugs/SKILL.md)：必须读取并实际遵循诊断阶段。隔离只提供调查环境，不替代失败信号、最小复现或根因验证。

依赖不可解析时停止相应步骤并指出缺失项。遵循目标仓库的 AGENTS、tracker 配置及工具链，先核对最新 Issue 正文、评论、标签与调查范围。

## 准备或恢复任务

1. 记录原请求授权：只排查、获准添加诊断代码、或获准修复。准备和运行已有测试不自动授权产品修改、诊断代码修改、提交、合并、外部写入或清理工作树。
2. 使用实际聊天身份或本任务首次创建并保留的唯一标识作为 `--task-id`。记录任务身份、Issue、工作树名、`codex/` 分支及基准提交；同一 Issue 的另一个聊天取得不同身份和资源。不能借用其他任务的分支或目录。
3. 新任务核对工作树 skill 的前提，读取启动 checkout 的 `git rev-parse HEAD`，将所得完整提交显式传入准备脚本的 `--base`，同时传 `--task-id`、专属 `--name` 和 `--branch`。不携带未提交内容；主目录有修改本身不是准备阻塞。
4. 恢复同一任务先核对原记录，再用相同目录、分支、身份和路径参数加 `--resume`。该模式保留基准和调查修改，拒绝归属、分支、资源链接或准备状态不一致。身份不明、准备失败、路径冲突时停止依赖步骤，不覆盖资源，不谎报工作树就绪。
5. 准备成功后按工作树 skill 的验证要求交付工作树、任务身份、实际基准、分支、稀疏输入和资源链接证据，再进入该工作树调查。默认保留工作树。

## 选择正式测试接缝

先按 diagnosing-bugs 建立能检测原症状的反馈循环。根据 BUG 路径选入口与已有过滤参数，从准备完成的工作树 `codex-gui` 运行，遵循 `codex-gui-toolchain` 的 fnm 环境：

| 目标 | 正式入口 |
| --- | --- |
| Storybook Playwright | `pnpm run test:storybook <spec 文件> --grep <用例>` |
| GUI E2E | `pnpm run test:e2e <spec 文件> --grep <用例>` |
| Vitest Browser 并行集合 | `pnpm run test:browser:parallel --run <测试文件>` |
| Vitest Browser 顺序集合 | `pnpm run test:browser:sequential --run <测试文件>` |
| Storybook stories | `pnpm run test:storybook:stories <stories 文件>` |

正式入口负责分配单次运行身份、实际端口、隔离缓存和产物目录，输出地址和证据位置，并在成功、失败或取消时清理本次拥有的服务。使用其输出，不能临时改写每个 BUG 工作树的测试配置，也不能在 skill 中再建一套端口分配或进程清理。缺少已实现的正式隔离入口时报告准备不足，不回退到固定端口路径。

6007 及其他用户服务只能观察，不能复用、接管、终止或重启。不要按端口、宽泛进程名清理；取消通过本次入口处理。正常结束和失败均保留报告、截图、trace 与附件，不主动删除其他任务产物。

验证默认无头，不自动打开报告或 trace viewer。检查实际收集、执行与跳过范围；零收集不计通过。缺工具、依赖、准备输入时报告阻塞，由用户处理，不安装组件或主动构建后端/原生程序。

## 证据交付

输出本任务的 Issue 与授权范围、任务身份、工作树、分支、实际基准、测试命令和过滤范围、实际服务地址、通过/失败/未复现结果、保留产物位置及未完成事项。凭真实运行证据判定结果；绿色重复运行不能证明原 BUG 已修复。

报告中区分隔离支撑的 Level 1 与具体 BUG 所需的真实运行时或可见桌面验收；不得用隔离测试代替后两者。正式 tracker 记录须脱敏，避免暴露私人路径或凭据。

任务结束默认保留工作树、未提交诊断及已有提交；用户明确要求清理时才交给既有授权与工作树流程。该 skill 不创建总控聊天，不自动提交、合并或操作 Git 远程，也不依赖 MCP 自动发现。本项目 skill 直接维护在 `.codex/skills/codex-gui-bug-investigation/`，与现有项目 skill 一致，不安装全局 skill、不增加发现符号链接。只能交付实际验证过的发现方式，不能承诺旧聊天立即刷新。
