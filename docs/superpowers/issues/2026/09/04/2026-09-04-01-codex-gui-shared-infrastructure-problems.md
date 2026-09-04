# Codex GUI 公共设施问题组

日期: 2026-09-04
状态: ✅ 已拆分
范围: `codex-gui/src/**` 的跨 feature 公共接口、共同契约与重复设施
优先级: P1

## 摘要

该 issue 已依据当前 research 拆分为 8 个可独立判断和后续处理的问题文件；问题核心是公共接口、依赖方向与少数真实重复，而不是缺少名为 `shared` 或 `utils` 的目录。

## 拆分索引

- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-01-cross-feature-public-api-boundaries.md`: 跨 feature 公共入口没有显式 public/internal 边界与依赖治理。
- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-02-active-thread-runtime-contract-direction.md`: active-thread projection 与 thread runtime 的契约归属和依赖方向不清。
- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-03-composer-draft-input-contract-direction.md`: Composer draft 与 input payload 的共同契约边界尚未命名。
- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-04-grapheme-bounding-primitive-duplication.md`: 三处产品 formatter 重复实现 Unicode grapheme 分段与有界截断机制。
- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-05-composer-shortcut-model-duplication.md`: Composer 快捷键行为与提示分别维护平台判定。
- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-06-thread-history-title-resolution-duplication.md`: History list/detail 重复标题选择规则。
- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-07-external-store-subscription-duplication.md`: 多个 owner 重复 listener 集合与订阅通知样板，但可共享边界仍待复核。
- `docs/superpowers/issues/2026/09/04/2026-09-04-01-codex-gui-shared-infrastructure-problems/2026-09-04-08-unknown-error-text-duplication.md`: 多处重复把 `unknown` error 转换为文本。

## 后续处理

后续更新在对应子 issue 中维护；父 issue 只保留索引。
