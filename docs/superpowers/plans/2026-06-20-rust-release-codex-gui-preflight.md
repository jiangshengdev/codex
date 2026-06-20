# Rust Release Codex GUI 预检查实施计划

> **给 agentic workers:** 按任务顺序执行本计划。步骤使用 checkbox (`- [ ]`) 语法跟踪。执行过程中不得修改设计文档或本计划正文，除非只是把已完成任务的 checkbox 打勾。

**目标:** 在 `rust-release` workflow 的慢速产物 job 启动前运行 `codex-gui` release 构建预检查，让 TypeScript 或 Vite build 错误在 release 早期失败。

**设计依据:** `docs/superpowers/specs/2026-06-20-rust-release-codex-gui-preflight-design.md`

**架构:** 新增 `release-preflight` job，挂在 `tag-check` 后。慢速产物 job 改为依赖 `release-preflight`。最终 `release` job 保持现有 `needs` 和 `if` 条件，不显式依赖 `release-preflight`。

**技术栈:** GitHub Actions YAML、pnpm、Node 22、`codex-gui` Vite build。

---

## 文件结构

**允许修改:**

- `.github/workflows/rust-release.yml`
  - 新增 `release-preflight` job。
  - 调整慢速产物 job 的 `needs`。

**不要修改:**

- `scripts/stage_npm_packages.py`
- `codex-cli/scripts/build_npm_package.py`
- `codex-gui/package.json`
- `docs/superpowers/specs/2026-06-20-rust-release-codex-gui-preflight-design.md`
- npm publish workflow 逻辑

## Task 1: 新增 `release-preflight` job

**文件:**

- 修改: `.github/workflows/rust-release.yml`

- [ ] **Step 1: 在 `tag-check` 后插入 job**

在 `tag-check` job 结束后、`build` job 之前新增：

```yaml
  release-preflight:
    needs: tag-check
    name: Release preflight
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - name: Setup pnpm
        uses: pnpm/action-setup@a8198c4bff370c8506180b035930dea56dbd5288 # v5
        with:
          run_install: false
      - name: Setup Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6.3.0
        with:
          node-version: 22
      - name: Install codex-gui dependencies
        run: pnpm --dir codex-gui install --frozen-lockfile
      - name: Build codex-gui
        run: pnpm --dir codex-gui run build
```

要求：

- 复用 workflow 中已有 pinned action 版本。
- 不启用 `run_install: true`。
- 不添加 artifact download。
- 不把 `codex-gui ci` 放入本计划。

- [ ] **Step 2: 检查 job 插入位置**

运行：

```sh
rg -n "release-preflight|name: Release preflight|Build codex-gui|^  build:" .github/workflows/rust-release.yml
```

预期：

- `release-preflight` 出现在 `build` job 之前。
- `Build codex-gui` 出现在 `release-preflight` 内。

## Task 2: 调整慢速产物 job 依赖

**文件:**

- 修改: `.github/workflows/rust-release.yml`

- [ ] **Step 1: 将 `build` 改为依赖 `release-preflight`**

把 `build` job 的：

```yaml
needs: tag-check
```

改为：

```yaml
needs: release-preflight
```

- [ ] **Step 2: 将 reusable release asset jobs 改为依赖 `release-preflight`**

把以下 job 的 `needs: tag-check` 改为 `needs: release-preflight`：

- `build-windows`
- `argument-comment-lint-release-assets`
- `zsh-release-assets`

- [ ] **Step 3: 保持最终 `release` job 不变**

确认 `release` job 的 `needs` 仍包含：

```yaml
- tag-check
- build
- finalize-macos
- build-windows
- argument-comment-lint-release-assets
- zsh-release-assets
```

不要加入：

```yaml
- release-preflight
```

也不要修改 `release.if` 条件。

## Task 3: 静态验证

**文件:**

- 验证: `.github/workflows/rust-release.yml`

- [ ] **Step 1: 检查 `needs` 分布和预检安装命令**

运行：

```sh
rg -n "needs: tag-check|needs: release-preflight|^  release:|needs\\.release-preflight|pnpm --dir codex-gui install --frozen-lockfile|pnpm install --frozen-lockfile" .github/workflows/rust-release.yml
```

预期：

- `release-preflight` 自身保留 `needs: tag-check`。
- `build`、`build-windows`、`argument-comment-lint-release-assets`、`zsh-release-assets` 使用 `needs: release-preflight`。
- 不出现 `needs.release-preflight`。
- 最终 `release` job 不显式依赖 `release-preflight`。
- `release-preflight` 使用 `pnpm --dir codex-gui install --frozen-lockfile`。
- `release` job 中原有 root `pnpm install --frozen-lockfile` 保持不变。

- [ ] **Step 2: 解析 workflow YAML**

优先使用 Ruby 标准库验证 YAML 结构：

```sh
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/rust-release.yml"); puts "ok"'
```

预期输出：

```text
ok
```

如果本机没有 Ruby，再使用仓库已有可用 YAML parser；不要为此安装依赖。

- [ ] **Step 3: 检查 diff 空白问题**

运行：

```sh
git diff --check
```

预期：无输出，退出码为 0。

- [ ] **Step 4: 复核 diff**

运行：

```sh
git diff -- .github/workflows/rust-release.yml
```

预期 diff 只包含：

- 新增 `release-preflight` job。
- 四个慢速产物 job 的 `needs` 从 `tag-check` 改为 `release-preflight`。

## Task 4: 可选本地 smoke

本任务只在执行者希望本地确认 `codex-gui` 构建路径时运行。它不是合并前强制项。

- [ ] **Step 1: 运行 GUI build**

运行：

```sh
pnpm --dir codex-gui run build
```

预期：构建成功。

如果失败，先确认失败是否来自当前工作区已有代码改动；不要在本计划内扩大到修复 `codex-gui` 业务逻辑，除非用户明确要求。

## 停止条件

- 如果需要修改 npm staging 脚本，停止并回到设计层。
- 如果需要把 `release-preflight` 加入最终 `release.needs`，停止并回到设计层。
- 如果需要把预检从 `build` 扩大到 `ci`，停止并回到设计层。
- 如果发现 `build` 之外还有另一个慢速 release job 直接依赖 `tag-check` 且会在预检失败时继续消耗大量时间，先记录发现并询问用户是否扩大范围。
- 如果 YAML 解析失败且原因不是本次编辑导致，停止并记录现有问题。

## 提交建议

计划执行完成后建议单独提交 workflow 变更：

```text
ci: preflight codex-gui before release builds
```
