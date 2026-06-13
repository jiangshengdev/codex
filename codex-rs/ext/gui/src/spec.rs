use std::collections::BTreeMap;

use codex_tools::JsonSchema;
use codex_tools::ResponsesApiTool;
use codex_tools::ToolSpec;

pub const LAUNCH_GUI_TOOL_NAME: &str = "launch_gui";

pub fn create_launch_gui_tool() -> ToolSpec {
    ToolSpec::Function(ResponsesApiTool {
        name: LAUNCH_GUI_TOOL_NAME.to_string(),
        description: "Launch and return URLs for the local GUI attached to this thread."
            .to_string(),
        strict: false,
        defer_loading: None,
        parameters: JsonSchema::object(
            BTreeMap::new(),
            /*required*/ Some(Vec::new()),
            Some(false.into()),
        ),
        output_schema: None,
    })
}
