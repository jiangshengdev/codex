# release promotion skill 设计

日期：2026-06-27
状态：设计草案

## 背景

当前本地 release promotion 流程由三个手工阶段组成：

1. 将 `dev` 合并到 `test`，但不把 `docs/superpowers/**` 变更带入 `test`。
2. 将 `test` 合并到 `release`，同时保留 `release` 分支上的发布版本号。
3. 在 `release` 上把 fork 版本 `X.Y.Z-cdx.N` 更新为 `X.Y.Z-cdx.N+1`。

这个流程已经多次手工执行成功，但容易在以下位置出错：

- `dev -> test` 需要真实 merge commit，不能退化为文件同步提交。
- `docs/superpowers/**` 必须从 `dev -> test` merge commit 中排除。
- `test -> release` 不能把 `codex-rs/Cargo.toml` 的 release 版本改成 `0.0.0`。
- 版本 bump 必须和 merge commit 分离。
- 整个流程不能操作 git 远程。

本设计将流程固化为一个 repo-local Codex skill，供 Codex 和人类在终端中直接使用。

## 目标

- 新增 `.codex/skills/release-promotion/` skill。
- 将流程拆成多个可独立运行的小 Bash 脚本。
- 提供一个完整 wrapper 脚本顺序执行所有阶段。
- 支持 `--dry-run` 预览，不切分支、不写文件、不提交。
- 支持 `--continue`，用于人工解决冲突后继续完成验证和提交。
- 遇到非预期冲突时停在冲突界面，不自动 abort，不 reset。
- 运行前要求工作区 clean，且不存在未完成的 merge、cherry-pick 或 rebase。
- 全程禁止 git 远程操作，包括 `git fetch`、`git pull`、`git push`、`git remote`。
- 成功完成 wrapper 后停在 `release` 分支，工作区干净。

## 非目标

- 不自动推送、不打 tag。
- 不运行测试、格式化或发布 workflow。
- 不修改 `Cargo.lock`、`MODULE.bazel.lock` 或其他生成文件。
- 不支持自动解决非 `docs/superpowers/**` 冲突。
- 不用状态文件记录流程进度；恢复状态从 git 事实推断。
- 不处理远程 ahead/behind；脚本只基于本地分支指针工作。

## 文件布局

```text
.codex/skills/release-promotion/
├── SKILL.md
└── scripts/
    ├── lib-release-promotion.sh
    ├── merge-dev-to-test-without-superpowers.sh
    ├── merge-test-to-release.sh
    ├── bump-release-cdx-version.sh
    └── promote-dev-to-release.sh
```

`SKILL.md` 是 skill 入口，说明适用场景、命令接口、错误处理和恢复流程。

`lib-release-promotion.sh` 放共享 Bash 函数，包括：

- 仓库根目录定位。
- 工作区 clean 检查。
- 未完成 git 操作检查。
- 本地分支存在检查。
- 禁止远程命令的脚本约束说明。
- 版本读取和 `X.Y.Z-cdx.N` 解析。
- 阶段化日志输出。
- merge 状态检测。
- 通用验证函数。

各阶段脚本负责自己的分支切换、执行、验证和提交。wrapper 只负责顺序调用和恢复判断。

## 命令接口

### dev 到 test

```bash
.codex/skills/release-promotion/scripts/merge-dev-to-test-without-superpowers.sh
```

默认行为：

- 使用本地 `dev` 和 `test`。
- 要求工作区 clean。
- 切到 `test`。
- 执行 `git merge --no-ff --no-commit dev`。
- 自动排除 `docs/superpowers/**`。
- 验证 staged diff 中 `docs/superpowers/**` 为空。
- 提交 merge commit。
- 验证 `dev` 是 `test` 新 HEAD 的祖先。
- 验证 merge commit 对 `docs/superpowers/**` 的 diff 为空。

默认提交消息：

```text
merge(test): sync dev without superpowers
```

支持参数：

- `--dev <branch>`
- `--test <branch>`
- `--message <message>`
- `--dry-run`
- `--continue`

### test 到 release

```bash
.codex/skills/release-promotion/scripts/merge-test-to-release.sh
```

默认行为：

- 使用本地 `test` 和 `release`。
- 要求工作区 clean。
- 读取 `release:codex-rs/Cargo.toml` 当前版本。
- 切到 `release`。
- 执行 `git merge --no-ff --no-commit test`。
- 如果 merge 结果改动了 `codex-rs/Cargo.toml` 的版本，自动恢复为 merge 前 release 版本。
- 提交 merge commit。
- 验证 `test` 是 `release` 新 HEAD 的祖先。
- 验证 `codex-rs/Cargo.toml` 仍是 release 原版本。

默认提交消息：

```text
merge(release): sync test
```

支持参数：

- `--test <branch>`
- `--release <branch>`
- `--message <message>`
- `--dry-run`
- `--continue`

### release 版本 bump

```bash
.codex/skills/release-promotion/scripts/bump-release-cdx-version.sh
```

默认行为：

- 使用本地 `release`。
- 要求工作区 clean。
- 切到 `release`。
- 读取 `codex-rs/Cargo.toml` 的 workspace version。
- 只接受 `X.Y.Z-cdx.N`。
- 默认更新为 `X.Y.Z-cdx.N+1`。
- 只修改 `codex-rs/Cargo.toml` 的版本行。
- 提交版本 bump。
- 验证提交只改动 `codex-rs/Cargo.toml`。

默认提交消息：

```text
release: bump version to <new-version>
```

支持参数：

- `--release <branch>`
- `--target-version <version>`
- `--message <message>`
- `--dry-run`

`--target-version` 用于 wrapper 的可恢复执行。若当前版本已经等于目标版本，脚本必须验证存在对应版本 bump 提交后才认为阶段完成；否则报错。

### 完整 wrapper

```bash
.codex/skills/release-promotion/scripts/promote-dev-to-release.sh
```

默认行为：

1. dry-run 或执行前读取 `release` 当前版本，计算目标版本 `X.Y.Z-cdx.N+1`。
2. 执行 `merge-dev-to-test-without-superpowers.sh`。
3. 执行 `merge-test-to-release.sh`。
4. 执行 `bump-release-cdx-version.sh --target-version <computed-version>`。
5. 最终验证：
   - `dev` 是 `test` 祖先。
   - `test` 是 `release` 祖先。
   - `dev -> test` merge commit 不含 `docs/superpowers/**`。
   - `release` 版本等于目标版本。
   - 最后版本 bump 提交只改 `codex-rs/Cargo.toml`。
   - 工作区干净。

支持参数：

- `--dev <branch>`
- `--test <branch>`
- `--release <branch>`
- `--target-version <version>`
- `--dry-run`
- `--continue`
- 各阶段 message override。

wrapper 成功后停在 `release`。

## dry-run 行为

`--dry-run` 必须只读：

- 不切分支。
- 不写文件。
- 不进入 merge 状态。
- 不 stage。
- 不 commit。

dry-run 输出：

- 当前分支和工作区状态。
- `dev`、`test`、`release` 本地指针。
- `dev -> test` 的非 `docs/superpowers/**` diff 摘要。
- `dev -> test` 将排除的 `docs/superpowers/**` diff 摘要。
- `git merge-tree` 预览中是否存在冲突。
- `test -> release` diff 摘要。
- release 当前版本和目标版本。

dry-run 不根据 upstream ahead/behind 做判断，也不访问远程。

## 错误处理

脚本使用 Bash，并启用：

```bash
set -euo pipefail
```

所有错误输出使用阶段化前缀：

```text
[preflight]
[merge-dev-to-test]
[exclude-superpowers]
[merge-test-to-release]
[bump-version]
[verify]
[error]
```

### 运行前错误

以下情况直接拒绝运行：

- 当前目录不在目标仓库内。
- 目标本地分支不存在。
- 工作区不 clean，包括 tracked 或 untracked 变更。
- 存在未完成 merge、cherry-pick、rebase、bisect 等 git 状态。
- release 版本不是 `X.Y.Z-cdx.N`。

脚本不自动清理这些状态。

### merge 冲突

`dev -> test` 阶段：

- `docs/superpowers/**` 下的 modify/delete、新增、修改等冲突属于已知排除范围，脚本自动从 merge 结果中排除。
- 如果排除后仍存在非 `docs/superpowers/**` unmerged path，脚本停止在冲突状态，打印冲突文件和恢复说明。

`test -> release` 阶段：

- 任意 merge 冲突都停止在冲突状态。
- 脚本不自动 abort。
- 脚本不执行 `git reset --hard`。

停止时输出建议：

```text
[error] merge stopped with conflicts.
[error] Resolve conflicts manually, stage the resolved files, then run:
[error]   <same-stage-script> --continue ...
```

wrapper 遇到阶段冲突后立即退出，不继续后续阶段。

## continue 行为

阶段脚本的 `--continue`：

- 只在对应 merge 状态下可用。
- 不重新发起 merge。
- 检查是否仍有 unmerged path；如果有，继续报错并保持现场。
- 重新执行阶段不变量验证。
- 使用阶段默认 message 或传入 message 完成提交。

wrapper 的 `--continue`：

- 不写状态文件。
- 依赖 git 事实推断当前阶段：
  - 如果 `dev` 尚未成为 `test` 祖先，则继续或提示完成 `dev -> test`。
  - 如果 `test` 尚未成为 `release` 祖先，则继续或提示完成 `test -> release`。
  - 如果 release 版本尚未到 `--target-version`，则执行版本 bump。
- `--continue` 必须传入 `--target-version`，避免重复 bump。

## 幂等和跳过

wrapper 可以跳过已完成阶段，但必须验证关键不变量：

- 跳过 `dev -> test` 前，必须确认 `dev` 是 `test` 祖先，并且能定位到满足 `docs/superpowers/**` diff 为空的 merge commit。
- 跳过 `test -> release` 前，必须确认 `test` 是 `release` 祖先。
- 跳过版本 bump 前，必须确认当前 release 版本等于目标版本，并且最近的版本 bump 提交只改了 `codex-rs/Cargo.toml`。

如果无法证明阶段已正确完成，wrapper 报错而不是盲目跳过。

## 安全边界

- 不执行任何 git 远程命令。
- 不执行 `git reset --hard`。
- 不自动 abort 用户正在处理的冲突。
- 不自动删除非本流程创建的文件。
- 不修改锁文件。
- 不运行安装命令。
- 不把 `docs/superpowers/**` 带进 `dev -> test` merge commit。

## 验证策略

实现后至少需要以下验证：

1. `--dry-run` 在任意当前分支运行后，分支和工作区不变。
2. clean preflight 能拒绝 dirty workspace。
3. `dev -> test` 能生成真实 merge commit，且 `docs/superpowers/**` diff 为空。
4. `test -> release` 能保留 release 原版本。
5. `bump-release-cdx-version.sh` 只修改并提交 `codex-rs/Cargo.toml`。
6. wrapper 能按顺序完成三个阶段。
7. `--continue` 在人工解决冲突后能完成对应阶段。
8. 非 `X.Y.Z-cdx.N` 版本会报错。

这些验证可以通过临时本地分支或 throwaway repo fixture 运行，不能触碰远程。

## 后续计划入口

设计确认后再创建实现计划。计划需要拆成小步：

1. 创建 skill 目录和 `SKILL.md`。
2. 创建共享 Bash 库。
3. 实现 `merge-dev-to-test-without-superpowers.sh`。
4. 实现 `merge-test-to-release.sh`。
5. 实现 `bump-release-cdx-version.sh`。
6. 实现 wrapper。
7. 增加或执行本地验证。

在计划被确认前，不创建这些脚本。
