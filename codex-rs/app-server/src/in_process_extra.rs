use std::collections::HashMap;
use std::collections::HashSet;
use std::io::Error as IoError;
use std::io::ErrorKind;
use std::io::Result as IoResult;
use std::sync::Arc;
use std::sync::RwLock;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use codex_app_server_protocol::JSONRPCNotification;
use codex_app_server_protocol::JSONRPCRequest;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use crate::message_processor::ConnectionSessionState;
use crate::message_processor::MessageProcessor;
use crate::outgoing_message::ConnectionId;
use crate::outgoing_message::QueuedOutgoingMessage;
use crate::transport::OutboundConnectionState;

static EXTRA_CONNECTION_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

pub(crate) fn next_extra_connection_id(main_connection_id: ConnectionId) -> ConnectionId {
    loop {
        let raw = EXTRA_CONNECTION_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
        if raw != main_connection_id.0 {
            break ConnectionId(raw);
        }
    }
}

pub(crate) enum ExtraConnectionCommand {
    Opened {
        connection_id: ConnectionId,
        outgoing_tx: mpsc::Sender<String>,
        disconnect_token: CancellationToken,
    },
    Request {
        connection_id: ConnectionId,
        request: Box<JSONRPCRequest>,
    },
    Notification {
        connection_id: ConnectionId,
        notification: JSONRPCNotification,
    },
    Closed {
        connection_id: ConnectionId,
    },
}

/// Handle returned by `InProcessClientSender::register_extra_connection`.
///
/// Dropping the handle issues a best-effort close command for this extra
/// connection. Transport-specific concerns belong in callers layered above this
/// neutral registration API.
pub struct ExtraConnectionHandle {
    pub connection_id: ConnectionId,
    pub command_sender: ExtraConnectionCommandSender,
    pub outgoing_tx: mpsc::Sender<String>,
    pub outgoing_rx: mpsc::Receiver<String>,
    pub disconnect_token: CancellationToken,
}

#[derive(Clone)]
pub struct ExtraConnectionCommandSender {
    inner: mpsc::Sender<crate::in_process::InProcessClientMessage>,
    connection_id: ConnectionId,
    runtime_handle: Option<tokio::runtime::Handle>,
}

impl ExtraConnectionCommandSender {
    pub(crate) fn new(
        inner: mpsc::Sender<crate::in_process::InProcessClientMessage>,
        connection_id: ConnectionId,
        runtime_handle: Option<tokio::runtime::Handle>,
    ) -> Self {
        Self {
            inner,
            connection_id,
            runtime_handle,
        }
    }

    pub fn send_request(&self, request: JSONRPCRequest) -> IoResult<()> {
        self.try_send(crate::in_process::InProcessClientMessage::Extra(
            ExtraConnectionCommand::Request {
                connection_id: self.connection_id,
                request: Box::new(request),
            },
        ))
    }

    pub fn send_notification(&self, notification: JSONRPCNotification) -> IoResult<()> {
        self.try_send(crate::in_process::InProcessClientMessage::Extra(
            ExtraConnectionCommand::Notification {
                connection_id: self.connection_id,
                notification,
            },
        ))
    }

    fn try_send(&self, message: crate::in_process::InProcessClientMessage) -> IoResult<()> {
        match self.inner.try_send(message) {
            Ok(()) => Ok(()),
            Err(mpsc::error::TrySendError::Full(_)) => Err(IoError::new(
                ErrorKind::WouldBlock,
                "in-process extra connection queue is full",
            )),
            Err(mpsc::error::TrySendError::Closed(_)) => Err(IoError::new(
                ErrorKind::BrokenPipe,
                "in-process app-server runtime is closed",
            )),
        }
    }
}

impl Drop for ExtraConnectionHandle {
    fn drop(&mut self) {
        let close_msg =
            crate::in_process::InProcessClientMessage::Extra(ExtraConnectionCommand::Closed {
                connection_id: self.connection_id,
            });
        match self.command_sender.inner.try_send(close_msg) {
            Ok(()) => {}
            Err(mpsc::error::TrySendError::Full(msg)) => {
                let sender = self.command_sender.inner.clone();
                if let Some(runtime_handle) = self.command_sender.runtime_handle.as_ref() {
                    runtime_handle.spawn(async move {
                        let _ = sender.send(msg).await;
                    });
                } else {
                    warn!(
                        connection_id = ?self.connection_id,
                        "dropping extra connection close command without Tokio runtime handle"
                    );
                }
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {}
        }
    }
}

pub(crate) enum OutboundControl {
    Register {
        connection_id: ConnectionId,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
        initialized: Arc<AtomicBool>,
        experimental_api_enabled: Arc<AtomicBool>,
        opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
        disconnect_sender: Option<CancellationToken>,
    },
    Unregister {
        connection_id: ConnectionId,
    },
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
            disconnect_sender,
        } => {
            outbound_connections.insert(
                connection_id,
                OutboundConnectionState::new(
                    writer,
                    initialized,
                    experimental_api_enabled,
                    opted_out_notification_methods,
                    disconnect_sender,
                ),
            );
        }
        OutboundControl::Unregister { connection_id } => {
            outbound_connections.remove(&connection_id);
        }
    }
}

pub(crate) struct PreparedExtraConnectionOpen {
    pub(crate) connection_id: ConnectionId,
    pub(crate) outbound_control: OutboundControl,
    pub(crate) processor_open: OpenedExtraConnection,
}

pub(crate) struct OpenedExtraConnection {
    connection_id: ConnectionId,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}

impl OpenedExtraConnection {
    #[cfg(test)]
    pub(crate) fn connection_id(&self) -> ConnectionId {
        self.connection_id
    }

    #[cfg(test)]
    pub(crate) fn for_test(connection_id: ConnectionId) -> Self {
        Self {
            connection_id,
            outbound_initialized: Arc::new(AtomicBool::new(false)),
            outbound_experimental_api_enabled: Arc::new(AtomicBool::new(false)),
            outbound_opted_out_notification_methods: Arc::new(RwLock::new(HashSet::new())),
        }
    }
}

pub(crate) fn prepare_opened_connection(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    disconnect_token: CancellationToken,
    channel_capacity: usize,
) -> PreparedExtraConnectionOpen {
    let (extra_writer_tx, extra_writer_rx) =
        mpsc::channel::<QueuedOutgoingMessage>(channel_capacity);
    spawn_extra_writer_bridge(connection_id, outgoing_tx, extra_writer_rx);

    let initialized = Arc::new(AtomicBool::new(false));
    let experimental_api_enabled = Arc::new(AtomicBool::new(false));
    let opted_out_notification_methods = Arc::new(RwLock::new(HashSet::new()));

    PreparedExtraConnectionOpen {
        connection_id,
        outbound_control: OutboundControl::Register {
            connection_id,
            writer: extra_writer_tx,
            initialized: Arc::clone(&initialized),
            experimental_api_enabled: Arc::clone(&experimental_api_enabled),
            opted_out_notification_methods: Arc::clone(&opted_out_notification_methods),
            disconnect_sender: Some(disconnect_token),
        },
        processor_open: OpenedExtraConnection {
            connection_id,
            outbound_initialized: initialized,
            outbound_experimental_api_enabled: experimental_api_enabled,
            outbound_opted_out_notification_methods: opted_out_notification_methods,
        },
    }
}

pub(crate) fn spawn_extra_writer_bridge(
    connection_id: ConnectionId,
    outgoing_tx: mpsc::Sender<String>,
    mut writer_rx: mpsc::Receiver<QueuedOutgoingMessage>,
) {
    tokio::spawn(async move {
        while let Some(queued) = writer_rx.recv().await {
            let serialized = match serde_json::to_string(&queued.message) {
                Ok(text) => text,
                Err(err) => {
                    tracing::error!(
                        connection_id = ?connection_id,
                        "failed to serialize extra outgoing message: {err}",
                    );
                    continue;
                }
            };
            if outgoing_tx.send(serialized).await.is_err() {
                break;
            }
            if let Some(done) = queued.write_complete_tx {
                let _ = done.send(());
            }
        }
    });
}

pub(crate) struct ExtraConnectionState {
    entries: HashMap<ConnectionId, ExtraConnectionEntry>,
    #[cfg(test)]
    closed_probe_tx: Option<mpsc::Sender<ConnectionId>>,
}

struct ExtraConnectionEntry {
    session_state: Arc<ConnectionSessionState>,
    outbound_initialized: Arc<AtomicBool>,
    outbound_experimental_api_enabled: Arc<AtomicBool>,
    outbound_opted_out_notification_methods: Arc<RwLock<HashSet<String>>>,
}

impl ExtraConnectionState {
    #[cfg_attr(test, allow(dead_code))]
    pub(crate) fn new() -> Self {
        Self {
            entries: HashMap::new(),
            #[cfg(test)]
            closed_probe_tx: None,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_closed_probe(closed_probe_tx: mpsc::Sender<ConnectionId>) -> Self {
        Self {
            entries: HashMap::new(),
            closed_probe_tx: Some(closed_probe_tx),
        }
    }

    pub(crate) fn initialized_connection_ids(
        &self,
        main_connection_id: ConnectionId,
        main_initialized: bool,
    ) -> Vec<ConnectionId> {
        let mut connection_ids = Vec::new();
        if main_initialized {
            connection_ids.push(main_connection_id);
        }
        for (connection_id, entry) in &self.entries {
            if entry.session_state.initialized() {
                connection_ids.push(*connection_id);
            }
        }
        connection_ids
    }

    pub(crate) async fn handle_processor_command(
        &mut self,
        processor: &Arc<MessageProcessor>,
        command: ExtraConnectionCommand,
    ) {
        match command {
            ExtraConnectionCommand::Opened { .. } => {
                unreachable!("open commands are expanded before processor dispatch");
            }
            ExtraConnectionCommand::Request {
                connection_id,
                request,
            } => {
                let Some(entry) = self.entries.get(&connection_id) else {
                    tracing::warn!(
                        ?connection_id,
                        "dropping extra request for unknown connection"
                    );
                    return;
                };
                let session_state = Arc::clone(&entry.session_state);
                let outbound_initialized = Arc::clone(&entry.outbound_initialized);
                let outbound_experimental_api_enabled =
                    Arc::clone(&entry.outbound_experimental_api_enabled);
                let outbound_opted_out_notification_methods =
                    Arc::clone(&entry.outbound_opted_out_notification_methods);

                processor
                    .process_request(
                        connection_id,
                        *request,
                        &crate::transport::AppServerTransport::Off,
                        Arc::clone(&session_state),
                    )
                    .await;

                let opted_out_snapshot = session_state.opted_out_notification_methods();
                if let Ok(mut opted_out) = outbound_opted_out_notification_methods.write() {
                    *opted_out = opted_out_snapshot;
                } else {
                    tracing::warn!(
                        ?connection_id,
                        "failed to mirror extra connection opted-out list"
                    );
                }
                outbound_experimental_api_enabled
                    .store(session_state.experimental_api_enabled(), Ordering::Release);
                let is_initialized = session_state.initialized();
                let was_initialized = outbound_initialized.swap(is_initialized, Ordering::AcqRel);
                if !was_initialized && is_initialized {
                    processor.connection_initialized(connection_id).await;
                }
            }
            ExtraConnectionCommand::Notification {
                connection_id,
                notification,
            } => {
                if !self.entries.contains_key(&connection_id) {
                    tracing::warn!(
                        ?connection_id,
                        "dropping extra notification for unknown connection"
                    );
                    return;
                }
                processor.process_notification(notification).await;
            }
            ExtraConnectionCommand::Closed { connection_id } => {
                if let Some(entry) = self.entries.remove(&connection_id) {
                    processor
                        .connection_closed(connection_id, &entry.session_state)
                        .await;
                    #[cfg(test)]
                    if let Some(closed_probe_tx) = &self.closed_probe_tx {
                        let _ = closed_probe_tx.try_send(connection_id);
                    }
                } else {
                    tracing::warn!(
                        ?connection_id,
                        "ExtraConnectionClosed for unknown connection"
                    );
                }
            }
        }
    }

    pub(crate) fn register_opened(&mut self, opened: OpenedExtraConnection) {
        let OpenedExtraConnection {
            connection_id,
            outbound_initialized,
            outbound_experimental_api_enabled,
            outbound_opted_out_notification_methods,
        } = opened;

        self.entries.insert(
            connection_id,
            ExtraConnectionEntry {
                session_state: Arc::new(ConnectionSessionState::new()),
                outbound_initialized,
                outbound_experimental_api_enabled,
                outbound_opted_out_notification_methods,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use codex_app_server_protocol::JSONRPCNotification;
    use pretty_assertions::assert_eq;

    use super::*;
    use crate::in_process::InProcessClientMessage;

    #[test]
    fn register_extra_connection_allocates_ids_starting_above_main() {
        let main_connection_id = ConnectionId(0);
        let first = next_extra_connection_id(main_connection_id);
        let second = next_extra_connection_id(main_connection_id);

        assert_ne!(first, main_connection_id);
        assert_ne!(second, main_connection_id);
        assert_ne!(first, second);
        assert!(first.0 >= 1);
        assert!(second.0 >= 1);
    }

    #[tokio::test]
    async fn dropping_extra_connection_handle_sends_closed_command() {
        let (client_tx, mut client_rx) = mpsc::channel(4);
        let (_outgoing_tx, outgoing_rx) = mpsc::channel(4);
        let (outgoing_tx, _outgoing_rx) = mpsc::channel(4);
        let connection_id = ConnectionId(31);
        let handle = ExtraConnectionHandle {
            connection_id,
            command_sender: ExtraConnectionCommandSender::new(
                client_tx,
                connection_id,
                tokio::runtime::Handle::try_current().ok(),
            ),
            outgoing_tx,
            outgoing_rx,
            disconnect_token: CancellationToken::new(),
        };

        drop(handle);

        let message = client_rx
            .recv()
            .await
            .expect("drop should send close command");
        match message {
            InProcessClientMessage::Extra(ExtraConnectionCommand::Closed {
                connection_id: closed_id,
            }) => {
                assert_eq!(closed_id, connection_id);
            }
            _ => panic!("expected ExtraConnectionCommand::Closed"),
        }
    }

    #[tokio::test]
    async fn prepare_opened_connection_builds_register_and_processor_open() {
        let connection_id = ConnectionId(41);
        let (outgoing_tx, _outgoing_rx) = mpsc::channel(4);
        let disconnect_token = CancellationToken::new();

        let prepared = prepare_opened_connection(
            connection_id,
            outgoing_tx,
            disconnect_token,
            /*channel_capacity*/ 4,
        );

        let PreparedExtraConnectionOpen {
            connection_id: prepared_connection_id,
            outbound_control,
            processor_open,
        } = prepared;

        assert_eq!(prepared_connection_id, connection_id);
        assert_eq!(processor_open.connection_id(), connection_id);

        match outbound_control {
            OutboundControl::Register {
                connection_id: registered_id,
                writer,
                initialized,
                experimental_api_enabled,
                opted_out_notification_methods,
                disconnect_sender,
            } => {
                assert_eq!(registered_id, connection_id);
                assert!(Arc::ptr_eq(
                    &initialized,
                    &processor_open.outbound_initialized
                ));
                assert!(Arc::ptr_eq(
                    &experimental_api_enabled,
                    &processor_open.outbound_experimental_api_enabled,
                ));
                assert!(Arc::ptr_eq(
                    &opted_out_notification_methods,
                    &processor_open.outbound_opted_out_notification_methods,
                ));
                assert!(!initialized.load(Ordering::Acquire));
                assert!(!experimental_api_enabled.load(Ordering::Acquire));
                assert_eq!(
                    opted_out_notification_methods
                        .read()
                        .expect("opted-out lock should not be poisoned")
                        .len(),
                    0
                );
                assert!(disconnect_sender.is_some());
                drop(writer);
            }
            OutboundControl::Unregister { .. } => {
                panic!("prepared open must register outbound state");
            }
        }
    }

    #[test]
    fn dropping_extra_connection_handle_under_backpressure_still_delivers_closed() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime");
        let connection_id = ConnectionId(37);
        let (handle, mut client_rx) = runtime.block_on(async {
            let (client_tx, client_rx) = mpsc::channel(1);
            let (_outgoing_tx, outgoing_rx) = mpsc::channel(4);
            let (outgoing_tx, _outgoing_rx) = mpsc::channel(4);
            client_tx
                .try_send(InProcessClientMessage::Extra(
                    ExtraConnectionCommand::Notification {
                        connection_id,
                        notification: JSONRPCNotification {
                            method: "initialized".to_string(),
                            params: None,
                        },
                    },
                ))
                .expect("pre-fill client queue");
            let handle = ExtraConnectionHandle {
                connection_id,
                command_sender: ExtraConnectionCommandSender::new(
                    client_tx,
                    connection_id,
                    tokio::runtime::Handle::try_current().ok(),
                ),
                outgoing_tx,
                outgoing_rx,
                disconnect_token: CancellationToken::new(),
            };
            (handle, client_rx)
        });

        drop(handle);

        let first = runtime
            .block_on(client_rx.recv())
            .expect("pre-filled message");
        match first {
            InProcessClientMessage::Extra(ExtraConnectionCommand::Notification {
                connection_id: notified_id,
                ..
            }) => {
                assert_eq!(notified_id, connection_id);
            }
            _ => panic!("expected pre-filled ExtraConnectionCommand::Notification"),
        }

        let close = runtime
            .block_on(async {
                tokio::time::timeout(Duration::from_secs(1), client_rx.recv()).await
            })
            .expect("close command should arrive after queue drains")
            .expect("close command");
        match close {
            InProcessClientMessage::Extra(ExtraConnectionCommand::Closed {
                connection_id: closed_id,
            }) => {
                assert_eq!(closed_id, connection_id);
            }
            _ => panic!("expected ExtraConnectionCommand::Closed"),
        }
    }
}
