# GUI 空任务加载实施计划

日期：2026-09-06。用户已确认计划、落盘、文档独立提交及实施。设计见同日期 specs/2026-09-06-gui-empty-thread-loading-design.md。

## 证据与范围

权威入口：GUI gateway→ActiveThreadSession→app-server thread_manager 与 projection→ThreadStore。loaded/list 已存在并在 host allowlist 中；read.status 来自异步 watcher，不代替内存集合。

修改范围：前端 guiHost/appServerProtocol、gateway、activeThreadSession 及相应测试和共享测试 harness；src/generated/appServerProtocol 由生成器维护。Rust thread-store store/types/local 及其测试、app-server request_processors/thread_projection.rs 和 tests/suite/v2/thread_projection.rs。必要的同范围测试契约实现同步纳入；不改公共协议 schema、依赖、Cargo 版本或通用规则。

公共 list_turns 被 read/resume/fork 消费，公共 validator 又被 items/search/realtime 复用，因此新增独立存储判定而非修改通用分页拒绝条件。独立反向审查已确认此范围。严格读取不能用会跳过 ghost_snapshot 的宽容恢复 reader。

## 执行上下文与授权

工作树 /Users/jiangsheng/cnb/codex，分支 dev；不创建 worktree。用户已确认共享当前工作树内前后端分别推进；读写集合不相交，Git index 仅主代理写。所有节点 subdelegation=false，deferralEvidence 默认为无。授权来源为当前用户对完整设计、计划及落盘的确认；允许范围内编辑、定向测试、生成、格式化、本地独立提交。禁止安装、后端构建、remote、amend、混入纯位置重排、修改全局规则及操作用户在用任务。

节点的最小能力信封在下发时按 action-authorization 明确。每个节点 executionContext 为上述工作树；资源锁为其 canonical writeSet 及对应 runner。失败域仅该分支和真实消费者；范围/用户行为变化需重新确认，计划内修正持续推进。

## 描述式 DAG

以下每行的输入、输出、完成证据分别对应 consumes、produces、completionEvidence；验证列也是 verification。编辑仅 apply_patch 普通源码内容，生成与格式化仅固化入口。owner 在执行记录绑定具体代理。

| nodeId / taskBoundary / operationKind | hardPredecessors 与原因 | outcome / completionEvidence | readSet / writeSet / stateEffects / commandScope | owner / estimatedCost |
| --- | --- | --- | --- | --- |
| D / docs / commit | 无 | 设计计划独立 commit | 两份文档；仅两文件 stage/commit；共享 index 独占 | 主代理 / 短 |
| FT / frontend / edit | D，取得实施前文档提交 | 未持久化加载行为回归稳定 | 前端上述范围读；测试写；apply_patch | 前端代理 / 中 |
| FR / frontend / verify | FT，读取测试 | 当前实现真实行为失败证据 | 前端测试及生成输入读；unit runner；fnm pnpm test:unit 定向 | 主代理 / 短 |
| FI / frontend / edit | FR，红灯成立 | 分流实现与补充契约测试稳定 | guiHost、activeThreadSession、相关 harness/tests 写；apply_patch | 前端代理 / 中 |
| FG / frontend / generate | FI，选中方法稳定 | 生成物与同入口 check 一致 | APP_SERVER_REQUEST_METHODS + app-server schema/json + gui-host schema 输入；generated appServerProtocol/guiHostContract 输出 | 主代理 / 短 |
| RT / rust / edit | D，取得文档提交 | session_meta-only projection 回归稳定 | Rust 上述范围读；测试写；apply_patch | Rust 代理 / 中 |
| RR / rust / verify | RT，读取回归 | 当前实现 Unsupported 红灯 | Rust crate/test 输入读；cargo target 独占；just test 精确过滤 | 主代理 / 中 |
| RI / rust / edit | RR，红灯成立 | store 判定与projection集成、负向/竞态测试稳定 | Rust 上述范围写；apply_patch | Rust 代理 / 长 |
| FMT / shared / format | FI、RI、FG，稳定文件防并发覆盖 | 格式检查通过 | 实际变更文件；just fmt 与前端 oxfmt 固化入口 | 主代理 / 短 |
| VF / frontend / verify | FMT，稳定前端 | unit、相关 Browser、类型/lint/生成检查通过 | 前端 inputs；测试缓存报告；已核验 pnpm 入口 | 主代理 / 中 |
| VR / rust / verify | FMT，稳定 Rust | 相关 store/projection/read/resume 定向回归通过 | Rust inputs；target；just test 有界过滤 | 主代理 / 长 |
| R / shared / review | FMT，稳定完整 diff | 独立审查事实与覆盖能力，无未处理问题 | diff与证据只读；无写 | 独立代理 / 中 |
| CF、CR / frontend、rust / commit | 各分支验证及R，消费稳定分支 | 前端与Rust两个独立行为提交 | 对应allowlist stage/commit；index串行 | 主代理 / 短 |
| L / shared / verify | VF、VR、R及含修复runtime | 四状态真实无头场景证据 | 当次专用任务/当前完整URL；运行前明确资产；无用户任务修改 | 主代理 / 中 |
| FIN / none / fan-in | CF、CR、L | 所有提交和最终状态验证闭合 | 提交/报告只读 | 主代理 / 短 |

初始 ready set={D}；D 完成后 FT、RT 同时就绪。FR 与 Rust 测试编辑无读写冲突，RR 与前端编辑无冲突。FMT 需消费两类稳定写集合；VF/VR/R 读稳定产物可并行，runner 各自独立。index 提交串行仅源于共享 index。关键路径预计为 Rust 回归、实现、验证及用户提供修复 runtime 后的 L。真实 runtime 未就绪仅阻塞 L/FIN，不阻断其他节点。

## 验证与生成入口

前端 cwd=codex-gui，使用 /opt/homebrew/bin/fnm exec --using-file pnpm。已核验 pnpm 10.34.5。unit 使用 test:unit 加精确路径；Browser 使用 test:browser:parallel 加相关 AppActiveThreadSession 路径，三个既有无头引擎；读取 vitest 文档后选精确参数。静态采用 type-check、lint、format:oxfmt、protocol:check-validators。protocol:generate-validators 消费现有 schema/json 与 method selection，维护整个 generated/appServerProtocol 和 generated/guiHostContract，后者预期无语义变化；不手工编辑生成物，重复同入口 check 保证稳定。

Rust 使用根 justfile（working-directory=codex-rs），入口 just test -p codex-thread-store <新增空历史测试过滤> 和 just test -p codex-app-server thread_projection；按实际受影响测试名补充 read/resume 定向过滤，禁止 crate/workspace 全扫。已核验 just/cargo/nextest 0.9.137。新增测试不存在时不能预称已命中；每次记录实际测试收集及结果。Rust 修改触发 just fmt，并检查实际范围外 diff，不自行还原用户文件。

Level 2 等用户构建当前 Rust 程序后执行；不运行 cargo build/run。当前 URL/进程资产尚未取得，执行时核验，不复用历史 token。Level 3 不适用。未知资产不妨碍其他实施；完成声明必须保留 L 未执行边界。

## 记录与失败闭环

执行记录单一 owner 为主代理，路径 research/2026/09/06/2026-09-06-gui-empty-thread-loading-execution.md，不与工作流重构调研混用。记录每个节点状态、真实时间、证据、锁和动态修正。修正遵循独立提交，不修改已确认计划正文。若检查提示契约冲突，先核验需求/后端契约，不以实现已经改变作为改测试依据。所有计划内失败持续诊断修正；工具或runtime缺失保留精确阻塞并继续独立分支。
