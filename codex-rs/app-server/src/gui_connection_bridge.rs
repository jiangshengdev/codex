use std::io;
use std::io::ErrorKind;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use codex_app_server_protocol::JSONRPCMessage;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::outgoing_message::ConnectionId;
use crate::outgoing_message::QueuedOutgoingMessage;
use crate::transport::ConnectionOrigin;
use crate::transport::TransportEvent;

static NEXT_GUI_CONNECTION_ID: AtomicU64 = AtomicU64::new(1 << 63);

type LocalGuiRequestSender = dyn Fn(ConnectionId, JSONRPCRequest) -> io::Result<()> + Send + Sync;
type LocalGuiNotificationSender =
    dyn Fn(ConnectionId, JSONRPCNotification) -> io::Result<()> + Send + Sync;

pub(crate) trait LocalGuiConnectionOpener: Send + Sync {
    fn open_gui_connection(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<LocalGuiConnectionHandle>;
}

#[derive(Clone)]
pub(crate) struct TransportLocalGuiOpener {
    transport_event_tx: mpsc::Sender<TransportEvent>,
    channel_capacity: usize,
}

impl TransportLocalGuiOpener {
    pub(crate) fn new(
        transport_event_tx: mpsc::Sender<TransportEvent>,
        channel_capacity: usize,
    ) -> Self {
        Self {
            transport_event_tx,
            channel_capacity,
        }
    }

    fn next_connection_id() -> ConnectionId {
        ConnectionId(NEXT_GUI_CONNECTION_ID.fetch_add(1, Ordering::Relaxed))
    }
}

impl LocalGuiConnectionOpener for TransportLocalGuiOpener {
    fn open_gui_connection(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<LocalGuiConnectionHandle> {
        let connection_id = Self::next_connection_id();
        let disconnect_token = CancellationToken::new();
        let (writer, writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(self.channel_capacity);
        spawn_local_gui_writer_bridge(connection_id, outgoing_tx, writer_rx);
        self.transport_event_tx
            .try_send(TransportEvent::ConnectionOpened {
                connection_id,
                origin: ConnectionOrigin::InProcess,
                writer,
                disconnect_sender: Some(disconnect_token.clone()),
            })
            .map_err(transport_event_send_error)?;

        Ok(LocalGuiConnectionHandle {
            connection_id,
            disconnect_token,
            request: Arc::new({
                let transport_event_tx = self.transport_event_tx.clone();
                move |connection_id, request| {
                    send_transport_event(
                        &transport_event_tx,
                        TransportEvent::IncomingMessage {
                            connection_id,
                            message: JSONRPCMessage::Request(request),
                        },
                    )
                }
            }),
            notification: Arc::new({
                let transport_event_tx = self.transport_event_tx.clone();
                move |connection_id, notification| {
                    send_transport_event(
                        &transport_event_tx,
                        TransportEvent::IncomingMessage {
                            connection_id,
                            message: JSONRPCMessage::Notification(notification),
                        },
                    )
                }
            }),
            close: Arc::new({
                let transport_event_tx = self.transport_event_tx.clone();
                move |connection_id| {
                    close_transport_connection_best_effort(&transport_event_tx, connection_id)
                }
            }),
        })
    }
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

fn send_transport_event(
    transport_event_tx: &mpsc::Sender<TransportEvent>,
    event: TransportEvent,
) -> io::Result<()> {
    transport_event_tx
        .try_send(event)
        .map_err(transport_event_send_error)
}

fn transport_event_send_error(err: mpsc::error::TrySendError<TransportEvent>) -> io::Error {
    match err {
        mpsc::error::TrySendError::Full(_) => {
            io::Error::new(ErrorKind::WouldBlock, "transport event queue is full")
        }
        mpsc::error::TrySendError::Closed(_) => {
            io::Error::new(ErrorKind::BrokenPipe, "app-server runtime is closed")
        }
    }
}

fn close_transport_connection_best_effort(
    transport_event_tx: &mpsc::Sender<TransportEvent>,
    connection_id: ConnectionId,
) {
    let event = TransportEvent::ConnectionClosed { connection_id };
    match transport_event_tx.try_send(event) {
        Ok(()) => {}
        Err(mpsc::error::TrySendError::Full(event)) => {
            let transport_event_tx = transport_event_tx.clone();
            let Ok(handle) = tokio::runtime::Handle::try_current() else {
                warn!(
                    "dropping GUI connection close because runtime is unavailable and queue is full"
                );
                return;
            };
            handle.spawn(async move {
                if transport_event_tx.send(event).await.is_err() {
                    warn!("dropping GUI connection close because runtime is closed");
                }
            });
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {}
    }
}

fn spawn_local_gui_writer_bridge(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    mut writer_rx: mpsc::Receiver<QueuedOutgoingMessage>,
) {
    tokio::spawn(async move {
        while let Some(queued) = writer_rx.recv().await {
            let Some(text) = serialize_outgoing_text(queued.message) else {
                continue;
            };
            if outgoing_tx.send(text).await.is_err() {
                break;
            }
            if let Some(write_complete_tx) = queued.write_complete_tx {
                let _ = write_complete_tx.send(());
            }
        }
        tracing::debug!(?connection_id, "GUI connection writer bridge stopped");
    });
}

fn serialize_outgoing_text(message: crate::outgoing_message::OutgoingMessage) -> Option<String> {
    let mut value = match serde_json::to_value(message) {
        Ok(value) => value,
        Err(error) => {
            warn!(%error, "failed to serialize GUI outgoing message");
            return None;
        }
    };
    if let Value::Object(object) = &mut value {
        object.insert(
            "jsonrpc".to_string(),
            Value::String(codex_app_server_protocol::JSONRPC_VERSION.to_string()),
        );
    }
    match serde_json::to_string(&value) {
        Ok(text) => Some(text),
        Err(error) => {
            warn!(%error, "failed to encode GUI outgoing message");
            None
        }
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
    async fn transport_local_gui_opener_round_trips_jsonrpc_events() {
        let (transport_event_tx, mut transport_event_rx) = mpsc::channel(4);
        let opener = TransportLocalGuiOpener::new(transport_event_tx, /*channel_capacity*/ 4);
        let (outgoing_tx, mut outgoing_rx) = mpsc::channel(4);

        let handle = opener
            .open_gui_connection(outgoing_tx)
            .expect("local GUI connection should open");
        let connection_id = handle.connection_id();

        let opened = transport_event_rx
            .recv()
            .await
            .expect("opened event should be sent");
        let writer = match opened {
            crate::transport::TransportEvent::ConnectionOpened {
                connection_id: opened_id,
                writer,
                ..
            } => {
                assert_eq!(opened_id, connection_id);
                writer
            }
            _ => panic!("expected opened event"),
        };

        let request: JSONRPCRequest = serde_json::from_value(serde_json::json!({
            "jsonrpc": JSONRPC_VERSION,
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": { "name": "gui-bridge-test", "version": "0.0.0" }
            }
        }))
        .expect("request should deserialize");
        handle
            .request(request)
            .expect("request event should be sent");
        let request_event = transport_event_rx
            .recv()
            .await
            .expect("request event should be sent");
        match request_event {
            crate::transport::TransportEvent::IncomingMessage {
                connection_id: event_id,
                message: codex_app_server_protocol::JSONRPCMessage::Request(request),
            } => {
                assert_eq!(event_id, connection_id);
                assert_eq!(request.method, "initialize");
            }
            _ => panic!("expected incoming request event"),
        }

        writer
            .send(crate::outgoing_message::QueuedOutgoingMessage::new(
                crate::outgoing_message::OutgoingMessage::Response(
                    crate::outgoing_message::OutgoingResponse {
                        id: codex_app_server_protocol::RequestId::Integer(1),
                        result: serde_json::json!({"ok": true}),
                    },
                ),
            ))
            .await
            .expect("writer should accept response");
        let response = outgoing_rx
            .recv()
            .await
            .expect("response should be written to GUI channel");
        let value: serde_json::Value = serde_json::from_str(&response).expect("valid JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 1);
        assert_eq!(value["result"], serde_json::json!({"ok": true}));

        drop(handle);
        let closed = transport_event_rx
            .recv()
            .await
            .expect("closed event should be sent");
        match closed {
            crate::transport::TransportEvent::ConnectionClosed {
                connection_id: closed_id,
            } => assert_eq!(closed_id, connection_id),
            _ => panic!("expected closed event"),
        }
    }

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
