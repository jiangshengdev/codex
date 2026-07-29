# P3 · schema 注解差异时 last-writer-wins 静默覆盖 title/description

日期: 2026-05-30
状态: 🔴 未修复
范围: 批次 1(协议契约层 / export.rs 生成器)
优先级: P3

## 摘要

schema bundle 生成器当前仍有 last-writer-wins 边界：namespaced 路径经 `insert_definition` 时会在同名同结构、仅注解不同的情况下以 `[INFO]` 提示后覆盖；非 namespaced 路径仍直接 `definitions.insert(...)`，不会进入该提示/比较逻辑。

## 问题

`insert_definition` 在检测到同名 schema 定义冲突时，如果两者仅 `$schema` / `title` / `description` 不同且结构相同，就走 `schemas_match_except_annotations` 分支并用后写者整体覆盖先写者。该 `[INFO]` 覆盖行为适用于经 `insert_into_namespace` 委托到 `insert_definition` 的 namespaced definition；非 namespaced definition 当前仍直接 `definitions.insert(...)`，同名时不会经过该冲突提示路径。

## 证据

- 2026-07-09 只读复核：`build_schema_bundle` 会把嵌套 `definitions` 取出并插入 bundle definitions；有 namespace 时走 `insert_into_namespace`，无 namespace 时仍有直接 `definitions.insert(...)` 路径：`codex-rs/app-server-protocol/src/export.rs:993-1058`。
- namespaced 插入经 `insert_into_namespace` 委托给 `insert_definition`：`codex-rs/app-server-protocol/src/export.rs:1280-1292`。
- `insert_definition` 遇到同名 existing，若完全相等则返回；否则提取 existing/new title 后进入冲突判断：`codex-rs/app-server-protocol/src/export.rs:1297-1316`。
- `schemas_match_except_annotations(existing, &schema)` 成立时只输出 `[INFO] Replaced equivalent schema definition`，随后执行 `*existing = schema`：`codex-rs/app-server-protocol/src/export.rs:1316-1326`。
- 结构不同才返回 collision error：`codex-rs/app-server-protocol/src/export.rs:1328-1331`。
- `schemas_match_except_annotations` 会 clone 两边 schema，并通过 `remove_schema_annotations` 递归删除 `$schema` / `title` / `description` 后比较：`codex-rs/app-server-protocol/src/export.rs:1338-1358`。
- 现有测试明确断言仅注解不同的重复 schema 会合并，且最终保留后写 schema 的 `title` / property `description`；结构不同才报 collision：`codex-rs/app-server-protocol/src/export.rs:2461-2521`。

## 判断

未修复。旧记录描述的 build-time schema 生成器风险仍成立，但需区分路径：namespaced definition 的注解差异不会报 collision，而是以 info 级提示和后写覆盖处理；非 namespaced definition 仍存在直接 `definitions.insert(...)` 的后写覆盖边界。该问题仍不是运行时协议正确性问题，风险集中在生成 schema 的文档注解稳定性和可审查性。

## 影响

生成 JSON schema bundle 时，同名同结构定义如果从两处导出但带不同文档注解，最终保留哪份取决于插入顺序。下游如果读取 `title` / `description` 作为文档或 SDK 提示，会看到 last-writer-wins 结果；结构字段本身不会因此静默冲突。

## 后续处理

进入单独设计/计划阶段，决定是否需要更明确的冲突报告、注解合并策略或生成器级验证入口；不要在本 issue 内写 implementation plan。

## 验证记录

- 2026-07-09：只读复核上述代码路径和现有测试；未运行测试、未修改实现。

## 历史记录

- 2026-05-30 旧记录：`insert_definition` 在结构相同但注解不同的同名定义上会 last-writer-wins，并只输出 `[INFO]`。本次复核确认该行为在 namespaced / `insert_definition` 路径仍存在；非 namespaced 路径另有直接 `definitions.insert(...)` 的后写覆盖边界。
