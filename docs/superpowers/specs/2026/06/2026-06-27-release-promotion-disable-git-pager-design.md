# Release Promotion 禁用 Git Pager 设计

## 背景

`release-promotion` 脚本在 dry-run 时会输出 `git diff --name-status` 结果。当差异较长且终端是交互式终端时，Git 可能启用 pager，例如 `less`，导致脚本看起来暂停，用户需要按 `q` 才能继续。

## 目标

- release-promotion 脚本中的 Git 命令不应进入 pager。
- dry-run 长输出应直接写到 stdout，便于复制、重定向和自动化执行。
- 保持现有安全边界：不新增远程 Git 操作，不运行测试、格式化、安装或发布命令。

## 方案

在 `.codex/skills/release-promotion/scripts/lib-release-promotion.sh` 的 `rp_git()` 中统一执行：

```bash
git --no-pager "$@"
```

`rp_git()` 已经是所有 release-promotion 脚本的 Git 调用入口。把禁用 pager 放在这里，可以覆盖 dry-run 的 `diff`，也覆盖后续可能新增的 `show`、`log`、`status` 等可能分页的命令。

## 非目标

- 不改变分支切换、merge、commit、version bump 的行为。
- 不调整 dry-run 输出内容。
- 不引入新的命令行参数或环境变量。
- 不修改 Git 全局配置。

## 验证

- 对所有 release-promotion `.sh` 文件运行 `bash -n`。
- 运行 `.codex/skills/release-promotion/scripts/promote-dev-to-release.sh --dry-run`，确认输出直接结束，不需要按 `q`。
- 不运行项目测试。
