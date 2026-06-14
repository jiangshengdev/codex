use std::collections::HashMap;
use std::collections::HashSet;
use std::io;
use std::io::ErrorKind;
use std::sync::Arc;
use std::sync::RwLock;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use codex_app_server_protocol::JSONRPCErrorError;
use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use codex_app_server_protocol::RequestId;
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::error_code::OVERLOADED_ERROR_CODE;
use crate::message_processor::ConnectionSessionState;
use crate::message_processor::MessageProcessor;
use crate::outgoing_message::ConnectionId;
use crate::outgoing_message::OutgoingError;
use crate::outgoing_message::OutgoingMessage;
use crate::outgoing_message::QueuedOutgoingMessage;
use crate::transport::AppServerTransport;
use crate::transport::OutboundConnectionState;

pub(crate) enum ExtraConnectionCommand {
    Opened {
        connection_id: ConnectionId,
        outgoing_tx: mpsc::Sender<String>,
        disconnect_token: CancellationToken,
    },
    Request {
        connection_id: ConnectionId,
        request: JSONRPCRequest,
    },
    Notification {
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

pub(crate) enum ExtraProcessorCommand {
    Opened(OpenedExtraConnection),
    Request {
        connection_id: ConnectionId,
        request: JSONRPCRequest,
    },
    Notification {
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

pub(crate) enum OutboundControl {
    Register {
        connection_id: ConnectionId,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
        disconnect_token: CancellationToken,
    },
    Unregister {
        connection_id: ConnectionId,
    },
    Send {
        connection_id: ConnectionId,
        message: Box<QueuedOutgoingMessage>,
    },
}

pub(crate) struct ExtraConnectionHandle {
    connection_id: ConnectionId,
    command_sender: ExtraConnectionCommandSender,
    disconnect_token: CancellationToken,
    close_on_drop: bool,
}

impl ExtraConnectionHandle {
    #[allow(dead_code)]
    pub(crate) fn connection_id(&self) -> ConnectionId {
        self.connection_id
    }

    #[allow(dead_code)]
    pub(crate) fn command_sender(&self) -> ExtraConnectionCommandSender {
        self.command_sender.clone()
    }

    #[allow(dead_code)]
    pub(crate) fn disconnect_token(&self) -> CancellationToken {
        self.disconnect_token.clone()
    }

    pub(crate) fn into_parts(
        mut self,
    ) -> (
        ConnectionId,
        ExtraConnectionCommandSender,
        CancellationToken,
    ) {
        self.close_on_drop = false;
        (
            self.connection_id,
            self.command_sender.clone(),
            self.disconnect_token.clone(),
        )
    }
}

impl Drop for ExtraConnectionHandle {
    fn drop(&mut self) {
        if self.close_on_drop {
            self.command_sender.close_best_effort(self.connection_id);
        }
    }
}

#[derive(Clone)]
pub(crate) struct ExtraConnectionCommandSender {
    client_tx: mpsc::Sender<crate::in_process::InProcessClientMessage>,
}

static NEXT_EXTRA_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

fn next_connection_id() -> ConnectionId {
    ConnectionId(NEXT_EXTRA_CONNECTION_ID.fetch_add(1, Ordering::Relaxed))
}

impl ExtraConnectionCommandSender {
    pub(crate) fn new(client_tx: mpsc::Sender<crate::in_process::InProcessClientMessage>) -> Self {
        Self { client_tx }
    }

    pub(crate) fn open(
        &self,
        outgoing_tx: mpsc::Sender<String>,
    ) -> io::Result<ExtraConnectionHandle> {
        let connection_id = next_connection_id();
        let disconnect_token = CancellationToken::new();
        self.try_send(ExtraConnectionCommand::Opened {
            connection_id,
            outgoing_tx,
            disconnect_token: disconnect_token.clone(),
        })?;
        Ok(ExtraConnectionHandle {
            connection_id,
            command_sender: self.clone(),
            disconnect_token,
            close_on_drop: true,
        })
    }

    pub(crate) fn request(
        &self,
        connection_id: ConnectionId,
        request: JSONRPCRequest,
    ) -> io::Result<()> {
        self.try_send(ExtraConnectionCommand::Request {
            connection_id,
            request,
        })
    }

    pub(crate) fn notification(
        &self,
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    ) -> io::Result<()> {
        self.try_send(ExtraConnectionCommand::Notification {
            connection_id,
            notification,
        })
    }

    pub(crate) fn close_best_effort(&self, connection_id: ConnectionId) {
        let message = crate::in_process::InProcessClientMessage::Extra(Box::new(
            ExtraConnectionCommand::Closed { connection_id },
        ));
        match self.client_tx.try_send(message) {
            Ok(()) => {}
            Err(mpsc::error::TrySendError::Full(message)) => {
                let client_tx = self.client_tx.clone();
                let Ok(handle) = tokio::runtime::Handle::try_current() else {
                    warn!(
                        "dropping extra connection close because runtime is unavailable and queue is full"
                    );
                    return;
                };
                handle.spawn(async move {
                    if client_tx.send(message).await.is_err() {
                        warn!("dropping extra connection close because runtime is closed");
                    }
                });
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {}
        }
    }

    fn try_send(&self, command: ExtraConnectionCommand) -> io::Result<()> {
        self.client_tx
            .try_send(crate::in_process::InProcessClientMessage::Extra(Box::new(
                command,
            )))
            .map_err(|err| match err {
                mpsc::error::TrySendError::Full(_) => {
                    io::Error::new(ErrorKind::WouldBlock, "extra connection queue is full")
                }
                mpsc::error::TrySendError::Closed(_) => io::Error::new(
                    ErrorKind::BrokenPipe,
                    "in-process app-server runtime is closed",
                ),
            })
    }
}

pub(crate) struct PreparedExtraConnectionOpen {
    pub(crate) connection_id: ConnectionId,
    pub(crate) outbound_control: OutboundControl,
    pub(crate) processor_command: ExtraProcessorCommand,
}

pub(crate) enum PreparedExtraClientCommand {
    Opened(PreparedExtraConnectionOpen),
    Request {
        connection_id: ConnectionId,
        request_id: RequestId,
        processor_command: ExtraProcessorCommand,
    },
    Notification(ExtraProcessorCommand),
    Closed {
        processor_command: ExtraProcessorCommand,
        outbound_control: OutboundControl,
    },
}

pub(crate) struct OpenedExtraConnection {
    connection_id: ConnectionId,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}

pub(crate) fn prepare_client_command(
    command: ExtraConnectionCommand,
    channel_capacity: usize,
) -> PreparedExtraClientCommand {
    match command {
        ExtraConnectionCommand::Opened {
            connection_id,
            outgoing_tx,
            disconnect_token,
        } => PreparedExtraClientCommand::Opened(prepare_opened_connection(
            connection_id,
            outgoing_tx,
            disconnect_token,
            channel_capacity,
        )),
        ExtraConnectionCommand::Request {
            connection_id,
            request,
        } => {
            let request_id = request.id.clone();
            PreparedExtraClientCommand::Request {
                connection_id,
                request_id,
                processor_command: ExtraProcessorCommand::Request {
                    connection_id,
                    request,
                },
            }
        }
        ExtraConnectionCommand::Notification {
            connection_id,
            notification,
        } => PreparedExtraClientCommand::Notification(ExtraProcessorCommand::Notification {
            connection_id,
            notification,
        }),
        ExtraConnectionCommand::Closed { connection_id } => PreparedExtraClientCommand::Closed {
            processor_command: ExtraProcessorCommand::Closed { connection_id },
            outbound_control: OutboundControl::Unregister { connection_id },
        },
    }
}

pub(crate) fn prepare_opened_connection(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    disconnect_token: CancellationToken,
    channel_capacity: usize,
) -> PreparedExtraConnectionOpen {
    let (writer_tx, writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
    spawn_extra_writer_bridge(connection_id, outgoing_tx, writer_rx);
    let outbound_initialized = Arc::new(AtomicBool::new(false));
    let outbound_experimental_api_enabled = Arc::new(AtomicBool::new(false));
    let outbound_opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()));
    PreparedExtraConnectionOpen {
        connection_id,
        outbound_control: OutboundControl::Register {
            connection_id,
            writer: writer_tx,
            initialized: Arc::clone(&outbound_initialized),
            experimental_api_enabled: Arc::clone(&outbound_experimental_api_enabled),
            opted_out_notification_methods: Arc::clone(&outbound_opted_out_notification_methods),
            disconnect_token,
        },
        processor_command: ExtraProcessorCommand::Opened(OpenedExtraConnection {
            connection_id,
            outbound_initialized,
            outbound_experimental_api_enabled,
            outbound_opted_out_notification_methods,
        }),
    }
}

struct ExtraConnectionEntry {
    session: Arc<ConnectionSessionState>,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}

#[derive(Default)]
pub(crate) struct ExtraConnectionState {
    entries: HashMap<ConnectionId, ExtraConnectionEntry>,
}

impl ExtraConnectionState {
    pub(crate) fn register_opened(&mut self, opened: OpenedExtraConnection) {
        self.entries.insert(
            opened.connection_id,
            ExtraConnectionEntry {
                session: Arc::new(ConnectionSessionState::new()),
                outbound_initialized: opened.outbound_initialized,
                outbound_experimental_api_enabled: opened.outbound_experimental_api_enabled,
                outbound_opted_out_notification_methods: opened
                    .outbound_opted_out_notification_methods,
            },
        );
    }

    pub(crate) fn extend_initialized_connection_ids(&self, connection_ids: &mut Vec<ConnectionId>) {
        connection_ids.extend(self.entries.iter().filter_map(|(connection_id, entry)| {
            entry.session.initialized().then_some(*connection_id)
        }));
    }

    pub(crate) async fn handle_processor_command(
        &mut self,
        processor: &Arc<MessageProcessor>,
        command: ExtraProcessorCommand,
    ) {
        match command {
            ExtraProcessorCommand::Opened(opened) => self.register_opened(opened),
            ExtraProcessorCommand::Request {
                connection_id,
                request,
            } => {
                let Some(entry) = self.entries.get(&connection_id) else {
                    warn!("dropping request from unknown extra connection: {connection_id:?}");
                    return;
                };
                let was_initialized = entry.session.initialized();
                processor
                    .process_request(
                        connection_id,
                        request,
                        &AppServerTransport::Stdio,
                        Arc::clone(&entry.session),
                    )
                    .await;
                mirror_session_state(entry);
                if !was_initialized && entry.session.initialized() {
                    processor
                        .send_initialize_notifications_to_connection(connection_id)
                        .await;
                    processor
                        .connection_initialized(connection_id, entry.session.request_attestation())
                        .await;
                    entry.outbound_initialized.store(true, Ordering::Release);
                }
            }
            ExtraProcessorCommand::Notification {
                connection_id,
                notification,
            } => {
                if self.entries.contains_key(&connection_id) {
                    processor.process_notification(notification).await;
                } else {
                    warn!("dropping notification from unknown extra connection: {connection_id:?}");
                }
            }
            ExtraProcessorCommand::Closed { connection_id } => {
                if let Some(entry) = self.entries.remove(&connection_id) {
                    processor
                        .connection_closed(connection_id, &entry.session)
                        .await;
                }
            }
        }
    }
}

fn mirror_session_state(entry: &ExtraConnectionEntry) {
    if let Ok(mut opted_out_notification_methods) =
        entry.outbound_opted_out_notification_methods.write()
    {
        *opted_out_notification_methods = entry.session.opted_out_notification_methods();
    } else {
        warn!("failed to update extra outbound opted-out notifications");
    }
    entry
        .outbound_experimental_api_enabled
        .store(entry.session.experimental_api_enabled(), Ordering::Release);
}

pub(crate) fn handle_outbound_control(
    outbound_connections: &mut HashMap<ConnectionId, OutboundConnectionState>,
    control: OutboundControl,
) {
    match control {
        OutboundControl::Register {
            connection_id,
            writer,
            initialized,
            experimental_api_enabled,
            opted_out_notification_methods,
            disconnect_token,
        } => {
            outbound_connections.insert(
                connection_id,
                OutboundConnectionState::new(
                    writer,
                    initialized,
                    experimental_api_enabled,
                    opted_out_notification_methods,
                    Some(disconnect_token),
                ),
            );
        }
        OutboundControl::Unregister { connection_id } => {
            outbound_connections.remove(&connection_id);
        }
        OutboundControl::Send {
            connection_id,
            message,
        } => {
            let Some(connection_state) = outbound_connections.get_mut(&connection_id) else {
                warn!("dropping message for disconnected extra connection: {connection_id:?}");
                return;
            };
            match connection_state.writer.try_send(*message) {
                Ok(()) => {}
                Err(mpsc::error::TrySendError::Full(_)) => {
                    warn!("dropping message for backpressured extra connection: {connection_id:?}");
                }
                Err(mpsc::error::TrySendError::Closed(_)) => {
                    outbound_connections.remove(&connection_id);
                }
            }
        }
    }
}

pub(crate) fn request_queue_full_error_control(
    connection_id: ConnectionId,
    request_id: RequestId,
) -> OutboundControl {
    OutboundControl::Send {
        connection_id,
        message: Box::new(QueuedOutgoingMessage::new(OutgoingMessage::Error(
            OutgoingError {
                id: request_id,
                error: JSONRPCErrorError {
                    code: OVERLOADED_ERROR_CODE,
                    message: "in-process app-server request queue is full".to_string(),
                    data: None,
                },
            },
        ))),
    }
}

pub(crate) fn try_send_request_queue_full_error(
    outbound_control_tx: &mpsc::Sender<OutboundControl>,
    connection_id: ConnectionId,
    request_id: RequestId,
) {
    let control = request_queue_full_error_control(connection_id, request_id);
    match outbound_control_tx.try_send(control) {
        Ok(()) => {}
        Err(mpsc::error::TrySendError::Full(_)) => {
            warn!("dropping extra request overload error because outbound control queue is full");
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {
            warn!("dropping extra request overload error because outbound control queue is closed");
        }
    }
}

fn spawn_extra_writer_bridge(
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
        tracing::debug!(?connection_id, "extra connection writer bridge stopped");
    });
}

fn serialize_outgoing_text(message: codex_app_server_transport::OutgoingMessage) -> Option<String> {
    let mut value = match serde_json::to_value(message) {
        Ok(value) => value,
        Err(error) => {
            warn!(%error, "failed to serialize extra outgoing message");
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
            warn!(%error, "failed to encode extra outgoing message");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use codex_app_server_protocol::JSONRPC_VERSION;
    use codex_app_server_transport::OutgoingMessage;
    use codex_app_server_transport::OutgoingResponse;
    use pretty_assertions::assert_eq;
    use std::time::Duration;

    #[test]
    fn extra_connection_ids_do_not_use_main_connection_id() {
        assert_ne!(
            next_connection_id(),
            crate::in_process::IN_PROCESS_CONNECTION_ID
        );
    }

    #[test]
    fn serialize_outgoing_text_adds_jsonrpc_version() {
        let text = serialize_outgoing_text(OutgoingMessage::Response(OutgoingResponse {
            id: codex_app_server_protocol::RequestId::Integer(7),
            result: serde_json::json!({"ok": true}),
        }))
        .expect("response should serialize");
        let value: serde_json::Value = serde_json::from_str(&text).expect("text should be JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 7);
        assert_eq!(value["result"], serde_json::json!({"ok": true}));
    }

    #[tokio::test]
    async fn prepared_open_registers_outbound_and_processor_payloads() {
        let (outgoing_tx, _outgoing_rx) = mpsc::channel(1);
        let connection_id = ConnectionId(42);
        let prepared = prepare_opened_connection(
            connection_id,
            outgoing_tx,
            CancellationToken::new(),
            /*channel_capacity*/ 1,
        );
        assert_eq!(prepared.connection_id, connection_id);
        match prepared.outbound_control {
            OutboundControl::Register {
                connection_id: registered,
                ..
            } => assert_eq!(registered, connection_id),
            OutboundControl::Unregister { .. } => {
                panic!("prepared open should register outbound state")
            }
            OutboundControl::Send { .. } => {
                panic!("prepared open should not send an outbound message")
            }
        }
        match prepared.processor_command {
            ExtraProcessorCommand::Opened(opened) => {
                assert_eq!(opened.connection_id, connection_id);
            }
            _ => panic!("prepared open should create processor opened command"),
        }
    }

    #[tokio::test]
    async fn dropping_handle_sends_close_after_full_queue_drains() {
        let (client_tx, mut client_rx) = mpsc::channel(1);
        let command_sender = ExtraConnectionCommandSender::new(client_tx);
        let (outgoing_tx, _outgoing_rx) = mpsc::channel(1);
        let handle = command_sender
            .open(outgoing_tx)
            .expect("open command should fit in empty queue");
        let connection_id = handle.connection_id();

        drop(handle);

        let opened = client_rx
            .recv()
            .await
            .expect("opened command should be queued first");
        match opened {
            crate::in_process::InProcessClientMessage::Extra(command) => match *command {
                ExtraConnectionCommand::Opened {
                    connection_id: opened_id,
                    ..
                } => assert_eq!(opened_id, connection_id),
                _ => panic!("expected opened command"),
            },
            _ => panic!("expected extra command"),
        }

        let closed = tokio::time::timeout(Duration::from_secs(1), client_rx.recv())
            .await
            .expect("close fallback should send after the queue drains")
            .expect("closed command should be queued");
        match closed {
            crate::in_process::InProcessClientMessage::Extra(command) => match *command {
                ExtraConnectionCommand::Closed {
                    connection_id: closed_id,
                } => assert_eq!(closed_id, connection_id),
                _ => panic!("expected closed command"),
            },
            _ => panic!("expected extra command"),
        }
    }

    #[test]
    fn request_queue_full_control_sends_jsonrpc_error_text() {
        let connection_id = ConnectionId(51);
        let request_id = codex_app_server_protocol::RequestId::Integer(9);
        let (writer_tx, mut writer_rx) = mpsc::channel(1);
        let mut outbound_connections = HashMap::new();
        handle_outbound_control(
            &mut outbound_connections,
            OutboundControl::Register {
                connection_id,
                writer: writer_tx,
                initialized: Arc::new(AtomicBool::new(true)),
                experimental_api_enabled: Arc::new(AtomicBool::new(false)),
                opted_out_notification_methods: Arc::new(RwLock::new(HashSet::new())),
                disconnect_token: CancellationToken::new(),
            },
        );

        handle_outbound_control(
            &mut outbound_connections,
            request_queue_full_error_control(connection_id, request_id),
        );

        let queued = writer_rx
            .try_recv()
            .expect("overload error should be queued");
        let text = serialize_outgoing_text(queued.message).expect("error should serialize");
        let value: serde_json::Value = serde_json::from_str(&text).expect("text should be JSON");
        assert_eq!(value["jsonrpc"], JSONRPC_VERSION);
        assert_eq!(value["id"], 9);
        assert_eq!(
            value["error"]["code"],
            crate::error_code::OVERLOADED_ERROR_CODE
        );
        assert_eq!(
            value["error"]["message"],
            "in-process app-server request queue is full"
        );
    }
}
