# Rust Release Codex GUI 预检查设计

日期：2026-06-20

状态：设计草案。本文定义 `rust-release` workflow 的早期源码预检查，用来在慢速 native build、签名和打包开始前暴露 `codex-gui` 构建错误。

## 背景

`rust-release` 当前在 tag push 后先运行 `tag-check`，随后直接启动多个耗时产物 job，包括 native release build、Windows release assets、argument-comment-lint release assets 和 zsh release assets。

这次失败发生在最终 `release` job 的 `Stage npm packages` 步骤。该步骤调用 `scripts/stage_npm_packages.py`，再进入 `codex-cli/scripts/build_npm_package.py` 的 `stage_codex_gui_dist()`，执行：

```text
pnpm install --frozen-lockfile
pnpm run build
```

这些命令在 `codex-gui` 目录中运行。`codex-gui` 不属于仓库根 `pnpm-workspace.yaml`，它有自己的 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml`，所以 release preflight 也必须在 `codex-gui` 目录安装依赖。

其中 `codex-gui` 的 `build` 脚本是：

```text
tsc -b && vite build
```

因此，`transcriptStateSlice.ts` 中新增 `ThreadItem.type === "sleep"` 未覆盖导致的 TypeScript exhaustive check 错误，本可以在 release 早期通过 `codex-gui` 构建暴露，而不应等到约两小时后的最终 npm staging 才失败。

## 目标

- 在 release tag 通过版本校验后，尽早验证 `codex-gui` 是否能完成 release 需要的构建。
- 在 `codex-gui` 构建失败时，阻止慢速产物 job 启动。
- 保持最终 `release` job 的发布链路和 artifact 汇总逻辑不变。
- 使用现有 workflow 中已经固定版本的 checkout、pnpm 和 Node setup actions。
- 让类似 TypeScript、Vite build、GUI packaging prerequisite 的问题在几分钟内失败。

## 非目标

- 不重构 npm staging 脚本。
- 不把旧 run 的 artifacts 嫁接到新 SHA 的 release。
- 不在本次变更中加入完整 `codex-gui ci` gate。
- 不改变最终 `release` job 对产物 job 的依赖关系和发布条件。
- 不改变 npm publish OIDC 流程。

## 决策

### 1. 新增 `release-preflight` job

在 `tag-check` 之后新增 `release-preflight`：

```yaml
release-preflight:
  needs: tag-check
  runs-on: ubuntu-latest
```

该 job 使用源码级检查，不下载或依赖任何 release artifacts。

### 2. 预检命令

预检运行最小的 release 必需 GUI 构建路径：

```text
pnpm install --frozen-lockfile
pnpm run build
```

这两个命令必须通过 GitHub Actions `working-directory: codex-gui` 在 `codex-gui` 目录中执行，而不是使用 `pnpm --dir codex-gui install`。`pnpm --dir codex-gui install` 在 CI 中会输出 `No projects matched the filters`，不会安装 `codex-gui` 的 dev dependencies。

选择 `build` 而不是 `ci` 的原因：

- `build` 直接覆盖这次失败路径。
- `build` 包含 `tsc -b`，可以暴露 TypeScript 类型错误。
- `build` 比 `ci` 更贴近 npm staging 的实际 release prerequisite。
- `ci` 会额外运行 format、lint 和 test，覆盖面更广，但会让 release 入口更慢，也可能因为非打包必需检查阻塞发布。

### 3. 慢速 job 依赖调整

将以下 job 的 `needs` 从 `tag-check` 改为 `release-preflight`：

- `build`
- `build-windows`
- `argument-comment-lint-release-assets`
- `zsh-release-assets`

这些 job 是慢速或产物生成路径。预检查失败时，它们不会开始执行。

### 4. 最终 `release` job 保持不变

`release` job 继续显式依赖：

- `tag-check`
- `build`
- `finalize-macos`
- `build-windows`
- `argument-comment-lint-release-assets`
- `zsh-release-assets`

不额外把 `release-preflight` 加入 `release.needs`。原因是所有慢速产物 job 已经间接依赖 `release-preflight`；最终 `release` 只需要等待这些产物 job 成功即可。这样可以避免同步修改 `release.if` 条件，减少发布链路变更面。

## 错误处理

- `tag-check` 失败时，`release-preflight` 不运行。
- `release-preflight` 失败时，慢速产物 job 被跳过，最终 `release` 不满足现有 `needs.*.result == 'success'` 条件。
- `pnpm install --frozen-lockfile` 失败时，说明 `codex-gui` lockfile 或依赖解析在 release 环境不可复现。
- `pnpm run build` 失败时，错误会直接显示在早期预检 job 中。

## 验证计划

本地验证只覆盖静态结构和已修改文件的基本正确性：

- 检查 workflow YAML 能被解析。
- 运行 `git diff --check`。
- 复核 `needs: release-preflight` 只替换目标慢速 job。

远端验证由下一次 tag push 的 GitHub Actions run 完成。预期结果是：如果 `codex-gui` 类型或构建再次失败，workflow 在 `release-preflight` 阶段失败，不再消耗 native release build、签名和打包时间。

## 后续强化

如果后续希望进一步提高 release 入口质量，可以单独评估：

- 将 `release-preflight` 从 `build` 扩展为 `codex-gui ci`。
- 为 npm staging 脚本增加 dry-run 模式。
- 抽出 shared npm package preflight，覆盖 `codex-sdk` build。

这些都不是本次最小修补的一部分。
