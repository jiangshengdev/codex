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

cnb issues update-issue --repo jiangshengdev/codex --number <number> --state closed --state-reason completed
```

- “发布到问题追踪器”指创建 CNB Issue。
- “获取相关工单”指读取完整正文、评论和标签。
- 持续翻页，直到读完所有相关记录。
- Issue 列表响应不包含完整正文，需获取 Issue 详情。
- 使用 `--labels` 和 `--state` 筛选 Issue 列表。
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

原生父子关系和阻塞关系尚未验证。开始需要这些关系的工作前，先检查当前 CNB 文档与 API 支持情况。
有原生能力时使用原生关系；只有确认缺少原生支持后，才用正文引用表示依赖关系。

不得将未知能力默认为不支持。

## Wayfinding 操作

完整的 `wayfinder` 集成尚未验证。

工作地图是带有 `wayfinder:map` 标签的 Issue；工单类型使用 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。

使用此流程前，先明确 CNB 如何表示工单归属的工作地图与阻塞关系。
将分配负责人用作领取标记前，先验证负责人操作。
可开始工作的工单集合由尚未关闭、尚未领取且所有阻塞项均已完成的子工单组成。

完成工单时，发布答案、关闭工单，并在工作地图中补充上下文指引。

## 验证

2026-09-14 使用 cnb 1.15.20，通过 Issue #1 验证了：
创建 Issue、通过 --body-file 更新正文、正文读回、评论创建与读回、标签创建、添加、筛选、移除、删除，以及关闭 Issue 并读回确认。

测试 Issue 已关闭，临时标签已删除。
负责人分配、重新打开以及原生 Issue 关系尚未测试。

## 现有本地文档

既有 `docs/superpowers/issues/` 文档继续遵循原有规则。
本次配置不迁移这些文档，也不建立自动同步。
