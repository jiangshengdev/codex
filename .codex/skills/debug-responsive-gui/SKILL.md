---
name: debug-responsive-gui
description: Use when debugging the Codex GUI with playwright-cli in a visible Google Chrome for Testing browser, including DevTools, responsive design mode, iPhone SE/XR checks, screenshots, or reproducible browser-control step records.
---

# Debug Responsive GUI

## 状态

草案。只把已经现场验证过的步骤写成稳定流程；未验证步骤必须继续记录证据后再固化。

## 基本规则

- 回复用户使用简体中文。
- 浏览器生命周期优先使用 `playwright-cli`。
- 调试浏览器必须是 `Google Chrome for Testing`，不是系统 `Google Chrome`。
- 浏览器必须可见；启动时必须带 `--headed`。
- 禁止使用 Computer Use。
- 禁止坐标点击。
- AppleScript 只用于系统层操作，例如激活应用、移动窗口、查询可见应用。
- 快捷键只有在用户明确允许对应快捷键时才能发送。
- 不确定视觉状态时必须截图或查询状态，不要盲猜。
- 每完成一步，都记录命令、观察结果和验证证据。

## 自动化脚本入口

脚本路径：

```bash
.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs
```

稳定用法：

```bash
node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<launch_gui 返回的 Local URL>'
```

规则：

- 先由 Codex 外层调用 `launch_gui` 获取当前 GUI URL，再传入 `--gui-url`。
- 脚本默认先 discovery，满足目标的步骤会跳过。
- 失败后可以直接运行失败的单步脚本继续。
- 脚本不自动选择或验证具体设备型号。
- 脚本不使用 Computer Use，不使用坐标点击。

## 打开 Test Chrome，并在启动时打开 DevTools

稳定命令：

```bash
profile=$(mktemp -d -t codex-cft-fresh-profile.XXXXXX)
mkdir -p "$profile/Default"
node - <<'NODE' "$profile"
const fs = require('fs');
const path = require('path');
const profile = process.argv[2];
const prefsPath = path.join(profile, 'Default', 'Preferences');
const prefs = {
  devtools: {
    preferences: {
      currentDockState: '"undocked"',
      'disable-locale-info-bar': 'true',
    },
  },
};
fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
NODE

cfg=$(mktemp -t codex-cft-devtools.XXXXXX.json)
printf '%s\n' '{"browser":{"launchOptions":{"args":["--auto-open-devtools-for-tabs"]}}}' > "$cfg"
playwright-cli close || true
playwright-cli open --browser=chromium --headed --profile="$profile" --config "$cfg" about:blank
printf 'PROFILE=%s\nCONFIG=%s\n' "$profile" "$cfg"
```

原因：

- `playwright-cli open` 默认是 headless，用户看不到浏览器。
- `playwright-cli open --headed` 默认可能打开系统 `Google Chrome`。
- `playwright-cli open --browser=chromium --headed` 会使用 `chrome-for-testing` channel，对应可见应用 `Google Chrome for Testing`。
- 默认每次使用新的临时 profile，避免旧 profile 残留设备、UA、缩放、崩溃恢复等状态。
- `--auto-open-devtools-for-tabs` 是 Chrome 启动参数，会在 tab 启动时自动打开 DevTools；不要用 `Command+Option+I` 之类的 toggle 快捷键替代。
- 启动前写入 `currentDockState` 和 `disable-locale-info-bar`，让 DevTools 独立窗口打开并关闭语言提示横幅。
- `playwright-cli` 的 daemon 会脱离当前 shell，配置必须是真实文件路径；不要用 `<(...)` 进程替换。

验证：

```bash
playwright-cli list --json
node -e 'const fs=require("fs"); const path=require("path"); const prefs=JSON.parse(fs.readFileSync(path.join(process.argv[1],"Default","Preferences"),"utf8")); console.log(JSON.stringify(prefs.devtools.preferences,null,2));' "$profile"
osascript -e 'tell application "System Events" to get name of every process whose visible is true'
ps -axo pid,ppid,comm,args | rg -i 'Google Chrome for Testing|chrome-for-testing|playwright_chromiumdev_profile' | rg -v rg
```

期望证据：

```text
browserType: chrome-for-testing
headed: true
persistent: true
Google Chrome for Testing
--auto-open-devtools-for-tabs
currentDockState: "\"undocked\""
disable-locale-info-bar: "true"
```

## 分离 DevTools 窗口

已验证目标：让 `--auto-open-devtools-for-tabs` 打开的 DevTools 以独立窗口显示，而不是停靠在页面窗口内。

稳定命令：

```bash
profile=$(mktemp -d -t codex-cft-undocked-profile.XXXXXX)
mkdir -p "$profile/Default"
printf '%s\n' '{
  "devtools": {
    "preferences": {
      "currentDockState": "\"undocked\""
    }
  }
}' > "$profile/Default/Preferences"

cfg=$(mktemp -t codex-cft-devtools.XXXXXX.json)
printf '%s\n' '{"browser":{"launchOptions":{"args":["--auto-open-devtools-for-tabs"]}}}' > "$cfg"

playwright-cli close || true
playwright-cli open --browser=chromium --headed --profile="$profile" --config "$cfg" about:blank
```

原因：

- DevTools 停靠状态是 Chrome profile 偏好；先写入 `Default/Preferences`，再启动 CFT。
- `currentDockState` 的值必须是 JSON 编码后的字符串，所以文件里写的是 `"\"undocked\""`。
- 现有已停靠 DevTools 不要用快捷键盲切；需要独立窗口时，用带偏好的临时 profile 重启更稳定。

验证：

```bash
playwright-cli list
osascript -e 'tell application "Google Chrome for Testing" to activate' \
  -e 'tell application "System Events" to tell process "Google Chrome for Testing" to get {name, value of attribute "AXFullScreen", position, size} of every window'
```

期望证据：

```text
browser-type: chrome-for-testing
headed: true
DevTools - about:blank
about:blank - Google Chrome for Testing
```

已验证左右排布命令：

```applescript
tell application "Google Chrome for Testing" to activate
tell application "System Events"
  tell process "Google Chrome for Testing"
    repeat with i from 1 to count of windows
      set w to window i
      set windowName to name of w
      set value of attribute "AXFullScreen" of w to false
      if windowName starts with "DevTools" then
        set position of w to {-960, 30}
        set size of w to {960, 1050}
      else if windowName contains "Google Chrome for Testing" then
        set position of w to {-1920, 30}
        set size of w to {960, 1050}
      end if
    end repeat
    return {name, value of attribute "AXFullScreen", position, size} of every window
  end tell
end tell
```

已验证成功输出：

```text
DevTools - about:blank, about:blank - Google Chrome for Testing, false, false, -960, 30, -1920, 30, 960, 1050, 960, 1050
```

## 关闭 DevTools 语言提示横幅

已验证目标：关闭 DevTools 顶部的 `DevTools is now available in Chinese` 语言提示横幅，等价于点击横幅里的 `Don't show again`。

源码依据：

- DevTools 前端 `front_end/ui/legacy/InspectorView.ts` 用 `createSetting('disable-locale-info-bar', false)` 控制这个横幅。
- `Don't show again` 来自 `front_end/ui/legacy/Infobar.ts`，点击后会对传入的 disable setting 执行 `.set(true)`。
- DevTools setting 写入 Chrome profile 时会先 `JSON.stringify`，所以 `true` 在 `Default/Preferences` 中保存为字符串 `"true"`。

稳定写法：

```bash
profile=$(playwright-cli list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); const b=j.browsers?.find(x=>x.name==="default")||j.browsers?.[0]; console.log(b?.userDataDir||"");})')
playwright-cli close || true
node - <<'NODE' "$profile"
const fs = require('fs');
const path = require('path');
const profile = process.argv[2];
const prefsPath = path.join(profile, 'Default', 'Preferences');
fs.mkdirSync(path.dirname(prefsPath), {recursive: true});
let prefs = {};
try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8')); } catch {}
prefs.devtools ??= {};
prefs.devtools.preferences ??= {};
prefs.devtools.preferences.currentDockState = '"undocked"';
prefs.devtools.preferences['disable-locale-info-bar'] = 'true';
fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
NODE

cfg=$(mktemp -t codex-cft-devtools.XXXXXX.json)
printf '%s\n' '{"browser":{"launchOptions":{"args":["--auto-open-devtools-for-tabs"]}}}' > "$cfg"
playwright-cli open --browser=chromium --headed --profile="$profile" --config "$cfg" about:blank
```

验证：

```bash
node -e 'const fs=require("fs"); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,"utf8")); console.log(JSON.stringify(j.devtools.preferences,null,2));' "$profile/Default/Preferences"
```

期望证据：

```json
{
  "currentDockState": "\"undocked\"",
  "disable-locale-info-bar": "true"
}
```

如果重启后出现 `要恢复页面吗？` Chrome 提示，不要坐标点击。用 AX 层级查找描述为 `关闭` 的 `AXButton` 并执行 `AXPress`：

```applescript
on pressClose(e)
  tell application "System Events"
    try
      if role of e is "AXButton" and description of e is "关闭" then
        perform action "AXPress" of e
        return true
      end if
    end try
    try
      repeat with c in UI elements of e
        if my pressClose(c) then return true
      end repeat
    end try
    return false
  end tell
end pressClose

tell application "System Events"
  tell process "Google Chrome for Testing"
    repeat with w in windows
      if name of w is "要恢复页面吗？" then
        return my pressClose(w)
      end if
    end repeat
  end tell
end tell
```

## 重新启动 GUI 并访问当前 URL

稳定流程：

1. 先确认当前浏览器会话仍是 Test Chrome：

   ```bash
   playwright-cli list
   ```

   期望证据：

   ```text
   browser-type: chrome-for-testing
   headed: true
   ```

2. 调用 `launch_gui` 获取当前返回的 `Local` URL。

   注意：不要复用旧 URL，也不要假设端口或 token 不变。

3. 用当前 Test Chrome 访问新的 `Local` URL：

   ```bash
   playwright-cli goto '<local-url>'
   ```

4. 验证 HTTP 状态：

   ```bash
   curl -sI '<local-url-without-fragment>' | sed -n '1,20p'
   ```

   期望证据：

   ```text
   HTTP/1.1 200 OK
   ```

5. 验证页面状态：

   ```bash
   playwright-cli --raw eval "JSON.stringify({url: location.href, title: document.title, text: document.body.innerText.slice(0, 500)})"
   ```

   期望证据：

   ```text
   "title":"codex-gui"
   ```

只有 `playwright-cli list` 显示浏览器不存在、不是 `chrome-for-testing`，或不是 `headed: true` 时，才重新打开 Test Chrome。

## 新临时 profile 完整 GUI 流程

已验证目标：每次用新的临时 profile 启动 Test Chrome，打开当前 GUI，排布浏览器和 DevTools，并进入响应式模式。

流程：

1. 用“打开 Test Chrome，并在启动时打开 DevTools”的命令启动新临时 profile。
2. 调用 `launch_gui` 获取当前 `Local` URL，不复用旧 URL。
3. 访问 GUI：

   ```bash
   playwright-cli goto '<local-url>'
   ```

4. 验证页面：

   ```bash
   curl -sI '<local-url-without-fragment>' | sed -n '1,12p'
   playwright-cli --raw eval "JSON.stringify({url: location.href, title: document.title, text: document.body.innerText.slice(0, 240)})"
   ```

   期望证据：

   ```text
   HTTP/1.1 200 OK
   "title":"codex-gui"
   ```

5. 排布窗口到另一块屏幕左右两侧：

   ```applescript
   tell application "Google Chrome for Testing" to activate
   tell application "System Events"
     tell process "Google Chrome for Testing"
       repeat with i from 1 to count of windows
         set w to window i
         set windowName to name of w
         set value of attribute "AXFullScreen" of w to false
         if windowName starts with "DevTools" then
           set position of w to {-960, 30}
           set size of w to {960, 1050}
         else if windowName contains "Google Chrome for Testing" then
           set position of w to {-1920, 30}
           set size of w to {960, 1050}
         end if
       end repeat
       return {name, value of attribute "AXFullScreen", position, size} of every window
     end tell
   end tell
   ```

   如果 DevTools 保持 `640x640`，单独对 DevTools 窗口再设置一次：

   ```applescript
   tell application "Google Chrome for Testing" to activate
   tell application "System Events"
     tell process "Google Chrome for Testing"
       repeat with w in windows
         if name of w starts with "DevTools" then
           set value of attribute "AXFullScreen" of w to false
           perform action "AXRaise" of w
           delay 0.1
           set position of w to {-960, 30}
           delay 0.1
           set size of w to {960, 1050}
           return {name of w, value of attribute "AXFullScreen" of w, position of w, size of w}
         end if
       end repeat
       return "DevTools window not found"
     end tell
   end tell
   ```

6. 先用 metrics 检测是否已经是移动响应式状态；如果是桌面状态，再对 DevTools 窗口发送 `Command+Shift+M`。
7. 设备型号由人类在 DevTools 设备下拉框选择；切换后刷新页面并重新验证 metrics：

   ```bash
   playwright-cli reload
   playwright-cli --raw eval "JSON.stringify({url: location.href, title: document.title, innerWidth, innerHeight, outerWidth, outerHeight, dpr: devicePixelRatio, visualViewport: {width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale}, documentElementClientWidth: document.documentElement.clientWidth, bodyClientWidth: document.body && document.body.clientWidth, maxTouchPoints: navigator.maxTouchPoints, ua: navigator.userAgent, viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') || null})"
   ```

已验证新临时 profile 默认响应式证据：

```text
新临时 profile 不保留之前手动选择的 iPhone SE。
进入响应式模式后，Chrome 默认设备可能是 Pixel 9：
outerWidth: 400
outerHeight: 876
documentElement.clientWidth: 400
body.clientWidth: 400
dpr: 2
maxTouchPoints: 1
UA: Android Pixel 9
```

注意：

- 每次新临时 profile 的好处是状态干净；代价是不会保留上次手动选过的设备型号。
- 需要 iPhone SE 时，进入响应式模式后由人类在 DevTools 设备下拉框选择；选择后刷新一次页面再读 metrics。

## 将 Test Chrome 移到另一块屏幕

已验证目标：把 `Google Chrome for Testing` 移到 Codex 所在屏幕之外的另一块屏幕，并让窗口占满可见区域但不进入全屏。

先确认屏幕布局：

```bash
osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSScreen.screens.js.map((s, i) => ({i, frame: ObjC.deepUnwrap(s.frame), visible: ObjC.deepUnwrap(s.visibleFrame)}))'
```

已验证屏幕布局：

```text
screen 0: frame=0,0,1920,1080 visible=0,0,1920,1050
screen 1: frame=-1920,0,1920,1080 visible=-1920,0,1920,1080
```

先查询当前 CFT 窗口：

```bash
osascript -e 'tell application "Google Chrome for Testing" to activate' \
  -e 'tell application "System Events" to tell process "Google Chrome for Testing" to get {name, value of attribute "AXFullScreen", position, size} of every window'
```

已验证移动命令：

```applescript
tell application "Google Chrome for Testing" to activate
tell application "System Events"
  tell process "Google Chrome for Testing"
    repeat with i from 1 to count of windows
      set w to window i
      if name of w contains "Google Chrome for Testing" then
        set value of attribute "AXFullScreen" of w to false
        set position of w to {-1920, 30}
        set size of w to {1920, 1050}
        return {i, name of w, value of attribute "AXFullScreen" of w, position of w, size of w}
      end if
    end repeat
    return "Google Chrome for Testing window not found"
  end tell
end tell
```

已验证成功输出：

```text
1, about:blank - Google Chrome for Testing, false, -1920, 30, 1920, 1050
```

如果已经确认只有一个 CFT 窗口，可以使用更短版本：

```applescript
tell application "Google Chrome for Testing" to activate
tell application "System Events"
  tell process "Google Chrome for Testing"
    set w to window 1
    set value of attribute "AXFullScreen" of w to false
    set position of w to {-1920, 30}
    set size of w to {1920, 1050}
  end tell
end tell
```

注意：

- AppleScript 里的 `position` 和 `size` 只用于窗口几何控制，不用于点击。
- app/process 名称必须是 `Google Chrome for Testing`。
- 多窗口时优先用窗口名匹配版本，不要默认操作系统 `Google Chrome`。
- 不要用 Computer Use，也不要用坐标点击。

## 进入响应式模式并验证 iPhone SE

已验证目标：优先用快捷键控制 DevTools 设备工具栏，但先检测页面是否已经处于移动响应式状态，避免盲按 `Command+Shift+M` 把已打开的模式关掉。

先用 metrics 判断当前页面状态，不截图：

```bash
playwright-cli --raw eval "JSON.stringify({url: location.href, title: document.title, innerWidth, innerHeight, outerWidth, outerHeight, dpr: devicePixelRatio, visualViewport: {width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale}, documentElementClientWidth: document.documentElement.clientWidth, bodyClientWidth: document.body && document.body.clientWidth, maxTouchPoints: navigator.maxTouchPoints, ua: navigator.userAgent, viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') || null})"
```

判断规则：

- 如果 `documentElementClientWidth`/`bodyClientWidth` 是移动设备宽度，`maxTouchPoints > 0`，且 UA 包含 `iPhone` 或移动端标记，说明页面已经按移动设备渲染；不要按 `Command+Shift+M`。
- 如果 metrics 明显是桌面状态，再激活 DevTools 窗口并按 `Command+Shift+M`。
- 不截图时，metrics 只能证明页面移动渲染状态，不能 100% 证明 DevTools UI 的设备工具栏按钮状态。

只在需要打开设备工具栏时发送快捷键：

```applescript
tell application "Google Chrome for Testing" to activate
tell application "System Events"
  tell process "Google Chrome for Testing"
    set targetWindow to missing value
    repeat with w in windows
      if name of w starts with "DevTools" then
        set targetWindow to w
        exit repeat
      end if
    end repeat
    if targetWindow is missing value then error "DevTools window not found"
    perform action "AXRaise" of targetWindow
    set value of attribute "AXFocused" of targetWindow to true
    delay 0.2
    keystroke "m" using {command down, shift down}
  end tell
end tell
```

iPhone SE 已验证证据：

```text
outerWidth: 375
outerHeight: 667
documentElement.clientWidth: 375
body.clientWidth: 375
dpr: 2
maxTouchPoints: 1
UA: iPhone
viewportMeta: width=device-width, initial-scale=1.0
```

人类切换到 iPhone SE 后，刷新页面可让 metrics 更稳定；已验证刷新后 `innerWidth` 也会对齐：

```bash
playwright-cli reload
playwright-cli --raw eval "JSON.stringify({innerWidth, innerHeight, outerWidth, outerHeight, dpr: devicePixelRatio, visualViewport: {width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale}, documentElementClientWidth: document.documentElement.clientWidth, bodyClientWidth: document.body && document.body.clientWidth, maxTouchPoints: navigator.maxTouchPoints, ua: navigator.userAgent})"
```

期望证据：

```text
innerWidth: 375
innerHeight: 667
outerWidth: 375
outerHeight: 667
documentElement.clientWidth: 375
body.clientWidth: 375
visualViewport: 375 x 667
scale: 1
dpr: 2
maxTouchPoints: 1
UA: iPhone
```

注意：

- `innerWidth` 和 `visualViewport.width` 可能受 DevTools 缩放层影响；判断 SE 时优先看 `outerWidth`、`outerHeight`、`documentElement.clientWidth`、`dpr`、touch 和 UA。
- 切换具体设备型号由人类在 DevTools 设备下拉框选择；不要把 CDP 切设备作为默认流程。

## 步骤记录格式

每一步都按这个格式记录：

```text
步骤：
命令：
观察：
验证：
风险：
```

## 已知坑

- 不要写死 `~/Library/Caches/ms-playwright/chromium-*` 里的浏览器路径；让 `playwright-cli --browser=chromium` 选择当前可用的 CFT。
- 为了启动时自动打开 DevTools，需要给 `playwright-cli open` 传真实 config 文件路径，并在 `browser.launchOptions.args` 中写入 `--auto-open-devtools-for-tabs`。
- 为了分离 DevTools 窗口，需要用 profile 偏好 `devtools.preferences.currentDockState` 写入 `"\"undocked\""` 后重启 CFT。
- 为了关闭 DevTools 语言提示横幅，需要用 profile 偏好 `devtools.preferences["disable-locale-info-bar"]` 写入字符串 `"true"` 后重启 CFT。
- 默认每次重启浏览器都新建临时 profile；如果需要复现旧状态，才复用旧 profile。
- 新临时 profile 不会保留上次手动选择的 iPhone SE，进入响应式模式后可能回到 Chrome 默认设备。
- 人类切换设备型号后刷新一次页面，再读取 metrics；不要只看切换前的瞬时 `innerWidth`。
- 不要裸启动外部 Chrome for Testing；这可能绕过 Playwright 的默认参数并触发 macOS 钥匙串弹窗。
- `Command+Option+I` 是 DevTools toggle，不能盲按，否则可能把已经打开的 DevTools 关掉。
- `Command+Shift+M` 是设备工具栏 toggle，只有用户明确允许时才按。
- 使用 `Command+Shift+M` 前先查页面 metrics；如果已经是移动响应式状态，不要再按。
- DevTools UI 显示状态和 CDP emulation 状态可能不同；必要时同时查页面 metrics 和截图。

## 后续待验证流程

以下步骤还不是稳定流程：

1. 自动切换到 iPhone XR。
2. 用 CDP 控制 DevTools UI 的设备下拉框。
3. 截图给用户确认视觉状态。
