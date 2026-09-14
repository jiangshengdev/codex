# 问题追踪器：CNB

规格和实施工单使用 `jiangshengdev/codex` 仓库的 CNB Issues。

仓库：https://cnb.cool/jiangshengdev/codex
文档：https://docs.cnb.cool/zh/

## CLI 与认证

使用已安装的 `cnb` CLI，并明确指定 `--repo jiangshengdev/codex`。
不得通过运行 Git 远程命令推断仓库。

操作问题追踪器前运行 `cnb status`。执行进程必须能够使用认证凭据。
禁止打印凭据或将其写入文档。

使用 `cnb <module> <tool> --help` 核验参数。
分页参数是 `--page-size`，不是 `--pageSize`。
多行 Markdown 使用 `--body-file`。

## 操作

以下命令均使用上述仓库。使用前替换占位符。

```sh
cnb issues list-issues --repo jiangshengdev/codex --state open --page 1 --page-size 100
cnb issues get-issue --repo jiangshengdev/codex --number <number>
cnb issues list-issue-comments --repo jiangshengdev/codex --number <number> --page 1 --page-size 100
cnb issues list-issue-labels --repo jiangshengdev/codex --number <number> --page 1 --page-size 100

cnb issues create-issue --repo jiangshengdev/codex --title '<title>' --body-file <path>
cnb issues update-issue --repo jiangshengdev/codex --number <number> --body-file <path>
cnb issues post-issue-comment --repo jiangshengdev/codex --number <number> --body-file <path>

cnb repo-labels list-labels --repo jiangshengdev/codex --page 1 --page-size 100
cnb repo-labels post-label --repo jiangshengdev/codex --name '<label>' --color '<hex-color>'
cnb issues post-issue-labels --repo jiangshengdev/codex --number <number> --labels '<label>'
cnb issues delete-issue-label --repo jiangshengdev/codex --number <number> --name '<label>'

cnb issues list-issue-assignees --repo jiangshengdev/codex --number <number>
cnb issues can-user-be-assigned-to-issue --repo jiangshengdev/codex --number <number> --assignee '<username>'
cnb issues post-issue-assignees --repo jiangshengdev/codex --number <number> --assignees '<username>'
cnb issues delete-issue-assignees --repo jiangshengdev/codex --number <number> --assignees '<username>'
cnb issues list-issues --repo jiangshengdev/codex --state open --assignees '<username>' --page 1 --page-size 100
cnb issues list-issues --repo jiangshengdev/codex --state open --assignees - --page 1 --page-size 100

cnb issues update-issue --repo jiangshengdev/codex --number <number> --state open --state-reason reopened
cnb issues update-issue --repo jiangshengdev/codex --number <number> --state closed --state-reason completed
```

- “发布到问题追踪器”指创建 CNB Issue。
- “获取相关工单”指读取完整正文、评论和标签。
- 持续翻页，直到读完所有相关记录。
- Issue 列表响应不包含完整正文，需获取 Issue 详情。
- 使用 `--labels` 和 `--state` 筛选 Issue 列表。
- 使用 `--assignees <username>` 查找已分配工单，使用 `--assignees -` 查找未分配工单。
  可分配性检查返回 HTTP 204 表示用户具备分配资格，不代表已经分配。
- 创建缺失标签前，先读取现有标签，并使用 `triage-labels.md` 中的映射。
- 单独添加或移除状态标签，不替换无关标签。
- 关闭被拒绝的工作时，使用 `--state-reason not_planned`。
- 如需发布处理结果评论，应在关闭前单独发布。
- 检查 HTTP 状态，并读回验证修改结果；不能只依赖退出码。
- 编辑正文前重新读取当前正文，避免覆盖较新的修改。
- 这些约定不授予外部写入权限。

## 工单关系

在工单正文中使用 `## Parent` 和 `## Blocked by`，遵循 `to-tickets` 的要求。
引用真实的 CNB Issue 编号；存在歧义时注明仓库。

本集成将没有公开 API 的能力视为暂不支持。
2026-09-14 检查公开 OpenAPI https://api.cnb.cool/swagger.json 时，未发现原生父子关系或阻塞关系端点，也未发现对应的 Issue 字段。

当前使用正文引用表示这些关系。逐一读取阻塞工单的当前状态；只有所有阻塞工单均已关闭，当前工单才解除阻塞。
这种约定不提供 CNB 原生的依赖约束或可视化。公开 API 支持可用后，再重新评估。

## Wayfinding 操作

以下约定使用已验证的基础 Issue 操作。
完整的多工单 `wayfinder` 流程尚未进行端到端测试。

工作地图是带有 `wayfinder:map` 标签的 Issue；工单类型使用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。

在工作地图正文中维护有序的子工单引用列表。
每个子工单在 `## Parent` 中引用工作地图，在 `## Blocked by` 中引用阻塞工单。
通过读取这些引用确定工单归属和阻塞关系。
可开始工作的工单集合由尚未关闭、尚未分配且所有阻塞工单均已关闭的子工单组成；按工作地图顺序选择第一个符合条件的子工单。

开始工作前，将工单分配给负责此次工作的开发者以标记领取，然后读回负责人列表。
负责人分配与筛选已经验证；多个会话并发时的独占领取尚未验证。

完成工单时，发布答案、关闭工单，并在工作地图中补充上下文指引。

## 验证

2026-09-14 使用 cnb 1.15.20，通过 Issue #1 验证了：
创建 Issue、通过 --body-file 更新正文、正文读回、评论创建与读回、标签创建、添加、筛选、移除、删除，以及关闭 Issue 并读回确认。
后续测试验证了重新打开为 open/reopened、可分配性、负责人分配与读回、按负责人筛选、负责人移除与读回、未分配筛选，以及恢复为 closed/completed。
评论分页使用现有评论验证了第 1 页包含评论、第 2 页为空。负责人和自定义属性读取也成功。

测试 Issue 已恢复为 closed/completed 且无负责人。临时标签已删除，后续测试未新增评论。
原生 Issue 关系通过公开 API 暂不支持，未进行写入测试。

## 现有本地文档

既有 `docs/superpowers/issues/` 文档继续遵循原有规则。
本次配置不迁移这些文档，也不建立自动同步。
