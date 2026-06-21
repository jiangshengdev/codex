use framework "Foundation"
use scripting additions

on jsonString(value)
  set dataValue to current application's NSJSONSerialization's dataWithJSONObject:value options:0 |error|:(missing value)
  return (current application's NSString's alloc()'s initWithData:dataValue encoding:(current application's NSUTF8StringEncoding)) as text
end jsonString

set output to current application's NSMutableArray's array()
tell application "System Events"
  if exists process "Google Chrome for Testing" then
    tell process "Google Chrome for Testing"
      repeat with w in windows
        set windowInfo to current application's NSMutableDictionary's dictionary()
        set windowPosition to position of w
        set windowSize to size of w
        windowInfo's setObject:(name of w) forKey:"name"
        windowInfo's setObject:(value of attribute "AXFullScreen" of w) forKey:"fullscreen"
        windowInfo's setObject:(current application's NSArray's arrayWithArray:windowPosition) forKey:"position"
        windowInfo's setObject:(current application's NSArray's arrayWithArray:windowSize) forKey:"size"
        output's addObject:windowInfo
      end repeat
    end tell
  end if
end tell

return my jsonString(output)
