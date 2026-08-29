# Playwright 无头执行与 GUI 验收分级设计

日期：2026-08-29

状态：已确认

确认日期：2026-08-29

确认原文：确认设计。落盘

设计分支：`dev`

设计时 HEAD：`f9ce3876b1dec809754b59a7dd341a8e98d6ffa8`

## 唯一主目标

建立一套适用于已确认计划执行阶段的浏览器运行与 GUI 验收分级：常规 Playwright 自动化和真实应用验收默认使用无头模式，避免浏览器窗口干扰用户正常使用其他程序；只有确实依赖可见桌面状态的验收才能进入有头模式，并且必须先取得用户针对可见窗口的单独明确授权。

本设计只定义提示词和 skill 的责任分层、三级验收语义、模式选择、完成声明与首轮修改边界。它不是 implementation plan，不定义任务顺序、提交拆分、精确命令或逐字写入内容，也不授权修改提示词、skill、代码、Git index 或提交历史。

## 已确认的设计决策

### 采用三级 GUI 验收模型

#### 一级：自动化回归

一级覆盖隔离或测试环境中的浏览器自动化，包括 Playwright E2E、Vitest Browser Mode、DOM、事件、可访问性、截图和页面几何断言。

一级必须使用仓库现有的无头入口。不能为了观察方便改用 `--headed`、有头测试脚本、自动打开的 HTML 报告、trace viewer 或其他会占用用户桌面的界面。一级成功只证明相应自动化目标通过，不能替代真实应用集成验收。

#### 二级：真实应用验收

二级连接真实应用运行时，在无头浏览器中进入真实路由、建立真实状态，并执行受影响的布局、滚动、溢出、焦点、键盘、指针、可访问性和业务集成路径。

二级与一级的区别是运行对象和集成深度，不是浏览器是否可见。二级必须证明当前 URL、运行时、目标路由、真实状态和交互路径均命中；仅启动页面、获得截图、执行隔离 fixture 或让自动测试通过，不构成二级验收。

普通 GUI 修改只要其结果不依赖操作系统窗口、桌面可见状态或其他无头环境无法观察的能力，完成一级和适用的二级验收后即可宣称完整完成，不再要求启动可见浏览器。

#### 三级：可见桌面验收

三级仅覆盖结果本身依赖可见桌面状态的场景，例如：

- 浏览器或 DevTools 窗口的位置、尺寸、遮挡和窗口管理行为；
- 桌面焦点抢占或跨应用焦点行为；
- macOS 输入法候选窗口等操作系统级界面；
- 其他经证据确认无法由无头浏览器观察或等价证明的行为。

三级使用有头浏览器。执行已确认计划期间，启动任何可见浏览器、DevTools 或相关桌面窗口前，必须说明将出现的窗口及其影响，并取得用户针对该次可见窗口的单独明确授权。计划确认、设计确认、一般性的“继续”或既有真实 GUI 验收要求都不能替代该授权。

用户未授权三级验收时，只跳过三级及依赖它的完成声明；一级、二级和其他无依赖节点仍可继续。结果必须标记“可见桌面验收未执行”，不得把一级或二级结果冒充为三级证据。

### 当前 skill typeahead 任务属于二级验收

当前 skill typeahead 改动涉及来源分类、碰撞 path、长名称、窄视口、滚动、hover、键盘选择、可访问名称和多语言展示。这些行为都可以在连接真实 Codex runtime 的无头浏览器中建立并验证，不依赖桌面窗口、DevTools 窗口管理或系统级 IME。

因此，该任务应执行适用的一级自动化回归和二级真实应用无头验收，不应仅因缺少可见浏览器而阻塞，也不应自动触发三级验收。若后续验收目标新增 macOS IME 候选窗口、窗口焦点或其他桌面级行为，再按证据升级到三级并请求单独授权。

## 当前事实与问题校准

### 前端自动化入口已经默认无头

`codex-gui/playwright.config.ts` 已将 Playwright E2E 配置为 `headless: true`，并在 `codex-gui/package.json` 中把默认 `test:e2e` 与人工调试用 `test:e2e:headed` 分开。`codex-gui/vitest.browser.shared.config.ts` 也已将 Vitest Browser Mode 配置为 `headless: true`。

因此，本设计不需要修改测试配置、package scripts 或产品代码来实现普通自动化无头。真实缺口位于提示词路由和完成语义：当前前端规则把较广泛的用户可见变化都路由到可见 `$debug-responsive-gui`，导致本可在真实应用无头环境完成的验收也需要打开窗口。

### 无头不等于隔离测试

无头浏览器仍可以运行真实 Chromium、连接真实应用运行时、加载真实路由并执行真实交互。是否属于真实应用验收，应由运行时、路由、状态、交互和集成证据判断，不能仅凭浏览器是否有可见窗口判断。

反之，截图、DOM、事件断言或自动测试即使使用有头浏览器，也不会自动成为真实应用验收。验收等级必须由实际命中的对象和场景决定。

### 当前可见 GUI skill 是窄用途能力

`$debug-responsive-gui` 当前明确启动可见的 `Google Chrome for Testing`、打开 DevTools、布局窗口并进入响应式模式。该能力适合三级验收，但不应继续作为普通 GUI 修改的默认验收入口。

## 责任分层

### 全局系统提示词：简洁默认与授权边界

`/Users/jiangsheng/cnb/codex-config/AGENTS.md` 只增加跨项目稳定成立的短规则：

- 执行已确认计划期间，浏览器自动化和 GUI 验收默认无头运行，不得抢占用户桌面；
- 只有结果本身依赖可见桌面状态时才能进入有头模式；
- 启动可见窗口前必须取得用户针对该次窗口影响的单独明确授权；
- 未获授权时继续无依赖工作，并如实标记可见桌面验收未执行。

全局提示词不复制三级详细定义，不枚举 Playwright 参数、仓库脚本、浏览器 channel、`.playwright-cli/`、报告文件、trace、截图、能力信封字段或执行图节点 schema。

`/Users/jiangsheng/.codex/AGENTS.md` 是指向 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 的符号链接，两者是同一 canonical 资源。未来实施对后者的修改仍命中受保护全局提示词的专门写入确认门禁。

### 前端提示词：三级触发与完成语义

`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md` 负责 Codex GUI 专属分级：

- 把现有笼统的 `Real GUI Acceptance` 改为三级验收路由；
- 明确普通布局、滚动、overlay、焦点、键盘、指针和组件状态可以在二级真实应用无头验收中完成；
- 只有操作系统窗口、桌面焦点、系统 IME 等无头环境无法证明的行为触发三级；
- 要求计划和最终报告分别记录一级、二级、三级的适用性与结果。

该文件不复制 Playwright 命令、fnm/pnpm 入口、浏览器生命周期或窗口控制细节。

### `$codex-gui-toolchain`：一级与二级的详细入口 owner

`/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/SKILL.md` 承载 Codex GUI 的详细无头执行规则：

- 在计划和执行预检中选择仓库已有的无头 Playwright E2E、Vitest Browser Mode 或浏览器自动化入口；
- 区分一级隔离自动化与二级真实 runtime 验收，核验各自的 target discovery、URL、路由、状态和输出；
- 禁止为观察方便切换到 `test:e2e:headed`、`--headed` 或自动弹出的报告界面；
- 无头入口缺失或不能覆盖目标时停止受影响验证，不自行启动可见窗口作为 fallback；
- 只有证据表明目标属于三级时，才路由到 `$debug-responsive-gui` 并进入单独授权门禁。

具体命令必须继续以实时 `package.json`、固化入口和执行环境预检为准。本设计不把当前命令快照固化为永久规则。

### `$debug-responsive-gui`：三级可见桌面验收 owner

`/Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui/SKILL.md` 收窄为三级验收：

- description 和主流程明确它不负责一级、二级的默认验收；
- 在启动或复用任何有头浏览器、DevTools 或可见桌面窗口前检查本次单独授权；
- 保留 `Google Chrome for Testing`、语义定位、响应式窗口、IME 和真实可见状态的现有详细流程；
- 用户未授权时不打开窗口，返回“可见桌面验收未执行”及被阻断的场景；
- 不允许以有头模式的环境就绪、截图或 DOM 断言冒充三级场景通过。

### 通用阶段、授权和执行图 skill：保持不变

`$managing-work-stages`、`$action-authorization` 和 `$delegating-micro-stages` 已分别拥有阶段、授权和调度语义。它们现有字段足以记录最终选择的模式、可见窗口副作用和单独授权，不需要加入 Playwright 专属规则或新 schema。

浏览器模式不是委派语义：同一 Playwright 动作不能因为由主代理还是子代理执行而采用不同默认。执行图节点只消费对应工具 owner 已决定的模式，并在现有 `parameterBounds`、`commandScope`、`stateEffects` 和授权门禁中如实记录；不要求预判或枚举程序正常运行中自行生成的每个文件。

## 首轮修改边界

后续实施计划只考虑四个文件：

- `/Users/jiangsheng/cnb/codex-config/AGENTS.md`；
- `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`；
- `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/SKILL.md`；
- `/Users/jiangsheng/cnb/codex/.codex/skills/debug-responsive-gui/SKILL.md`。

首轮明确不修改：

- OpenAI 官方全局 skill `/Users/jiangsheng/.codex/skills/playwright/**`；
- 自动安装的第三方 skill `/Users/jiangsheng/cnb/codex/.agents/skills/playwright-cli/**`；
- `.playwright-cli/` 中程序自动产生的运行状态；
- `playwright.config.ts`、Vitest Browser Mode 配置、`package.json` 或产品代码；
- `$managing-work-stages`、`$action-authorization`、`$delegating-micro-stages` 及 execution graph schema；
- upstream base instructions、Default collaboration prompt、Git 远程或发布流程；
- 两份既有 skill typeahead 设计文档。

如果实施证据证明四文件中的某个文件无需修改，应从计划范围删除，不为对称性强行修改。若发现必须修改计划外文件才能满足已确认语义，必须回到计划边界重新确认，不能在实施中顺手扩大范围。

## 验收与报告边界

### 模式选择

- 执行计划中的浏览器动作默认无头；
- 一级和二级不得无依据升级为有头模式；
- 只有行为依赖可见桌面状态的证据才能触发三级；
- 三级启动可见窗口前存在独立、可审计的用户确认。

### 等级证据

- 一级报告实际命中的测试或自动化目标，不用零测试或空收集冒充成功；
- 二级报告真实 runtime、当前 URL、目标路由、建立的状态和执行的交互场景；
- 三级报告可见窗口环境和每个桌面级场景，不用环境就绪替代产品验收；
- 每一级分别记录 `passed`、`failed` 或 `unexecuted`，一个等级不能替代另一个等级。

### 完成声明

- 仅触发一级、二级的任务，在全部适用场景通过后可以宣称完整完成；
- 触发三级但未获授权或环境不可用时，必须标记“可见桌面验收未执行”，不得宣称完整完成；
- 未触发三级时，不得因为没有启动可见浏览器而把完整任务降级为未验收；
- 当前 skill typeahead 任务按一级加二级验收，不触发三级。

## 实施前门禁

设计已经确认并落盘，但不自动授权创建计划、修改提示词或 skill、验证、stage 或 commit。进入实施前仍须先编写独立计划并取得明确计划确认。

未来实施修改 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 前，必须展示拟写入该 canonical 全局提示词资源的精确内容，并取得面向受保护全局 `AGENTS.md` 的单独明确“确认写入”或等价授权。设计确认、计划确认和本次设计文档落盘都不能替代该 special approval。

计划还必须保护当前工作树中已有的 skill typeahead 四文件修改，不得把它们纳入本治理任务的格式化、暂存或提交范围。执行已落盘计划前，应按现行门禁先把本次相关工作文档创建为独立本地 Git 提交；不得操作 Git 远程。
