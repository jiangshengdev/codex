# turn_start_zsh_fork 本地 nextest 隔离设计

## 背景

本地 `just test` 中，`codex-app-server::all suite::v2::turn_start_zsh_fork::*` 在并发运行时失败或 flaky。当前已确认的最小复现是：

```sh
cd codex-rs
just test -p codex-app-server turn_start_zsh_fork --test-threads 2
```

最新结果为 `4 tests run: 2 passed (1 flaky), 2 failed, 990 skipped`。失败发生在 JSON-RPC `initialize` 阶段：测试侧已经写入 initialize 请求，但 10 秒内没有从 app-server 子进程 stdout 收到响应；mock `/responses` 收到 0 请求。因此失败不在 turn、model、approval 或 zsh command 执行逻辑中，而在 app-server 子进程能处理请求之前。

相关环境差异：

- `just test` 在 Unix 下使用 `NEXTEST_PROFILE=local`。
- `codex-rs/.config/nextest.toml` 的 default profile 将 app-server integration tests 放入 `app_server_integration`，`max-threads = 1`。
- local profile 将同一类测试放入 `app_server_integration_local`，`max-threads = 4`。
- GitHub Actions macOS 测试成功，而本地 local profile 下失败，和上述并发策略差异吻合。

## 目标

只修复 `turn_start_zsh_fork` 在本地 local profile 下的并发失败，不改变产品行为，不修改 Rust 测试逻辑，不扩大到其它失败簇。

## 非目标

- 不调查或修复 SSE、MCP、pending_input、realtime、proxy 等其它方向。
- 不修改 app-server 启动逻辑。
- 不提高测试 timeout。
- 不给测试函数添加 `serial_test` 标记。
- 不改变 default profile 中 app-server integration tests 已有的串行策略。
- 不降低所有 app-server integration tests 在 local profile 下的并发度。

## 设计

在 `codex-rs/.config/nextest.toml` 中增加一个只服务于 `turn_start_zsh_fork` 的 local test group，例如：

```toml
[test-groups.app_server_zsh_fork_integration_local]
max-threads = 1
```

然后在 local profile 下增加一个更窄的 override，将目标模块放入这个 group：

```toml
[[profile.local.overrides]]
filter = 'package(codex-app-server) & kind(test) & test(turn_start_zsh_fork)'
test-group = 'app_server_zsh_fork_integration_local'
```

保留现有 local override：

```toml
[[profile.local.overrides]]
filter = 'package(codex-app-server) & kind(test)'
test-group = 'app_server_integration_local'
```

这样只有 `turn_start_zsh_fork` 在 local profile 下串行，其它 app-server integration tests 继续使用现有 `max-threads = 4`。

## 关键注意点

nextest override 的匹配和优先级必须通过验证确认。如果更窄的 `test(turn_start_zsh_fork)` override 被通用 app-server override 覆盖，需要调整 override 顺序或过滤表达式，直到目标测试实际进入新的串行 group。

设计不使用 `serial_test`，因为这里要表达的是运行器层面的资源隔离策略。仓库已有 nextest test group 管理 app-server integration test 并发，本设计沿用这个层级。

## 验证

只运行当前最小复现命令：

```sh
cd codex-rs
just test -p codex-app-server turn_start_zsh_fork --test-threads 2
```

通过标准：

- 四个 `turn_start_zsh_fork` 测试通过。
- 不再出现 initialize 阶段 `deadline has elapsed`。
- 不再出现 mock `/responses` matched 0 的失败。

不在本阶段运行 `just test -p codex-app-server` 或完整 `just test`。

## 风险

- 如果 nextest local override 优先级不符合预期，第一次实现可能无法改变该模块实际并发，需要调整配置顺序。
- 该设计解决的是本地测试调度导致的资源竞争，不定位 app-server 启动前具体慢点。
- 如果未来 `turn_start_zsh_fork` 拆分或重命名，需要同步更新 nextest filter。
