use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

pub(crate) const CURRENT_TASK_PATH_SEGMENT: &str = "task";
pub(crate) const HISTORY_PATH_SEGMENT: &str = "history";
pub(crate) const TOKEN_FRAGMENT_KEY: &str = "token";
pub(crate) const WEBSOCKET_PATH: &str = "/ws";
pub(crate) const AUTHENTICATE_METHOD: &str = "gui/authenticate";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub(crate) struct GuiAuthenticateParams {
    pub(crate) token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub(crate) struct GuiAuthenticateResult {
    pub(crate) authenticated: bool,
}
