use super::ItemCompletedNotification;
use super::ItemStartedNotification;
use super::Thread;
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

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "v2/")]
pub struct ThreadProjectionClosedNotification {
    pub thread_id: String,
    pub subscription_id: String,
    pub reason: ThreadProjectionClosedReason,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionClosedReason {
    Backpressure,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, JsonSchema, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(tag = "type", rename_all = "camelCase", export_to = "v2/")]
pub enum ThreadProjectionEvent {
    TurnStarted {
        notification: TurnStartedNotification,
    },
    TurnCompleted {
        notification: TurnCompletedNotification,
    },
    ItemStarted {
        notification: ItemStartedNotification,
    },
    ItemCompleted {
        notification: ItemCompletedNotification,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ClientRequest;
    use crate::ClientRequestSerializationScope;
    use crate::ClientResponse;
    use crate::RequestId;
    use crate::ServerNotification;
    use anyhow::Result;
    use pretty_assertions::assert_eq;
    use serde_json::json;

    #[test]
    fn deserialize_thread_projection_attach_request() -> Result<()> {
        let request: ClientRequest = serde_json::from_value(json!({
            "method": "thread/projection/attach",
            "id": 42,
            "params": {
                "threadId": "thr_123"
            }
        }))?;

        assert_eq!(
            request,
            ClientRequest::ThreadProjectionAttach {
                request_id: RequestId::Integer(42),
                params: ThreadProjectionAttachParams {
                    thread_id: "thr_123".to_string(),
                },
            }
        );
        assert_eq!(request.method(), "thread/projection/attach");
        assert_eq!(
            request.serialization_scope(),
            Some(ClientRequestSerializationScope::Thread {
                thread_id: "thr_123".to_string()
            })
        );
        Ok(())
    }

    #[test]
    fn deserialize_thread_projection_detach_response_status() -> Result<()> {
        let response: ClientResponse = serde_json::from_value(json!({
            "method": "thread/projection/detach",
            "id": 42,
            "response": {
                "status": "notSubscribed"
            }
        }))?;

        assert_eq!(response.method(), "thread/projection/detach");
        match response {
            ClientResponse::ThreadProjectionDetach { response, .. } => {
                assert_eq!(
                    response,
                    ThreadProjectionDetachResponse {
                        status: ThreadProjectionDetachStatus::NotSubscribed,
                    }
                );
            }
            _ => panic!("expected thread projection detach response"),
        }
        Ok(())
    }

    #[test]
    fn deserialize_thread_projection_event_notification() -> Result<()> {
        let notification: ServerNotification = serde_json::from_value(json!({
            "method": "thread/projection/event",
            "params": {
                "threadId": "thr_123",
                "subscriptionId": "sub_123",
                "commitId": "commit_2",
                "parentCommitId": "commit_1",
                "event": {
                    "type": "turnStarted",
                    "notification": {
                        "threadId": "thr_123",
                        "turn": {
                            "id": "turn_123",
                            "items": [],
                            "status": "inProgress",
                            "error": null,
                            "startedAt": null,
                            "completedAt": null,
                            "durationMs": null
                        }
                    }
                }
            }
        }))?;

        assert_eq!(
            serde_json::to_value(&notification)?,
            json!({
                "method": "thread/projection/event",
                "params": {
                    "threadId": "thr_123",
                    "subscriptionId": "sub_123",
                    "commitId": "commit_2",
                    "parentCommitId": "commit_1",
                    "event": {
                        "type": "turnStarted",
                        "notification": {
                            "threadId": "thr_123",
                            "turn": {
                                "id": "turn_123",
                                "items": [],
                                "itemsView": "full",
                                "status": "inProgress",
                                "error": null,
                                "startedAt": null,
                                "completedAt": null,
                                "durationMs": null
                            }
                        }
                    }
                }
            })
        );
        Ok(())
    }

    #[test]
    fn deserialize_thread_projection_closed_notification() -> Result<()> {
        let notification: ServerNotification = serde_json::from_value(json!({
            "method": "thread/projection/closed",
            "params": {
                "threadId": "thr_123",
                "subscriptionId": "sub_123",
                "reason": "backpressure"
            }
        }))?;

        assert_eq!(
            serde_json::to_value(&notification)?,
            json!({
                "method": "thread/projection/closed",
                "params": {
                    "threadId": "thr_123",
                    "subscriptionId": "sub_123",
                    "reason": "backpressure"
                }
            })
        );
        Ok(())
    }
}
