# 审核划分方案:test vs rust-v0.135.0

/ Review batching plan for `rust-v0.135.0..test`

日期:2026-05-30

## 审核对象 / Scope

- **比较**:`rust-v0.135.0` (tag, `f4a628f4`) → `test` 分支 (`a6534f8a`)
- **merge-base**:`4daceea8`
- **ahead / behind**:`0 / 219`(test 领先 219 个 commit,无落后;tag 完全包含在 test 中)
- **net diff**:`84 files changed, +10019 / -230`

## 产出目标 / Deliverable

产出 `docs/superpowers/issues/` 下的多个问题文件,命名 `2026-05-30-<slug>.md`(沿用既有惯例)。

写法约束(硬性):

- **只记问题与风险项**。正确的、做得好的地方一概不记录。
- **只说问题,不给解决方案,不管修复**。不写"建议方向"小节(区别于既有旧 issue 文件)。
- **按优先级排序**。文件内 Finding 从高到低排;跨文件用文件名/序号体现优先级。
- **问题不贪多**。重要问题详写(精确 `file:line` + 可观察坏结果);非重要问题简略一两句带过。
- **描述简洁**。每个 Finding:一句问题陈述 + 位置 + 为何是风险,点到为止。
- 优先级判定锚点:正确性 bug / 并发 race / 生命周期泄漏 > 协议契约不一致 > 健壮性/边界 > 风格。


## 审核基准(已定)/ Review baseline (decided)

按**最终 net diff**(`rust-v0.135.0..test` 的合并结果)审核,**跳过被 revert 的中间态**。
219 个 commit 含大量 merge/revert 噪音 —— 尤其 fanout 那段反复 revert + 重做才收敛,
逐 commit 审会重复审已废弃代码。盯最终状态,不逐 commit 重审。

## 执行约定 / Execution

- 最终 verdict 一律由 Opus(我)亲自出 —— 符合 reviewer 强度门槛(审核者 ≥ 实现者)。
- 独立批次(6、7)可派只读 sub-agent(cc 模型)并行扫描取证、列疑点,但 verdict 仍由我判定。
- 审核输出只列问题(delta),已解决/无问题项一句话聚合,不写"做得好的地方"清单。
- **生成物一律不看**:代码生成出来的产物(machine-generated)全部跳过,不核对。
  本次涉及:`app-server-protocol/schema/json/**`(JSON schema)、`app-server-protocol/schema/typescript/**`
  (ts-rs 生成,文件头带 `GENERATED CODE! DO NOT MODIFY BY HAND!`)。
  只审手写源。生成物的正确性由其生成器源码 + 测试间接保证,不逐字核对。

## 改动三大块 / Three areas

1. **核心新功能 Thread Projection**(占绝大部分,~8000+ 行)—— app-server 新增整套「线程投影」机制。
2. **Fork 发布/自更新改造**—— 流水线改用 fork 仓库、更新缓存挪到 cdx 目录、打包脚本。
3. **杂项小修复**—— windows-sandbox env、rollout policy、image detail enum 恢复等。

## 批次划分 / Batches

依赖链 **1 → 2 → 3 → 4 → 5** 必须顺序走(先懂契约才能审状态,先懂状态才能审并发)。
**6、7 互相独立**,可随时并行。审核重头是**第 2、3 批**。

| 批次 | 范围 | 量级 | 风险 | 依赖 |
|------|------|------|------|------|
| 1. 协议契约层(仅手写源) | `app-server-protocol/src/`:`protocol/v2/thread_projection.rs`(209) + `export.rs`(+107) + `common.rs`(+11) + `protocol/v2/mod.rs`(+2)。**`schema/json/**` 与 `schema/typescript/**` 为生成物,跳过。** | ~328 行手写 | 低(看类型定义 + 生成器逻辑) | 无,先审 |
| 2. Projection 核心状态/运行时 | `thread_projection.rs`(1042) + `thread_projection_runtime.rs`(938) + `thread_projection_cut.rs` + `thread_state.rs`(344) | ~2.3k | **高**(状态机/生命周期正确性) | 1 |
| 3. Fanout 并发与消息投递 | `projection_fanout.rs`(650) + `outgoing_message.rs`(293) | ~950 | **最高**(并发隔离/背压/generation gate/通知排序,历史 bug 高发区) | 2 |
| 4. 请求处理与集成 | `request_processors/thread_projection.rs`(746) + `thread_lifecycle.rs` + `thread_processor.rs` + `message_processor.rs` + `lib.rs` + tui hook | ~950 | 中 | 2、3 |
| 5. Projection 测试 | `tests/suite/v2/thread_projection.rs` + `mcp_process.rs` + `turn_interrupt.rs`/`turn_start.rs` | ~250 | 中(验证测试能否真抓并发 bug) | 2–4 |
| 6. Fork 发布/自更新 | `.github/workflows/*` + `codex-cli/` + `sdk/` + `scripts/` + tui updates(`updates.rs`/`update_action.rs`/`npm_registry.rs`/`doctor/updates.rs` + snapshots) | ~600 | 中(fork 仓库引用、缓存路径、版本) | 独立,可并行 |
| 7. 杂项修复 | `windows-sandbox-rs`(env) + `rollout/policy.rs` + image detail enum 恢复 + `core/tests/unified_exec.rs` | ~120 | 低 | 独立,可并行 |

## 进度跟踪 / Progress

- [ ] 批次 1:协议契约层
- [ ] 批次 2:Projection 核心状态/运行时
- [ ] 批次 3:Fanout 并发与消息投递
- [ ] 批次 4:请求处理与集成
- [ ] 批次 5:Projection 测试
- [ ] 批次 6:Fork 发布/自更新
- [ ] 批次 7:杂项修复
