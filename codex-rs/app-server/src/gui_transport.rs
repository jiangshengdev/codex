use std::io;
use std::sync::Arc;

use codex_app_server_protocol::JSONRPCMessage;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use tracing::warn;

use crate::gui_connection_bridge::LocalGuiConnectionOpener;

#[derive(Clone)]
pub(crate) struct GuiTransportBackend {
    opener: Arc<dyn LocalGuiConnectionOpener>,
}

impl GuiTransportBackend {
    pub(crate) fn new(opener: Arc<dyn LocalGuiConnectionOpener>) -> Self {
        Self { opener }
    }
}

impl GuiBackend for GuiTransportBackend {
    async fn connect(&self, connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        connect_authenticated_gui(Arc::clone(&self.opener), connection).await?;
        Ok(())
    }
}

async fn connect_authenticated_gui(
    opener: Arc<dyn LocalGuiConnectionOpener>,
    mut connection: AuthenticatedGuiConnection,
) -> io::Result<()> {
    let handle = opener.open_gui_connection(connection.outbound_tx.clone())?;
    let disconnect_token = handle.disconnect_token();

    loop {
        tokio::select! {
            inbound = connection.inbound_rx.recv() => {
                let Some(text) = inbound else {
                    break;
                };
                match serde_json::from_str::<JSONRPCMessage>(&text) {
                    Ok(JSONRPCMessage::Request(request)) => {
                        handle.request(request)?;
                    }
                    Ok(JSONRPCMessage::Notification(notification)) => {
                        handle.notification(notification)?;
                    }
                    Ok(JSONRPCMessage::Response(_)) | Ok(JSONRPCMessage::Error(_)) => {}
                    Err(error) => {
                        warn!(%error, "dropping invalid GUI JSON-RPC text");
                    }
                }
            }
            _ = disconnect_token.cancelled() => {
                break;
            }
        }
    }

    drop(handle);
    Ok(())
}

#[cfg(test)]
mod tests {
    use codex_app_server_protocol::JSONRPC_VERSION;
    use codex_gui_host::AuthenticatedGuiConnection;
    use pretty_assertions::assert_eq;
    use std::sync::Arc;
    use tokio::time::Duration;

    use super::*;
    use crate::gui_connection_bridge::ExtraConnectionLocalGuiOpener;

    #[tokio::test]
    async fn authenticated_gui_initialize_round_trips_with_jsonrpc_version() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let backend = GuiTransportBackend::new(Arc::new(ExtraConnectionLocalGuiOpener::new(
            client.sender().extra_connection_sender(),
        )));
        let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
        let task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": JSONRPC_VERSION,
                    "id": 11,
                    "method": "initialize",
                    "params": {
                        "clientInfo": {
                            "name": "gui-bridge-test",
                            "version": "0.0.0"
                        }
                    }
                })
                .to_string(),
            )
            .await
            .expect("GUI inbound send should succeed");

        let response = tokio::time::timeout(Duration::from_secs(2), outbound_rx.recv())
            .await
            .expect("response should arrive")
            .expect("response channel should stay open");
        let value: serde_json::Value =
            serde_json::from_str(&response).expect("response should be JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 11);
        assert!(value.get("result").is_some());

        drop(inbound_tx);
        task.await
            .expect("backend task should join")
            .expect("backend should finish cleanly");
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }

    #[tokio::test]
    async fn authenticated_gui_ignores_browser_response_messages() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let backend = GuiTransportBackend::new(Arc::new(ExtraConnectionLocalGuiOpener::new(
            client.sender().extra_connection_sender(),
        )));
        let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
        let task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": JSONRPC_VERSION,
                    "id": 12,
                    "result": {}
                })
                .to_string(),
            )
            .await
            .expect("GUI inbound send should succeed");
        assert!(
            tokio::time::timeout(Duration::from_millis(100), outbound_rx.recv())
                .await
                .is_err()
        );

        drop(inbound_tx);
        task.await
            .expect("backend task should join")
            .expect("backend should finish cleanly");
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }
}
