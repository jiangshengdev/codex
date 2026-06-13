//! Responses API tool definition for launching the local GUI.

use codex_tools::JsonSchema;
use codex_tools::ResponsesApiTool;
use codex_tools::ToolSpec;
use std::collections::BTreeMap;

pub const LAUNCH_GUI_TOOL_NAME: &str = "launch_gui";

pub fn create_launch_gui_tool() -> ToolSpec {
    ToolSpec::Function(ResponsesApiTool {
        name: LAUNCH_GUI_TOOL_NAME.to_string(),
        description: "Launch or reuse the local GUI for the current thread and return GUI URLs. Use this tool only when the user explicitly requests opening the GUI, such as `open GUI`, `launch GUI`, or `use GUI for this thread`. Do not infer GUI launch from ordinary coding tasks."
            .to_string(),
        strict: false,
        defer_loading: None,
        parameters: JsonSchema::object(BTreeMap::new(), Some(Vec::new()), Some(false.into())),
        output_schema: None,
    })
}

#[cfg(test)]
mod tests {
    use codex_tools::JsonSchema;
    use codex_tools::ToolSpec;
    use pretty_assertions::assert_eq;
    use std::collections::BTreeMap;

    use super::LAUNCH_GUI_TOOL_NAME;
    use super::create_launch_gui_tool;

    #[test]
    fn launch_gui_tool_has_empty_parameters_and_explicit_trigger_text() {
        let ToolSpec::Function(tool) = create_launch_gui_tool() else {
            panic!("launch_gui should be a function tool");
        };

        assert_eq!(tool.name, LAUNCH_GUI_TOOL_NAME);
        assert!(
            tool.description
                .contains("only when the user explicitly requests")
        );
        assert!(tool.description.contains("Do not infer GUI launch"));
        assert_eq!(
            &tool.parameters,
            &JsonSchema::object(BTreeMap::new(), Some(Vec::new()), Some(false.into()))
        );
        assert!(
            !tool
                .parameters
                .properties
                .as_ref()
                .expect("launch_gui should use object params")
                .contains_key("thread_id")
        );
    }
}
