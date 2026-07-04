# Rust Performance Detection Summary

## Report index

| Report | Scope | Status summary |
| --- | --- | --- |
| [01-app-server.md](01-app-server.md) | app-server projection state, attach, listener cursor, fanout, transient delta, fixtures | 已有 issue 仍成立 1；已修复但需回归覆盖 3；已过期 1；排除 1 |
| [02-app-server-protocol.md](02-app-server-protocol.md) | handwritten protocol source and schema export boundary | 无明显风险 1 |
| [03-gui-host.md](03-gui-host.md) | GUI host start/URL, WebSocket bridge, assets/dev proxy | 无明显风险 2；新发现 1 |
| [04-ext-gui.md](04-ext-gui.md) | `launch_gui` extension tool boundary | 无明显风险 1 |
| [05-tui-gui-boundary.md](05-tui-gui-boundary.md) | TUI `/gui` launch and projection routing boundary | 无明显风险 2 |
| [06-app-server-client.md](06-app-server-client.md) | app-server-client GUI facade | 无明显风险 1 |
| [07-secondary-rust-surfaces.md](07-secondary-rust-surfaces.md) | doctor, rollout stats, CI/build profile surfaces | 无明显风险 1；证据不足 1；排除 1 |
| [08-excluded-files.md](08-excluded-files.md) | generated outputs, tests, snapshots, static/frontend assets, assigned surfaces | 排除 4 |

## Status counts

按 report entry 统计，共 21 项：

| 状态 | 数量 |
| --- | ---: |
| 无明显风险 | 8 |
| 已有 issue 仍成立 | 1 |
| 已修复但需回归覆盖 | 3 |
| 已过期 | 1 |
| 新发现 | 1 |
| 证据不足 | 1 |
| 排除 | 6 |

## Known issue status changes

| Issue area | 状态 | Source |
| --- | --- | --- |
| `thread_generations` retained state | 已有 issue 仍成立 | [01-app-server.md](01-app-server.md#projection-state-and-generation) |
| projection attach path | 已修复但需回归覆盖 | [01-app-server.md](01-app-server.md#projection-attach-path) |
| projection fanout/backpressure | 已修复但需回归覆盖 | [01-app-server.md](01-app-server.md#fanout-and-backpressure) |
| transient delta and snapshot boundary | 已修复但需回归覆盖 | [01-app-server.md](01-app-server.md#transient-delta-and-snapshot-boundary) |
| listener eager history cursor | 已过期 | [01-app-server.md](01-app-server.md#listener-event-and-cursor-cost) |

## New findings

| Finding | 状态 | Source |
| --- | --- | --- |
| `gui-host` assets/dev proxy boundary: dev proxy 每个 proxied request 新建 `reqwest::Client`，并完整缓冲 upstream body 后返回 | 新发现 | [03-gui-host.md](03-gui-host.md#assets-and-dev-proxy-boundary) |

## Evidence gaps

这些是汇总层面的证据不足边界；其中只有 doctor 外部探测在分报告中作为独立 report entry 计入上方状态统计。

| Boundary | 状态 | Source |
| --- | --- | --- |
| `gui-host` WebSocket payload byte cap 边界：bridge channel 条数有界，但指定文件内未证明单条 WebSocket text / JSON-RPC payload 字节上限 | 证据不足 | [03-gui-host.md](03-gui-host.md#websocket-bridge-boundary) |
| `gui-host` assets 上游/body limit 边界：`assets.rs` 内未证明 prod index bytes、dev proxy response bytes、error string bytes 的上限或上游 body limit | 证据不足 | [03-gui-host.md](03-gui-host.md#assets-and-dev-proxy-boundary) |
| `doctor` 外部探测 timeout/异常环境边界：HTTP/curl 部分有 timeout，但 `npm root -g` 代码层未见 timeout，异常环境耗时未测 | 证据不足 | [07-secondary-rust-surfaces.md](07-secondary-rust-surfaces.md) |
| TUI global dispatcher 最终消费点范围外闭环：projection 通知在限定范围内归为 `Global`，但本轮未读取全局 notification dispatcher 的最终消费点 | 证据不足 | [05-tui-gui-boundary.md](05-tui-gui-boundary.md#projection-routing-boundary) |

## Final execution summary

Task 18 assembled the final summary from the eight report files, separated known issue status changes from new findings, and kept evidence gaps in their own section. No tests, benchmarks, schema generation, snapshot accept, formatting, install, git remote access, stage, commit, or Rust source edits were performed.
