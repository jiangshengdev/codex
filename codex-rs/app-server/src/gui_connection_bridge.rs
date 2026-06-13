use std::io;
use std::sync::Arc;

use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::outgoing_message::ConnectionId;

type LocalGuiRequestSender = dyn Fn(ConnectionId, JSONRPCRequest) -> io::Result<()> + Send + Sync;
type LocalGuiNotificationSender =
    dyn Fn(ConnectionId, JSONRPCNotification) -> io::Result<()> + Send + Sync;

pub(crate) trait LocalGuiConnectionOpener: Send + Sync {
    fn open_gui_connection(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<LocalGuiConnectionHandle>;
}

pub(crate) struct LocalGuiConnectionHandle {
    connection_id: ConnectionId,
    disconnect_token: CancellationToken,
    request: Arc<LocalGuiRequestSender>,
    notification: Arc<LocalGuiNotificationSender>,
    close: Arc<dyn Fn(ConnectionId) + Send + Sync>,
}

impl LocalGuiConnectionHandle {
    pub(crate) fn connection_id(&self) -> ConnectionId {
        self.connection_id
    }

    pub(crate) fn disconnect_token(&self) -> CancellationToken {
        self.disconnect_token.clone()
    }

    pub(crate) fn request(&self, request: JSONRPCRequest) -> io::Result<()> {
        (self.request)(self.connection_id(), request)
    }

    pub(crate) fn notification(&self, notification: JSONRPCNotification) -> io::Result<()> {
        (self.notification)(self.connection_id(), notification)
    }
}

impl Drop for LocalGuiConnectionHandle {
    fn drop(&mut self) {
        (self.close)(self.connection_id);
        self.disconnect_token.cancel();
    }
}

#[derive(Clone)]
pub(crate) struct ExtraConnectionLocalGuiOpener {
    sender: crate::in_process_extra::ExtraConnectionCommandSender,
}

impl ExtraConnectionLocalGuiOpener {
    pub(crate) fn new(sender: crate::in_process_extra::ExtraConnectionCommandSender) -> Self {
        Self { sender }
    }
}

impl LocalGuiConnectionOpener for ExtraConnectionLocalGuiOpener {
    fn open_gui_connection(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<LocalGuiConnectionHandle> {
        let handle = self.sender.open(outgoing_tx)?;
        let (connection_id, command_sender, disconnect_token) = handle.into_parts();
        Ok(LocalGuiConnectionHandle {
            connection_id,
            disconnect_token,
            request: Arc::new({
                let command_sender = command_sender.clone();
                move |connection_id, request| command_sender.request(connection_id, request)
            }),
            notification: Arc::new({
                let command_sender = command_sender.clone();
                move |connection_id, notification| {
                    command_sender.notification(connection_id, notification)
                }
            }),
            close: Arc::new({
                let command_sender = command_sender.clone();
                move |connection_id| command_sender.close_best_effort(connection_id)
            }),
        })
    }
}

#[cfg(test)]
pub(crate) type GuiConnectionBridgeBackend = crate::gui_transport::GuiTransportBackend;

#[cfg(test)]
pub(crate) mod test_support {
    use std::sync::Arc;

    use super::ExtraConnectionLocalGuiOpener;
    use super::LocalGuiConnectionOpener;
    use crate::in_process::InProcessClientHandle;

    pub(crate) struct TestLocalGuiBridge {
        client: InProcessClientHandle,
    }

    impl TestLocalGuiBridge {
        pub(crate) fn opener(&self) -> Arc<dyn LocalGuiConnectionOpener> {
            Arc::new(ExtraConnectionLocalGuiOpener::new(
                self.client.sender().extra_connection_sender(),
            ))
        }

        pub(crate) async fn shutdown(self) {
            self.client
                .shutdown()
                .await
                .expect("in-process runtime should shutdown cleanly");
        }
    }

    pub(crate) async fn start_local_bridge_for_test() -> TestLocalGuiBridge {
        TestLocalGuiBridge {
            client: crate::in_process::tests::start_test_client_for_bridge().await,
        }
    }
}

#[cfg(test)]
mod tests {
    use codex_app_server_protocol::JSONRPC_VERSION;
    use codex_gui_host::AuthenticatedGuiConnection;
    use codex_gui_host::GuiBackend;
    use pretty_assertions::assert_eq;
    use tokio::sync::mpsc;
    use tokio::time::Duration;

    use super::*;
    use crate::in_process::InProcessClientMessage;
    use crate::in_process_extra::ExtraConnectionCommand;
    use crate::in_process_extra::ExtraConnectionCommandSender;

    #[tokio::test]
    async fn local_gui_connection_round_trips_initialize() {
        let bridge = test_support::start_local_bridge_for_test().await;
        let backend = GuiConnectionBridgeBackend::new(bridge.opener());
        let (connection, inbound_tx, mut outbound_rx) = AuthenticatedGuiConnection::new();
        let task = tokio::spawn(async move { backend.connect(connection).await });

        inbound_tx
            .send(
                serde_json::json!({
                    "jsonrpc": JSONRPC_VERSION,
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "clientInfo": { "name": "gui-bridge-test", "version": "0.0.0" }
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
        let value: serde_json::Value = serde_json::from_str(&response).expect("valid JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 1);
        assert!(value.get("result").is_some());

        drop(inbound_tx);
        task.await
            .expect("backend task should join")
            .expect("backend should finish cleanly");
        bridge.shutdown().await;
    }

    #[tokio::test]
    async fn dropping_local_gui_handle_closes_and_releases_extra_connection() {
        let (client_tx, mut client_rx) = mpsc::channel(4);
        let opener =
            ExtraConnectionLocalGuiOpener::new(ExtraConnectionCommandSender::new(client_tx));
        let (outgoing_tx, _outgoing_rx) = mpsc::channel(1);

        let handle = opener
            .open_gui_connection(outgoing_tx)
            .expect("local GUI connection should open");
        let connection_id = handle.connection_id();
        drop(handle);

        let opened = client_rx
            .recv()
            .await
            .expect("opened command should be sent");
        match opened {
            InProcessClientMessage::Extra(command) => match *command {
                ExtraConnectionCommand::Opened {
                    connection_id: opened_id,
                    ..
                } => assert_eq!(opened_id, connection_id),
                _ => panic!("expected opened command"),
            },
            _ => panic!("expected extra command"),
        }

        let closed = client_rx
            .recv()
            .await
            .expect("closed command should be sent when handle drops");
        match closed {
            InProcessClientMessage::Extra(command) => match *command {
                ExtraConnectionCommand::Closed {
                    connection_id: closed_id,
                } => assert_eq!(closed_id, connection_id),
                _ => panic!("expected closed command"),
            },
            _ => panic!("expected extra command"),
        }

        drop(opener);
        let channel_close = tokio::time::timeout(Duration::from_millis(100), client_rx.recv())
            .await
            .expect("command channel should close after all senders drop");
        assert!(channel_close.is_none());
    }
}
