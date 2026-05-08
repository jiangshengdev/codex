use super::ItemCompletedNotification;
use super::ItemStartedNotification;
use super::Thread;
use super::ThreadItem;
use super::Turn;
use super::TurnCompletedNotification;
use super::TurnStartedNotification;
use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionAttachParams {
    pub thread_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionAttachResponse {
    pub subscription_id: String,
    pub snapshot: ThreadProjectionSnapshot,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionSnapshot {
    pub thread: Thread,
    pub head_commit_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionDetachParams {
    pub thread_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionDetachStatus {
    Detached,
    NotSubscribed,
    NotLoaded,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionDetachResponse {
    pub status: ThreadProjectionDetachStatus,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionEventNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub commit_id: String,
    pub parent_commit_id: Option<String>,
    pub event: ThreadProjectionEvent,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionEvent {
    TurnStarted {
        #[schemars(with = "ThreadProjectionTurnNotificationSchema")]
        notification: TurnStartedNotification,
    },
    TurnCompleted {
        #[schemars(with = "ThreadProjectionTurnNotificationSchema")]
        notification: TurnCompletedNotification,
    },
    ItemStarted {
        #[schemars(with = "ThreadProjectionItemStartedNotificationSchema")]
        notification: ItemStartedNotification,
    },
    ItemCompleted {
        #[schemars(with = "ThreadProjectionItemCompletedNotificationSchema")]
        notification: ItemCompletedNotification,
    },
}

#[derive(JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename = "ThreadProjectionTurnNotification")]
#[allow(dead_code)]
struct ThreadProjectionTurnNotificationSchema {
    thread_id: String,
    turn: Turn,
}

#[derive(JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename = "ThreadProjectionItemStartedNotification")]
#[allow(dead_code)]
struct ThreadProjectionItemStartedNotificationSchema {
    item: ThreadItem,
    thread_id: String,
    turn_id: String,
    started_at_ms: i64,
}

#[derive(JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename = "ThreadProjectionItemCompletedNotification")]
#[allow(dead_code)]
struct ThreadProjectionItemCompletedNotificationSchema {
    item: ThreadItem,
    thread_id: String,
    turn_id: String,
    completed_at_ms: i64,
}
