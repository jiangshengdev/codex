# Streamdown HeroUI 控件执行记录

日期：2026-09-12

## 授权与基线

用户通过 `implement` 明确授权执行已确认设计与计划、验证、审查和本地提交。计划的执行门禁现为 active；保留全部负面约束，不安装、不操作远程、不修改第三方源码、不启动后端构建或可见窗口。`implement` 追加最终一次完整前端测试与双轴代码审查要求。真实应用验收仍需当前完整 URL 与已有样本，已异步请求；不阻塞独立实现。

节点字段沿用 plan.md 的公共契约与节点表；以下仅记录实际执行、资源和动态变化。主代理为本记录和主 checkout 唯一写 owner；任务代理无继续委派能力。

## 已完成事件

- D-S：核验 dev、仅四个相关文档未跟踪、index 无其他内容；精确暂存四文件，staged whitespace 检查通过。
- D-C：独立文档提交 `e49e4d92d8c25a3c56273eb710eae2b11aaeb810`。
- P：两个计划脚本依次成功，全部 sparse 输入、文档链接和 schema 后置条件通过。两分支均从上述同一 commit 创建，状态干净。创建项目内 `.worktrees/heroui` 只读源码链接。
- 2026-09-12 11:51–11:55 CST：T1-E、T2-E 分别在两个工作树同时推进。各代理只获本 ticket 源码／测试编辑与相关只读能力，生成、验证、stage、commit 待独立节点下发；编辑返回时能力到期。

## 实际资源

- C1 index：`/Users/jiangsheng/cnb/codex/.git/worktrees/streamdown-code-controls/index`。
- C2 index：`/Users/jiangsheng/cnb/codex/.git/worktrees/streamdown-table-controls/index`。
- 两工作树 node_modules 都指向主 checkout `codex-gui/node_modules`。
- fnm 管理的 Node 为 v24.17.0，pnpm 为 10.34.5，真实路径位于 `.local/share/fnm/node-versions/v24.17.0/installation/bin`。
- 通过项目声明依赖 `@playwright/test` 核验 Chromium、Firefox、WebKit 可执行文件均存在。首次尝试读取未直接声明的 `playwright` 包失败，仅为预检入口错误；改用已声明依赖后通过，没有安装。
- TypeScript 的四个 `.tmp/tsconfig.*.tsbuildinfo` 为共享增量资源。Vitest 的缓存从 `node_modules/.vite/vitest/<project-name hash>` 派生（安装包 resolveCacheDir 实现），两个工作树同名 Browser 项目会落到同一物理缓存，因此相关 Browser runner 互斥；独立编辑和各工作树 catalog 生成不因此串行。

## 验收边界

实现、任务提交、集成及自动化验证的结果见下方事件。Level 2 需要当前真实运行时的完整 GUI URL 和已有代码／表格样本；异步请求尚未收到，因此真实应用验收未执行。Level 3 不适用，没有开启可见窗口。

## 动态节点与事件

- T1-RED：消费 T1-E 首条稳定测试，单独授予验证能力；运行 `test:browser:parallel --run src/features/committedTranscriptSurface/__tests__/MarkdownCodeControls.browser.test.tsx`。实际三引擎各一个测试，均因旧按钮没有 `Copy code` 可访问名称失败，类型无错误。无下载断言尚未抵达，因此只记录名称契约红灯，不声称已验证全部目标。Browser/.tmp 锁已释放。
- T2-RED：在 T1 释放共享缓存后立即开始。先在编辑节点将能力 stub 移到 vi.hoisted，确保旧模块加载时只看到 writeText。11:57:38 CST 开始，运行 17.33 秒；三引擎各一个测试均因旧 `Copy table` 入口实际存在失败，类型无错误。符合能力矩阵的预期 RED，随后释放锁。
- 两个 RED 为原 T1-E/T2-E 内测试驱动切片的动态验证节点，单独动作、无源码并发读写；未形成两个任务之间的产品依赖。两任务现已续授各自编辑信封，继续并行实现。仅 T2-RED 曾因 canonical Browser 缓存由 T1 持有而等待，没有将该锁扩大到源码编辑。
- T1-Vearly：类型检查退出 0，新代码回归单文件三引擎共 12 项通过。随后主代理源码抽查发现 absolute 失败提示受 CodeBlock content-visibility 容器裁切的风险；T1-E2 将 Alert 放到 CodeBlock 外正常流，并补几何／末行命中断言。该修正后早期绿色证据失效，等待重新验证。
- T2-Vearly：类型检查退出 0，首条表格能力测试三引擎共 3 项通过。随后 T2-E2 增补双载荷、能力矩阵、失败重试、菜单／全屏／滚动和卸载验证。
- T1-G0/L/G1/GV：提取仅新增 Copy code、Code copied 与失败提示三条消息；补中文后重复提取 SHA-256 完全相同，没有既有语义、状态或范围漂移。
- T1-F：十个目标源码／测试／CSS 文件 oxfmt write 与 check 均通过。格式化改变消息行号，新增后置 catalog 再提取节点以闭合生成元数据，不能复用格式化前的 references。
- T1-E3：主代理审查发现 ScopedStyles 仍程序 focus 控件，不能证明计划要求的自然键盘可达性；授予该断言修正节点，保留焦点环检查。
- T1-Vlint 首次失败：新增文件存在 RegExp.exec、组件模块混合导出、浏览器可缺失 API 类型、void 回调和 unbound-method 规则问题。先限定 ESLint dry-run/--fix 完成可原生修复项，再 T1-E4 修正余项；没有豁免规则。T1-F3 与格式后两次提取通过，T1-Vlint2 退出 0。
- T2-V2：类型通过，36 项中 20 通过、16 失败。HTML 强调实际由安装包渲染为 span[data-streamdown=strong]，测试 strong 标签假设错误；RAC 菜单名由 trigger 的 aria-labelledby 决定；Firefox 横向滚动坐标为实际小数，保持位置应比较打开前读数；新增行贴底跟随存在实现缺陷。T2-E3 按各根因修正，保留语义与位置断言。
- T2-V3：36 项中 32 通过。双载荷三格式、能力矩阵、失败重试通过；发现用户上滚事件尚未派发时下一次内容提交抢回底部，T2-E4 改为在跟随前比较真实 scrollTop 与上次记录。WebKit 全屏内复制后退出菜单需先观察菜单卸载及触发器焦点恢复，再按 Escape；没有固定 sleep 或削弱层级关闭检查。
- T1-Vall 与 T2-Vlint 使用不同物理写资源并行：T1 持 Browser/.tmp 锁，T2 只写自己工作树 .eslintcache。T2 lint 发现三处 mock 缺泛型，T2-E5 仅修正签名；其 Browser 重验保持 ready，等待 T1 释放具体缓存锁。
- T1-Vall 首次 39/45 通过，其余为旧 outline 测量；本地 HeroUI 使用 box-shadow ring 与 outline-none，改为自然聚焦参考按钮后精确比较非空且含 focus token 的环。T1-Vrecheck 类型通过、六个完整文件三引擎共 45 项全部通过。
- T1-S/C：仅十二个目标文件精确暂存并审查，独立行为提交 `09c823c3d3a4c1d0218d7b1853a3264955f9ce93`；C1 工作树干净。
- I1：无冲突合并。主 checkout catalog 两次提取均稳定且没有额外变化，格式检查（401 文件）、lint、type-check 通过。候选 GUI tree 与已验证 T1 commit 完全相同，复用其 45 项 Browser 证据；没有冲突影响组合行为。仅精确再暂存两个 catalog，合并提交 `f3d0ecd7a` 保留 T1 身份。
- T2-V5：滚动双向语义已通过，唯一 Firefox 失败来自 pending 原生 disabled 触发器丢失焦点。T2-E7 核验 HeroUI Trigger 转发及 RAC Button 实际实现后使用 isPending 保留焦点并禁用重复操作，新增 pending Promise 回归。ES2023 输入不支持 Promise.withResolvers，T2-E8 改为普通 Promise resolver，不改配置。
- T2-G0/L/F/G1/G2/GV：仅五条目标消息，中文补齐；格式后的两次提取 SHA 完全相同，无其他语义/状态漂移。T2-Vall 类型、lint 通过，四个完整 Browser 文件三引擎共 57 项通过。
- T2-E9：主代理发现表格样式迁移将实际颜色/悬停/焦点环检查替换为状态属性，尚未保持原检查能力；补回 HeroUI 实际视觉 owner/token 断言，并显式关闭旧 controls.table，之后重新验证。
- T2-Vfinal：恢复完整视觉约束后 type-check、lint 与四文件三引擎 57 项全部通过。T2-S/C 精确十一文件，形成 `06739ff3df48174dad02c722f3e2d199cbb105f1`，C2 干净。
- I2：解决五个预期共享文件冲突。Unavailable 测试等待代码正文与 table；注册合并 code/table components 和 controls:false；CSS 删除两类旧控件覆盖而保留正文。每个普通文件处理后检查 marker/whitespace 并立即暂存。两个 catalog 先以当前本地译文为生成输入，由 messages:extract 从合并源码生成，再补回表格分支五条中文，不手拼 references；生成完成的文件分别核验并立即暂存。
- I2-GV：完整 331 消息、中文缺失 0，重复提取 SHA 一致：en `57235758b5e5ddabaf4c885f52fbb3eefcf64472fd9e6a5c8e6884ca307dd321`，zh `bddcea2793c33f4f3ba1385f42d1678e92886c5d544299a46c67a26c676839fa`。合并后格式（405 文件）、lint、type-check 通过。
- I2-V 组合：十文件三引擎共 192 项，191 通过；Firefox 深色样式测试焦点断言失败。初始假设为连续 Enter/ArrowDown 与菜单初始焦点竞争，测试改成先断言 Markdown 首项聚焦再发 ArrowDown；完整样式文件三引擎 12 项复验通过。但后续组合仍复现，初始假设不足，最终根因证据与修正见下方 FOCUS 节点。
- I2-C：精确暂存合并后 CSS、测试和 catalogs，检查无 unmerged/unstaged 产品差异；`181b293d6f10ea6ca7eb98aadaacfcd7c6d8faab` 合并提交保留两任务身份。
- FINAL-R：固定比较 `e49e4d92d...181b293d6`，分别启动 standards/spec 两个只读独立审查代理；均禁止编辑、运行测试、Git 写和继续委派。与主代理最终全量验证并行，审查输入为固定 commit。
- FINAL-V：按用户 implement 增加的最终完整套件要求，开始 unit/Browser/E2E；与独立 lint 和固定 commit 审查仅有稳定读交集。
- FINAL-R Standards：固定提交范围未发现规范违规或值得单列的启发式问题。Spec：发现 P2 静态长表初次自动到底；已核验原安装包只对 isAnimating 激活自动跟随。T2-E10 在 C2 三文件修正并补静态首行回归，不改动 C0 正在运行的稳定测试输入；后续将形成独立修正提交并重新审查。
- FINAL-V unit：99 文件、1250 项全部通过，5.25 秒；最终 lint 退出 0。
- FINAL-V Browser parallel：198 文件实例、1764 项中 1762 通过、2 失败，150.83 秒，无类型错误。本功能相关测试全部通过；失败分别为 Chromium ComposerPendingInputProvider 遮罩未弹确认（第85行）与 Firefox ThreadHistoryListPage 加载更多点击超时（第693行）。这两个 feature 与基线间无源码差异。前者与历史已记录的未定因失败一致；不据此认定本次失败根因，不修改相关模块、超时或断言。
- FINAL-V E2E：三浏览器 111 项全部通过，1.6 分钟。该入口使用模拟 host，与真实应用 Level 2 分开记录。运行保持 headless 且 PLAYWRIGHT_HTML_OPEN=never，没有打开报告窗口。
- FINAL-V Browser sequential：parallel 失败使 aggregate 的 && 未进入此阶段，因此单独运行项目 sequential 入口；27 文件实例、57 项全部通过，16.93 秒。没有重复整个套件或将未运行阶段算通过。
- T2-F3/G3/G4/GV：审查修正的三文件格式检查通过；两次 catalog 生成 SHA 与原分支一致，没有生成差异。T2-Vstatic 在 C0 sequential 释放共享 .tmp 后立即运行；独立源码修正与 C0 全套验证实际重叠。
- T2-Vstatic/S/C：完整 TableControls 三引擎 42/42，类型、lint、格式通过；独立修正提交 `3a099be8b94f769b9958091426a1cc19d9fc5e34`。两个原审查代理复核均通过，静态长表首次保持顶部，流式才自动跟随。主分支无冲突合入，形成 `c89a2ea`，没有 amend 原提交。
- FINAL-V unrelated：全量失败的两个完整 Browser 文件单独复验，三引擎 63/63。保留原全量两项失败记录；不能据重跑成功认定根因已解决，未改无关模块。
- FOCUS-D：静态修正后的 BC 195 项中 194 通过，Firefox 样式焦点再次失败。临时捕获 focusin/focusout、keydown、pointer 与 document.hasFocus；首个无条件 throw 诊断运行的两项失败属于预设输出，不能计为产品回归。全部临时诊断随后用 git restore 清除。
- FOCUS-Evidence：12:50:34 的组合运行捕获 Markdown focusout（relatedTarget 为空）时 document.hasFocus 从 true 变 false；紧接 ArrowDown 仍由驱动投递到旧 Markdown 元素，documentFocused=false。最终 CSV tabindex=0 且无 data-focused，未出现 CSV focusin。React Aria useSelectableCollection 的 blur 清除 manager.isFocused；useSelectableItem 的 tabindex 依赖 focusedKey，真实 focus 另受 isFocused 门控。这闭合了并行 Firefox 文档失焦与观测差异的链路，应用无需新增焦点 owner。
- FOCUS-Schedule：先尝试将整文件 git mv 到已有 sequential 目录，69/69 通过；独立规范审查指出只应限制已证明的 Firefox 冲突域。已撤销迁移，测试文件与 `c89a2ea` 完全一致，改为在现有 parallel/sequential 配置中仅将该文件的 Firefox 实例路由到 sequential。Chromium/WebKit 保持并行，断言、样本和三引擎覆盖不变。若未来驱动提供互不争用的 Firefox 文档焦点，再重新评估此局部调度。
- FOCUS-Collection：实例 include/exclude 覆盖父项；第一次仅配置额外 include 实际收集 42 项，未作为通过结论。随后以同一 const 保存原始 include/exclude，并在 Firefox 实例扩展。最终 sequential 收集 28 文件实例、61 项全部通过（原 57 加指定 Firefox 文件 4 项），17.68 秒；BC parallel 收集 29 文件实例、191 项全部通过，11.59 秒。BC 合计仍为 195 项，没有遗漏或重复计数。
- FOCUS-R/V/S/C：规范代理复核两配置通过，仅改变实际 Firefox 冲突域；最终 type-check、lint、format:oxfmt（405 文件）及 whitespace 检查通过。精确暂存两配置，独立提交 `67e52346e`，没有测试源码或应用焦点逻辑差异。

## 最终状态

- T1、T2、静态滚动修正与 Firefox 验证调度修正全部本地集成到 dev。双轴审查发现的静态长表问题已修复并独立复审，收尾调度问题也已独立复核。
- Level 1：最终受影响 BC 共 195/195；完整 unit 1250/1250、完整 E2E 111/111；全量 Browser 原始两项失败及对应完整文件复验 63/63 如实保留，不能声称全量首轮全绿。最后的 sequential 61/61 包含原完整串行套件。
- Level 2：未执行，缺当前完整 GUI URL 与真实样本状态。不能以模拟 host 的 E2E 或 Browser 测试替代真实应用验收，不能宣称完全验证。
- Level 3：不适用，未打开可见浏览器或 DevTools。
- 代码块与表格下载已移除；保留 HeroUI 复制、表格格式菜单及全屏交互。未修改 Streamdown 或其他第三方源码，没有依赖变化、安装、远程 Git 或后端构建。
- 两个任务工作树干净并保留；Cargo workspace.package.version 为 0.0.0。执行记录单独本地提交，计划和设计正文保持已确认历史版本。
