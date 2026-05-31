//! GUI backend bridge for the in-process app-server runtime.

use crate::in_process::ExtraConnectionCommandSender;
use crate::in_process::InProcessClientSender;
use codex_app_server_protocol::JSONRPC_VERSION;
use codex_app_server_protocol::JSONRPCMessage;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use codex_gui_host::is_allowed_client_notification_method;
use codex_gui_host::is_allowed_client_request_method;
use codex_gui_host::is_allowed_server_notification_method;
use serde_json::Map;
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

const OUTBOUND_DRAIN_BUDGET: std::time::Duration = std::time::Duration::from_secs(1);

#[derive(Clone)]
pub(crate) struct GuiTransportBackend {
    sender: InProcessClientSender,
    manager_cancel: CancellationToken,
}

impl GuiTransportBackend {
    pub(crate) fn new(sender: InProcessClientSender, manager_cancel: CancellationToken) -> Self {
        Self {
            sender,
            manager_cancel,
        }
    }
}

#[derive(Debug, PartialEq)]
enum InboundClassification {
    ForwardRequest(JSONRPCRequest),
    ForwardNotification(JSONRPCNotification),
    Drop,
    RejectPolicy,
}

fn classify_inbound(message: JSONRPCMessage) -> InboundClassification {
    match message {
        JSONRPCMessage::Request(request) => {
            if is_allowed_client_request_method(request.method.as_str()) {
                InboundClassification::ForwardRequest(request)
            } else {
                InboundClassification::RejectPolicy
            }
        }
        JSONRPCMessage::Notification(notification) => {
            if is_allowed_client_notification_method(notification.method.as_str()) {
                InboundClassification::ForwardNotification(notification)
            } else {
                InboundClassification::Drop
            }
        }
        JSONRPCMessage::Response(_) | JSONRPCMessage::Error(_) => InboundClassification::Drop,
    }
}

fn normalize_outbound_text(text: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(text).ok()?;
    let Value::Object(mut object) = value else {
        return None;
    };

    match object.get("jsonrpc").and_then(Value::as_str) {
        Some(JSONRPC_VERSION) => {}
        Some(_) => return None,
        None => {
            object.insert(
                "jsonrpc".to_string(),
                Value::String(JSONRPC_VERSION.to_string()),
            );
        }
    }

    if outbound_object_is_allowed(&object) {
        Some(Value::Object(object).to_string())
    } else {
        None
    }
}

fn outbound_object_is_allowed(object: &Map<String, Value>) -> bool {
    let has_result = object.contains_key("result");
    let has_error = object.contains_key("error");
    if has_result && has_error {
        return false;
    }

    if has_result || has_error {
        return object.contains_key("id") && !object.contains_key("method");
    }

    let Some(method) = object.get("method").and_then(Value::as_str) else {
        return false;
    };
    !object.contains_key("id") && is_allowed_server_notification_method(method)
}

impl GuiBackend for GuiTransportBackend {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send {
        let sender = self.sender.clone();
        let manager_cancel = self.manager_cancel.clone();

        async move {
            let AuthenticatedGuiConnection {
                mut inbound_rx,
                outbound_tx,
            } = connection;

            let mut handle = tokio::select! {
                _ = manager_cancel.cancelled() => return Ok(()),
                result = sender.register_extra_connection() => result.map_err(|err| {
                    anyhow::anyhow!("register GUI extra connection failed: {err}")
                })?,
            };

            let command_sender = handle.command_sender.clone();
            let outgoing_tx_for_parse_error = handle.outgoing_tx.clone();
            let disconnect_token = handle.disconnect_token.clone();
            let (_noop_tx, noop_rx) = mpsc::channel::<String>(1);
            let outgoing_rx = std::mem::replace(&mut handle.outgoing_rx, noop_rx);

            let mut inbound_task = tokio::spawn({
                let disconnect_token = disconnect_token.clone();
                let manager_cancel = manager_cancel.clone();
                async move {
                    pump_inbound(
                        &mut inbound_rx,
                        &command_sender,
                        &outgoing_tx_for_parse_error,
                        disconnect_token,
                        manager_cancel,
                    )
                    .await
                }
            });

            let mut outbound_task = tokio::spawn(pump_outbound(
                outgoing_rx,
                outbound_tx,
                disconnect_token.clone(),
                manager_cancel,
            ));

            let (inbound_result, outbound_result) = match tokio::select! {
                inbound = &mut inbound_task => PumpWinner::Inbound(inbound),
                outbound = &mut outbound_task => PumpWinner::Outbound(outbound),
            } {
                PumpWinner::Inbound(inbound) => {
                    disconnect_token.cancel();
                    let outbound =
                        match tokio::time::timeout(OUTBOUND_DRAIN_BUDGET, &mut outbound_task).await
                        {
                            Ok(joined) => joined,
                            Err(_) => {
                                outbound_task.abort();
                                (&mut outbound_task).await
                            }
                        };
                    (inbound, outbound)
                }
                PumpWinner::Outbound(outbound) => {
                    disconnect_token.cancel();
                    let inbound = (&mut inbound_task).await;
                    (inbound, outbound)
                }
            };

            drop(handle);

            match inbound_result {
                Ok(Ok(())) => {}
                Ok(Err(err)) => return Err(err),
                Err(err) => return Err(anyhow::anyhow!("GUI inbound pump join error: {err}")),
            }
            if let Err(err) = outbound_result
                && !err.is_cancelled()
            {
                tracing::warn!("GUI outbound pump join error: {err}");
            }
            Ok(())
        }
    }
}

enum PumpWinner<I, O> {
    Inbound(I),
    Outbound(O),
}

async fn pump_inbound(
    inbound_rx: &mut mpsc::Receiver<String>,
    command_sender: &ExtraConnectionCommandSender,
    parse_error_tx: &mpsc::Sender<String>,
    disconnect_token: CancellationToken,
    manager_cancel: CancellationToken,
) -> anyhow::Result<()> {
    loop {
        tokio::select! {
            _ = disconnect_token.cancelled() => break,
            _ = manager_cancel.cancelled() => break,
            message = inbound_rx.recv() => {
                let Some(text) = message else {
                    break;
                };
                let message = match serde_json::from_str::<JSONRPCMessage>(&text) {
                    Ok(message) => message,
                    Err(err) => {
                        // Intentional: a single malformed frame terminates the
                        // bridge. We write the standard parse-error envelope
                        // back once so the browser sees exactly one response,
                        // then break — any continuation would amplify a
                        // broken or malicious producer that keeps sending
                        // garbage. A healthy browser should reconnect rather
                        // than recover mid-stream.
                        let payload = build_jsonrpc_parse_error(&err);
                        tokio::select! {
                            _ = disconnect_token.cancelled() => break,
                            _ = manager_cancel.cancelled() => break,
                            result = parse_error_tx.send(payload) => {
                                if result.is_err() {
                                    break;
                                }
                                break;
                            }
                        }
                    }
                };

                // Intentional: any enqueue failure terminates the bridge. We
                // do not distinguish `WouldBlock` (processor queue saturated)
                // from `BrokenPipe` (runtime closed) — both mean this
                // connection cannot make forward progress right now, and the
                // browser is better off observing a clean disconnect and
                // reconnecting than seeing silently dropped requests.
                match classify_inbound(message) {
                    InboundClassification::ForwardRequest(request) => {
                        command_sender.send_request(request)?;
                    }
                    InboundClassification::ForwardNotification(notification) => {
                        command_sender.send_notification(notification)?;
                    }
                    InboundClassification::Drop | InboundClassification::RejectPolicy => {}
                }
            }
        }
    }
    Ok(())
}

fn build_jsonrpc_parse_error(err: &serde_json::Error) -> String {
    serde_json::json!({
        "jsonrpc": JSONRPC_VERSION,
        "id": null,
        "error": {
            "code": -32700,
            "message": format!("Parse error: {err}"),
        },
    })
    .to_string()
}

async fn pump_outbound(
    mut outgoing_rx: mpsc::Receiver<String>,
    outbound_tx: mpsc::Sender<String>,
    disconnect_token: CancellationToken,
    manager_cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = disconnect_token.cancelled() => break,
            _ = manager_cancel.cancelled() => break,
            text = outgoing_rx.recv() => {
                let Some(text) = text else {
                    break;
                };
                let Some(text) = normalize_outbound_text(&text) else {
                    continue;
                };
                tokio::select! {
                    _ = disconnect_token.cancelled() => break,
                    _ = manager_cancel.cancelled() => break,
                    result = outbound_tx.send(text) => {
                        if result.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::Arc;
    use std::time::Duration;

    use codex_app_server_protocol::ClientInfo;
    use codex_app_server_protocol::InitializeParams;
    use codex_app_server_protocol::JSONRPCError;
    use codex_app_server_protocol::JSONRPCErrorError;
    use codex_app_server_protocol::JSONRPCMessage;
    use codex_app_server_protocol::JSONRPCNotification;
    use codex_app_server_protocol::JSONRPCRequest;
    use codex_app_server_protocol::JSONRPCResponse;
    use codex_app_server_protocol::RequestId;
    use codex_arg0::Arg0DispatchPaths;
    use codex_config::CloudRequirementsLoader;
    use codex_config::LoaderOverrides;
    use codex_core::config::Config;
    use codex_core::config::ConfigBuilder;
    use codex_exec_server::EnvironmentManager;
    use codex_feedback::CodexFeedback;
    use codex_gui_host::AuthenticatedGuiConnection;
    use codex_gui_host::GuiBackend;
    use codex_protocol::protocol::SessionSource;
    use pretty_assertions::assert_eq;
    use tempfile::TempDir;
    use tokio_util::sync::CancellationToken;

    use super::*;
    use crate::in_process;
    use crate::in_process::DEFAULT_IN_PROCESS_CHANNEL_CAPACITY;
    use crate::in_process::InProcessClientHandle;
    use crate::in_process::InProcessStartArgs;

    #[test]
    fn allowlisted_request_passes_filter() {
        let request = JSONRPCRequest {
            id: RequestId::Integer(1),
            method: "initialize".to_string(),
            params: None,
            trace: None,
        };

        assert_eq!(
            classify_inbound(JSONRPCMessage::Request(request.clone())),
            InboundClassification::ForwardRequest(request)
        );
    }

    #[test]
    fn non_allowlisted_request_is_rejected() {
        let request = JSONRPCRequest {
            id: RequestId::Integer(1),
            method: "thread/start".to_string(),
            params: None,
            trace: None,
        };

        assert_eq!(
            classify_inbound(JSONRPCMessage::Request(request)),
            InboundClassification::RejectPolicy
        );
    }

    #[test]
    fn response_and_error_variants_are_dropped() {
        let response = JSONRPCResponse {
            id: RequestId::Integer(1),
            result: serde_json::json!({}),
        };
        assert_eq!(
            classify_inbound(JSONRPCMessage::Response(response)),
            InboundClassification::Drop
        );

        let error = JSONRPCError {
            id: RequestId::Integer(2),
            error: JSONRPCErrorError {
                code: -32000,
                message: "x".to_string(),
                data: None,
            },
        };
        assert_eq!(
            classify_inbound(JSONRPCMessage::Error(error)),
            InboundClassification::Drop
        );
    }

    #[test]
    fn notification_outside_allowlist_is_dropped() {
        let notification = JSONRPCNotification {
            method: "turn/completed".to_string(),
            params: None,
        };

        assert_eq!(
            classify_inbound(JSONRPCMessage::Notification(notification)),
            InboundClassification::Drop
        );
    }

    #[test]
    fn outbound_notification_outside_allowlist_is_filtered() {
        let outbound = serde_json::json!({
            "method": "some/internal",
            "params": {}
        })
        .to_string();

        assert_eq!(normalize_outbound_text(&outbound), None);
    }

    #[test]
    fn outbound_app_server_response_is_normalized_for_browser() {
        let outbound = serde_json::json!({
            "id": 7,
            "result": {}
        })
        .to_string();

        let normalized = normalize_outbound_text(&outbound).expect("response should pass");
        let parsed: serde_json::Value =
            serde_json::from_str(&normalized).expect("normalized JSON should parse");
        assert_eq!(parsed["jsonrpc"], serde_json::json!("2.0"));
        assert_eq!(parsed["id"], serde_json::json!(7));
        assert_eq!(parsed["result"], serde_json::json!({}));
    }

    #[test]
    fn outbound_allowlisted_notification_is_normalized_for_browser() {
        let outbound = serde_json::json!({
            "method": "thread/projection/event",
            "params": {}
        })
        .to_string();

        let normalized = normalize_outbound_text(&outbound).expect("notification should pass");
        let parsed: serde_json::Value =
            serde_json::from_str(&normalized).expect("normalized JSON should parse");
        assert_eq!(parsed["jsonrpc"], serde_json::json!("2.0"));
        assert_eq!(
            parsed["method"],
            serde_json::json!("thread/projection/event")
        );
    }

    #[tokio::test]
    async fn backend_round_trips_initialize() {
        let TestRuntime {
            client,
            _codex_home,
        } = start_test_runtime(SessionSource::Cli).await;
        let backend = GuiTransportBackend::new(client.sender(), CancellationToken::new());
        let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
        let backend_task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 7,
                    "method": "initialize",
                    "params": {
                        "clientInfo": {
                            "name": "gui-transport-test",
                            "title": null,
                            "version": "0.0.0"
                        },
                        "capabilities": null
                    }
                })
                .to_string(),
            )
            .await
            .expect("send initialize");

        let outbound = tokio::time::timeout(Duration::from_secs(2), outbound_rx.recv())
            .await
            .expect("outbound response should arrive")
            .expect("outbound channel should stay open");
        let parsed: serde_json::Value =
            serde_json::from_str(&outbound).expect("outbound should be JSON");
        assert_eq!(parsed["jsonrpc"], serde_json::json!("2.0"));
        assert_eq!(parsed["id"], serde_json::json!(7));
        assert!(
            parsed.get("result").is_some() || parsed.get("error").is_some(),
            "initialize response must be a response or error: {parsed}"
        );

        drop(inbound_tx);
        backend_task
            .await
            .expect("backend task should join")
            .expect("backend should exit cleanly");
        client.shutdown().await.expect("runtime shutdown");
    }

    #[tokio::test]
    async fn backend_exits_after_parse_error_for_invalid_inbound_frame() {
        let TestRuntime {
            client,
            _codex_home,
        } = start_test_runtime(SessionSource::Cli).await;
        let backend = GuiTransportBackend::new(client.sender(), CancellationToken::new());
        let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
        let backend_task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send("{not-json".to_string())
            .await
            .expect("send invalid JSON");

        let outbound = tokio::time::timeout(Duration::from_secs(2), outbound_rx.recv())
            .await
            .expect("parse error should arrive")
            .expect("outbound channel should stay open");
        let parsed: serde_json::Value =
            serde_json::from_str(&outbound).expect("parse error should be JSON");
        assert_eq!(parsed["jsonrpc"], serde_json::json!("2.0"));
        assert_eq!(parsed["id"], serde_json::Value::Null);
        assert_eq!(parsed["error"]["code"], serde_json::json!(-32700));

        tokio::time::timeout(Duration::from_secs(2), backend_task)
            .await
            .expect("backend task should exit after parse error")
            .expect("backend task should join")
            .expect("backend should exit cleanly");
        assert!(
            inbound_tx
                .send(
                    serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": 8,
                        "method": "initialize",
                        "params": {}
                    })
                    .to_string()
                )
                .await
                .is_err(),
            "backend should drop the inbound receiver after parse error",
        );
        assert_eq!(outbound_rx.recv().await, None);
        client.shutdown().await.expect("runtime shutdown");
    }

    struct TestRuntime {
        client: InProcessClientHandle,
        _codex_home: TempDir,
    }

    async fn build_test_config(codex_home: &Path) -> Config {
        match ConfigBuilder::default()
            .codex_home(codex_home.to_path_buf())
            .build()
            .await
        {
            Ok(config) => config,
            Err(_) => Config::load_default_with_cli_overrides_for_codex_home(
                codex_home.to_path_buf(),
                Vec::new(),
            )
            .await
            .expect("default config should load"),
        }
    }

    async fn start_test_runtime(session_source: SessionSource) -> TestRuntime {
        let codex_home = TempDir::new().expect("temp dir");
        let config = Arc::new(build_test_config(codex_home.path()).await);
        let state_db = codex_rollout::state_db::try_init(config.as_ref())
            .await
            .expect("state db should initialize for GUI transport test");
        let args = InProcessStartArgs {
            arg0_paths: Arg0DispatchPaths::default(),
            config,
            cli_overrides: Vec::new(),
            loader_overrides: LoaderOverrides::default(),
            strict_config: false,
            cloud_requirements: CloudRequirementsLoader::default(),
            thread_config_loader: Arc::new(codex_config::NoopThreadConfigLoader),
            feedback: CodexFeedback::new(),
            log_db: None,
            state_db: Some(state_db),
            environment_manager: Arc::new(EnvironmentManager::default_for_tests()),
            config_warnings: Vec::new(),
            session_source,
            enable_codex_api_key_env: false,
            initialize: InitializeParams {
                client_info: ClientInfo {
                    name: "gui-transport-test".to_string(),
                    title: None,
                    version: "0.0.0".to_string(),
                },
                capabilities: None,
            },
            channel_capacity: DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
        };
        let client = in_process::start(args)
            .await
            .expect("in-process runtime should start");
        TestRuntime {
            client,
            _codex_home: codex_home,
        }
    }
}
