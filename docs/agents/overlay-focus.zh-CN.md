# Modal／Drawer 焦点约束与菜单恢复排查

每个生产可达 Modal／Drawer 每次打开都要承担自己的初始焦点责任。阅读型弹层聚焦标题，标题不加入普通 Tab 顺序；操作型弹层聚焦有明确语义的控件。子弹层不能依赖父弹层代为完成初始焦点。待处理消息 Drawer 已有标题、指定分组和编辑恢复语义，新增行为必须保留它们。

新增或修改入口时，以真实组件的外部行为验证初始焦点、焦点包含、关闭恢复及重新打开；包含菜单时补充菜单关闭后的恢复链路和分层 Escape。通过 Escape 等方式取消菜单时，恢复仍存在的触发按钮；成功业务操作已有指定恢复目标时保留该目标，例如待处理消息重排后聚焦被移动的消息分组。成功操作删除触发器时，也应验证对应业务焦点目标，不能要求聚焦已删除的节点。保留 HeroUI／React Aria 的 ARIA、containment 和恢复责任，不新增全局强制恢复 owner 或万能 wrapper。代码里出现 `autoFocus` 不能代替行为验证。

## 已知竞争与证据入口

以下三个历史问题曾确认同一机制：菜单卸载后焦点暂落 BODY，React Aria `useDialog` 的延迟重聚焦先把焦点取到外层 dialog；菜单 `FocusScope` 下一帧发现当前焦点已不是 BODY，跳过恢复触发器。历史诊断对应 React Aria 3.50.0 的约 500ms timeout；当前安装版本及实现必须另行核对，不能只看锁文件。

| 历史问题 | 初始焦点修复 | 有效 Browser 回归入口 |
| --- | --- | --- |
| [#17 待处理消息 Drawer](https://cnb.cool/jiangshengdev/codex/-/issues/17) | `fb8ac3e91`，同步标题聚焦，保留指定分组和编辑行为 | `ComposerTurnControlPendingInputReordering.browser.test.tsx` 的 `moves pending messages through the authoritative owner and preserves menu and item focus`；`ComposerPendingInputInitialFocus.browser.test.tsx` 保留真实动画、键盘和窄屏覆盖 |
| [#18 导航 Drawer](https://cnb.cool/jiangshengdev/codex/-/issues/18) | `4926a8598`，关闭按钮初始聚焦 | `ActiveThreadCollectionMenu.browser.test.tsx` 的 `Escape restores task actions focus when dialog timers run before menu focus restoration` |
| [#217 全屏表格 Modal](https://cnb.cool/jiangshengdev/codex/-/issues/217) | `9cdc7851a`，关闭按钮初始聚焦 | `MarkdownTableControls.browser.test.tsx` 的 `restores fullscreen copy focus when dialog timers run before menu focus restoration` |

三个竞争回归共同使用 `src/__tests__/dialogMenuFocusRace.ts`：打开弹层前只接管 timeout，真实菜单卸载的 MutationObserver 中推进 500ms，保留真实 `requestAnimationFrame` 和 FocusScope 恢复；观察实际焦点、菜单卸载和操作结果。helper 检查竞争窗口确实经过，并在 finally 卸载 observer、恢复真实时钟。消费者验证自己的业务目标，helper 不调用 `focus()` 模拟成功。

## 最小诊断路径

遇到“菜单已关闭，焦点留在外层 dialog”时，先查历史机制，按以下次序收集能够判断同源的证据：

1. 确认菜单是卸载、退出动画还是仍挂载；记录菜单关闭到下一帧期间的 `document.activeElement`，核实焦点是否暂落 BODY。菜单仍存在时，先调查关闭流程。
2. 确认本次打开实际初始焦点目标及效果是否在 dialog 延迟 fallback 前成立，保留已有指定分组／编辑规则；不要仅搜索 `autoFocus`。
3. 核对本次运行实际解析的 HeroUI、React Aria 版本和 `useDialog`／`FocusScope` 实现。锁文件、源码 checkout 和运行时安装可能不同；同时核对验收服务是否提供当前源码。
4. 在允许的诊断边界内采集 `focus()` 调用栈和 focus 事件时序，判断 dialog timeout 是否抢在菜单真实恢复帧前取走焦点。优先运行一个受影响回归，不从大规模延迟扫描开始。

菜单卸载、焦点状态、版本与调用栈相符后，才按已知根因修复，并取得修复前失败／修复后通过的因果证据。若证据矛盾，再沿真实关闭、层级、触发器存活和业务恢复路径扩大调查。相似症状不是同源结论，重复绿测也不能替代因果证据。

禁止靠增加 sleep、重试、超时或改变并发掩盖故障；保留断言与检查能力。验证受影响完整文件及所需三浏览器和项目检查；没有新变化或未决证据时复用有效结果。Browser／Storybook 是 Level 1，真实 Codex 当前路由与状态的无头交互验收是 Level 2，两者分别记录。不能用已有历史验收替代当前最终集成状态的必要证据。
