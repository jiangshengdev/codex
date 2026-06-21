on parseInteger(valueText)
  return valueText as integer
end parseInteger

on run argv
  set browserX to my parseInteger(item 1 of argv)
  set browserY to my parseInteger(item 2 of argv)
  set browserW to my parseInteger(item 3 of argv)
  set browserH to my parseInteger(item 4 of argv)
  set devtoolsX to my parseInteger(item 5 of argv)
  set devtoolsY to my parseInteger(item 6 of argv)
  set devtoolsW to my parseInteger(item 7 of argv)
  set devtoolsH to my parseInteger(item 8 of argv)

  tell application "Google Chrome for Testing" to activate
  tell application "System Events"
    tell process "Google Chrome for Testing"
      repeat with w in windows
        set windowName to name of w
        set value of attribute "AXFullScreen" of w to false
        if windowName starts with "DevTools" then
          set position of w to {devtoolsX, devtoolsY}
          set size of w to {devtoolsW, devtoolsH}
        else if windowName contains "Google Chrome for Testing" then
          set position of w to {browserX, browserY}
          set size of w to {browserW, browserH}
        end if
      end repeat
      delay 0.2
      repeat with w in windows
        set windowName to name of w
        if windowName starts with "DevTools" then
          perform action "AXRaise" of w
          set value of attribute "AXFocused" of w to true
          delay 0.1
          set value of attribute "AXFullScreen" of w to false
          set position of w to {devtoolsX, devtoolsY}
          delay 0.1
          set size of w to {devtoolsW, devtoolsH}
        end if
      end repeat
    end tell
  end tell
end run
