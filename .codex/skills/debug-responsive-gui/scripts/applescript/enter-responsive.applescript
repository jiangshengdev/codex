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
