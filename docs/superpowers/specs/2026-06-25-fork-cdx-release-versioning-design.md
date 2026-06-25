# Fork cdx Release Versioning 设计

## 背景

当前 fork 需要一套不会和 upstream release 冲突的版本号规则。已有冲突来自同名 tag：
fork 侧已有 `rust-v0.142.1`，同步流程再从 upstream 拉取同名 tag 时触发
`would clobber existing tag`。因此设计必须同时覆盖包版本、git tag、npm 发布通道、
Python runtime wheel 版本、installer 校验和 release workflow 的最小适配边界。

当前仓库内 `dev` 线的 `codex-rs/Cargo.toml` 版本为 `0.0.0`，release 线才使用实际发布版本。
`codex-rs/Cargo.toml` 的 `[workspace.package] version` 仍是 Rust workspace 的权威版本来源。

## 目标

- fork 包版本能表达 upstream 基线和 fork 补丁序号。
- 同一 upstream 基线下的 fork 补丁版本有序。
- fork 版本在 SemVer 排序中低于对应 upstream stable。
- fork release 不再创建与 upstream stable 完全同名的 tag。
- fork npm 发布推进默认安装通道。
- 尽可能保持普通 CI 和无关 Actions 不变。
- release 相关改动只覆盖支持 `cdx` 必需的判断和映射。

## 非目标

- 不改变普通 CI 的运行条件、测试矩阵或构建矩阵。
- 不把所有 release 版本解析抽象成新框架。
- 不支持任意 prerelease 标识符。
- 不改变 upstream stable、alpha、beta 的现有语义。
- 不修改 `dev` 分支使用 `0.0.0` 的开发默认版本规则。
- 不在本设计阶段实现代码、更新 workflow 或创建 tag。
- 不操作 git 远程。

## 已确认决策

### 包版本格式

Rust workspace、npm 主包、npm SDK 包和 npm responses API proxy 包统一使用：

```text
X.Y.Z-cdx.N
```

示例：

```text
0.142.1-cdx.1
```

含义：

- `X.Y.Z` 是 upstream 基线版本。
- `cdx` 是 fork 补丁通道。
- `N` 是该 upstream 基线上的 fork 补丁序号。

排序规则：

```text
0.142.1-cdx.1 < 0.142.1-cdx.2 < 0.142.1-cdx.3 < 0.142.1
```

### Git tag 格式

fork release tag 使用：

```text
rust-vX.Y.Z-cdx.N
```

示例：

```text
rust-v0.142.1-cdx.1
```

这个格式保留现有 `rust-v` release 入口命名风格，但不会和 upstream stable tag
`rust-vX.Y.Z` 完全同名。由于它仍匹配 `rust-v*.*.*` trigger，现有
`rust-release.yml` 的 tag-check 必须显式接受 `cdx.N`，否则 release 会在第一步失败。

### npm 发布语义

fork `cdx` release 发布 npm 包，并推进默认安装通道：

```text
@jiangshengdev/codex@latest -> X.Y.Z-cdx.N
```

这表示 fork 的 npm 用户默认安装当前 fork 正式版：

```sh
npm install -g @jiangshengdev/codex
```

平台包仍沿用现有拼接规则，在 release version 后追加平台标识：

```text
X.Y.Z-cdx.N-linux-x64
X.Y.Z-cdx.N-darwin-arm64
```

这些仍是合法 SemVer prerelease 版本。

### Python runtime wheel 映射

Rust/NPM SemVer 版本不能直接作为 Python wheel 的标准 PEP 440 版本。`cdx` 版本映射为
PEP 440 dev release：

```text
Rust/NPM: X.Y.Z-cdx.N
Python:   X.Y.Z.devN
```

示例：

```text
0.142.1-cdx.1 -> 0.142.1.dev1
0.142.1-cdx.2 -> 0.142.1.dev2
```

这个映射保持 Python 版本低于对应 stable `X.Y.Z`，并保留同一 upstream 基线内的顺序。

### Installer 版本校验

`scripts/install/install.sh` 和 `scripts/install/install.ps1` 只额外接受 `cdx.N`：

```text
X.Y.Z-cdx.N
```

不放开任意 prerelease。stable、alpha、beta 的现有支持保持不变。

### Release workflow 改动边界

普通 CI 不改。release 适配只进入以下必要入口：

- `rust-release.yml` 的 tag-check regex 接受 `cdx.N`。
- `rust-release.yml` 的 npm publish 判断把 `cdx.N` 视为应发布，并推进默认 npm tag。
- `rust-release.yml` 的 GitHub Release `make_latest` / `prerelease` 判断把 `cdx.N` 视为 fork 正式发布。
- Python runtime wheel staging 增加 `cdx.N -> .devN` 映射。
- installer 校验只额外接受 `cdx.N`。

不改与 `cdx` 无关的 workflow、job、matrix、缓存策略或 release artifact 命名。

### GitHub Release 语义

虽然 SemVer 层面 `X.Y.Z-cdx.N < X.Y.Z`，但 fork 发布层面将 `cdx` release 视为 fork 正式版：

- GitHub Release 不标记 prerelease。
- GitHub Release 设置为 latest。
- npm 发布推进默认 tag。

这使 fork 用户看到的默认 release 和默认 npm 安装版本一致。

### 版本递增规则

同一 upstream 基线只递增 `cdx.N`：

```text
0.142.1-cdx.1
0.142.1-cdx.2
0.142.1-cdx.3
```

upstream 基线升级后重置 `cdx.N`：

```text
0.142.2-cdx.1
```

禁止通过递增 upstream patch 来表达 fork 补丁，例如不要用 `0.142.2-cdx.1` 表达基于
`0.142.1` 的第二个 fork 补丁。

## 设计

### 1. 版本来源

release 分支上的 `codex-rs/Cargo.toml` 继续作为 Rust workspace 权威版本来源。
release tag 去掉 `rust-v` 前缀后必须等于 Cargo 版本：

```text
tag:        rust-v0.142.1-cdx.1
Cargo.toml: 0.142.1-cdx.1
```

`dev` 和其他开发分支仍可使用 `0.0.0`，避免日常开发状态混入 release version。

### 2. Tag 校验

release tag 校验应支持以下格式：

```text
rust-vX.Y.Z
rust-vX.Y.Z-alpha.N
rust-vX.Y.Z-beta.N
rust-vX.Y.Z-cdx.N
```

`cdx` 必须带数字序号，不支持裸 `-cdx`。

### 3. npm 发布判断

release workflow 对 npm 发布做如下分类：

```text
X.Y.Z          -> publish, npm default tag
X.Y.Z-alpha.N  -> publish, npm alpha tag
X.Y.Z-beta.N   -> no npm publish unless explicitly needed later
X.Y.Z-cdx.N    -> publish, npm default tag
```

`cdx` 不发布到 `cdx` dist-tag，因为已确认 fork release 要推进默认安装通道。

### 4. GitHub Release 判断

GitHub Release 的 latest/prerelease 判断不再简单等同于“版本是否包含连字符”。

目标分类：

```text
X.Y.Z          -> latest, not prerelease
X.Y.Z-alpha.N  -> not latest, prerelease
X.Y.Z-beta.N   -> not latest, prerelease
X.Y.Z-cdx.N    -> latest, not prerelease
```

### 5. Python runtime 版本映射

Python runtime staging 在接受 Codex release version 时识别 `cdx.N`：

```text
0.142.1-cdx.1 -> 0.142.1.dev1
```

这个映射只用于 Python wheel version，不反向改变 Rust/NPM/GitHub release version。

### 6. Installer 校验

installer 的 `latest` 解析保持现状。手动指定版本时接受：

```text
latest
X.Y.Z
X.Y.Z-alpha.N
X.Y.Z-beta.N
X.Y.Z-cdx.N
```

installer 仍按 release version 查找 GitHub Release asset，不把 `cdx` 转换成 Python wheel
版本。

## 影响范围

后续实现预计只需要检查或修改：

- `.github/workflows/rust-release.yml`
- `scripts/install/install.sh`
- `scripts/install/install.ps1`
- `sdk/python/scripts/update_sdk_artifacts.py`
- 相关 release/version parser 测试或 workflow 校验测试，如果现有测试覆盖这些入口

普通 CI workflow、Rust crate 代码、TUI 更新逻辑、npm staging 主体和平台包版本拼接不应成为默认修改范围。

## 风险与缓解

### 风险：`rust-v*` trigger 会触发现有 release workflow

选择 `rust-vX.Y.Z-cdx.N` 后，release workflow 会被触发。缓解方式是在进入实现前明确修改
tag-check，使 workflow 在第一步接受 `cdx.N`，并保持 tag version 和 Cargo version 一致。

### 风险：GitHub Release latest 语义与 SemVer prerelease 语义不同

`cdx` 在 SemVer 中低于 stable，但 fork release 中是正式版。缓解方式是只在 fork 发布语义中把
`cdx` 设为 latest，不改变 SemVer 版本字符串本身。

### 风险：npm default tag 指向 prerelease 字符串

这是已确认选择。缓解方式是让 release workflow 对 `cdx.N` 显式发布默认 npm tag，而不是依赖
“没有连字符就是 latest”的旧规则。

### 风险：Python wheel 版本不可逆

`0.142.1.dev1` 本身不携带 `cdx` 字样。缓解方式是让 wheel artifact 仍挂在
`rust-v0.142.1-cdx.1` GitHub Release 下，由 release tag 表达 fork 来源。

## 验收标准

设计实现后，一个 fork release `rust-v0.142.1-cdx.1` 应满足：

- `codex-rs/Cargo.toml` 中 workspace version 为 `0.142.1-cdx.1`。
- release tag-check 通过，且确认 tag version 等于 Cargo version。
- GitHub Release 名称为 `0.142.1-cdx.1`。
- GitHub Release 被设为 latest，且不标记 prerelease。
- npm 包发布到默认 tag，使 `@jiangshengdev/codex@latest` 指向 `0.142.1-cdx.1`。
- Python runtime wheel 使用 `0.142.1.dev1`。
- installer 接受手动指定 `0.142.1-cdx.1`。
- 普通 CI workflow 不因本规则发生行为变化。

## 后续计划入口

本设计确认后，下一步应编写实现计划。计划需要逐项列出：

- version/tag parser 变更点。
- release workflow 输出字段如何调整。
- Python runtime 版本映射的测试方式。
- installer 校验的最小测试方式。
- 不改普通 CI 的验证方式。
