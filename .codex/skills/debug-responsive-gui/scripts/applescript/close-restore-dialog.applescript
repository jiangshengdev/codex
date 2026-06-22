on pressClose(e)
  tell application "System Events"
    try
      if role of e is "AXButton" and (description of e is "关闭" or description of e is "close") then
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
  if exists process "Google Chrome for Testing" then
    tell process "Google Chrome for Testing"
      repeat with w in windows
        if name of w is "要恢复页面吗？" then
          return my pressClose(w)
        end if
      end repeat
    end tell
  end if
end tell
return false
