# P3 · schema 注解差异时 last-writer-wins 静默覆盖 title/description

日期: 2026-05-30
状态: 📏 待复核
范围: 批次 1(协议契约层 / export.rs 生成器)
优先级: P3

## 摘要

旧记录指出 schema 生成器在结构相同但注解不同的同名定义上会 last-writer-wins；当前代码状态尚未在本 issue 内复核。

## 问题

`insert_definition` 曾在检测到同名 schema 定义冲突时，如果两者仅 `title` / `description` / `$schema` 不同且结构相同，就走 `schemas_match_except_annotations` 分支并用后写者整体覆盖先写者。

## 证据

- 旧记录中的入口：`codex-rs/app-server-protocol/src/export.rs:1282` 的 `insert_definition`。
- 旧记录中的覆盖点：`export.rs:1310` 执行 `*existing = schema`。
- 旧记录中的提示范围：`export.rs:1301-1311` 只打一行 `[INFO]`。
- 旧记录中的比较逻辑：`remove_schema_annotations`(`export.rs:1331`) 递归剥掉 `$schema` / `title` / `description` 后比较结构。
- 注解差异因此不会触发 `export.rs:1314` 的 collision 报错，而是被视为等价合并。

## 判断

待复核。旧记录描述的是 build-time schema 生成器风险，不是运行时协议正确性问题；当前代码是否仍保持该行为需要重新核对。

## 影响

生成 JSON schema 时，同一类型如果从两处导出但带不同文档注解，最终保留哪份可能取决于插入顺序。风险集中在生成物文档字段，优先级低。

## 后续处理

先只读复核当前 `export.rs` 的同名 schema 合并行为和提示方式。若仍成立，再决定是否需要设计更明确的冲突报告或注解合并策略。
