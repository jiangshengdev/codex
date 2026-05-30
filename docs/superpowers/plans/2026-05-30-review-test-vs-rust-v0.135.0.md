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

**⚠️ 已纠正的执行错误(2026-05-30)**:先前版本写「审核不委派 sub-agent」,理由是「无法保证子代理
继承 high 思考深度」。这是错误推理 —— reviewer 强度门槛要的是「reviewer ≥ 实现者」,从不禁止委派,
只禁止用弱模型出 verdict。用户随后把默认设为 **Opus 4.8 + xhigh**,移除了「思考深度」这个借口。
正确做法:**派 `model: opus` 且 prompt 内明确要求高强度推理的子代理并行审独立批次**。

- 委派满足门槛的方式:`Agent(model: opus)` 显式指定(默认子代理是 cc 模型 sonnet/haiku,会违反门槛,
  故**必须显式写 opus**)+ prompt 内要求深推理。如此即「同模型 + 同思考深度」。
- 独立批次(5、6、7)→ 各派一个 Opus 子代理并行,只读取证 + 列候选问题。
- 最终 verdict 合并/去重、issue 文件产出由我(Opus)负责。已审的 1–4 可另派 Opus 子代理独立复核补漏。
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

状态截至 2026-05-30(压缩前快照)。批次 1–4 由我本人 Opus 串行审完,verdict 强度达标、结论有效。

- [x] 批次 1:协议契约层 — 完成。手写源仅 ~328 行,机械改动为主。产出 P3(export.rs 注解合并)。
- [x] 批次 2:Projection 核心状态/运行时 — 完成。产出 **P1、P2**。
- [x] 批次 3:Fanout 并发与消息投递 — 完成。关键结论:per-thread listener 是单一顺序 task
      (`thread_lifecycle.rs:305`),commit-mint 顺序 == enqueue 顺序,**历史的乱序担忧已结构性消解**。产出 P1。
- [x] 批次 4:请求处理与集成 — 完成。attach 流跑在同一 listener task + generation gate,做得严谨。
- [x] 批次 5:Projection 测试 — 完成(Opus 子代理审 + 我核实)。测试自身确定性良好(无 sleep/flaky),
      问题集中在覆盖缺口。产出 **P2(05)**。
- [x] 批次 6:Fork 发布/自更新 — 完成(Opus 子代理审 + 我核实)。产出 **P1(03)、P2(04)**。
- [x] 批次 7:杂项修复 — 完成(Opus 子代理审)。**未发现确信问题**;并纠正本计划两处事实错误(见下)。

### 已产出 issue 文件

- `issues/2026-05-30-01-projection-fanout-silent-invalidation.md` — **P1 高**:队列满(cap 32)触发
  `invalidate_thread_projection`,静默清空 subscriber + 重置 head,客户端无任何信号(协议无 server 主动
  中止事件)。`projection_fanout.rs:132`、`thread_projection.rs:362`。
- `issues/2026-05-30-02-thread-generations-unbounded.md` — **P2 中高**:`thread_generations` map 永不回收
  (全仓库无 remove/clear/retain),常驻进程慢速内存泄漏。`thread_projection.rs:67`。
- `issues/2026-05-30-03-doctor-update-url-points-upstream.md` — **P1 高**:`doctor/updates.rs:26` GitHub
  releases URL 仍指 `openai/codex`(姊妹文件 `tui/updates.rs:67` 已改 fork),Npm/Bun/Standalone/Other
  四种安装方式全走此 URL,fork 用户 `codex doctor` 拿上游版本错误比对。半改残留,已核实。
- `issues/2026-05-30-04-non-npm-update-channels-upstream.md` — **P2 中**:brew/standalone/homebrew-cask
  三条自更新通道仍指上游(`update_action.rs:43/48/57`、`updates.rs:66`),命中则更新覆盖成上游版。
  当前仅经 npm 分发,概率低。已核实。
- `issues/2026-05-30-05-projection-test-coverage-gaps.md` — **P2 中**:三条已知高风险路径无端到端覆盖
  (detach 后不再投递、队列满静默 invalidate、事件负载不断言),仅单测间接覆盖。呼应 01。
- `issues/2026-05-30-06-export-annotation-last-writer-wins.md` — **P3 低**:`export.rs:1310` schema 注解
  差异时 last-writer-wins 静默覆盖 title/description。仅 build-time 生成器,影响低。(原「待写 P3」已落盘)

### 子代理纠正的本计划事实错误(批次 7)

- **rollout policy 文件路径错**:在 `codex-rs/rollout/src/policy.rs`,**不在** `core/src/rollout/policy.rs`;
  且改动仅新增纯计数函数 `persisted_rollout_item_count`,无语义变更,非问题。
- **image detail enum 无 .rs 改动**:`6920ad3cd` 只改了生成物 JSON schema(2 文件 +4 行),手写源 enum
  定义/match/反序列化映射在 tag 处已是最终形态,无 wire 不兼容、无 round-trip 丢值。diff 里的
  `ImageDetail::Original` 全在新文件 `thread_projection.rs`(批次 2/4)。非问题。

### 已确认排除(不是问题,勿重开)

- 通知乱序:listener 单 task 顺序处理,无并发 mint → 无乱序。
- cursor/head 生产端 desync:生产环境唯二 no-cursor thread-scoped sender 只发非投影事件
  (`resolve_pending_server_request` 发 `ServerRequestResolved`);其余 `ThreadScopedOutgoingMessageSender::new`
  调用点全在 `bespoke_event_handling.rs` 的 `#[cfg(test)]`(行 >2078)内。
- attach-vs-unload race:由 generation gate 保护(`capture_snapshot_cut_if_generation_matches` +
  `attach_if_generation_matches`),attach 响应在 listener task 内串行执行。

### 续作步骤(压缩后从这里继续)

全部 7 批审核已完成,共产出 6 个 issue 文件(P1×2、P2×3、P3×1)。剩余可选项:

1. (可选)派 Opus 子代理独立复核批次 1–4 抓漏。
2. (可选)若用户要修复,按优先级:03(P1 doctor URL)→ 01(P1 静默失效)→ 02/04/05(P2)→ 06(P3)。
