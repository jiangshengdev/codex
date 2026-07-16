use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

pub(crate) const THREAD_QUERY_KEY: &str = "threadId";
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
