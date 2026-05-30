# P3 · schema 注解差异时 last-writer-wins 静默覆盖 title/description

日期:2026-05-30
范围:批次 1(协议契约层 / export.rs 生成器)
优先级:低(仅 build-time schema 生成器,不影响运行时)

## 问题

`insert_definition`(`codex-rs/app-server-protocol/src/export.rs:1282`)在检测到同名 schema 定义冲突时,若两者**仅** `title` / `description` / `$schema` 不同(结构相同),走 `schemas_match_except_annotations` 分支并执行 `*existing = schema`(`export.rs:1310`)—— 后写者整体覆盖先写者,先写者的 `title` / `description` 被静默丢弃,只打一行 `[INFO]` 提示(`export.rs:1301-1311`)。

`remove_schema_annotations`(`export.rs:1331`)递归剥掉 `$schema`/`title`/`description` 后比较结构,因此注解差异不会触发 `:1314` 的 collision 报错,而是被当作「等价」合并。

## 为何是风险

生成 JSON schema 时,同一类型从两处导出但带不同文档注解,最终保留哪份取决于插入顺序(last-writer-wins),先写的文档串被悄悄覆盖。仅影响生成物的文档字段,且发生在 build time(生成器),不影响运行时协议正确性,故定低优先级。
