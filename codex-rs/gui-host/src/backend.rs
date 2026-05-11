use tokio::sync::mpsc;

pub const GUI_CONNECTION_CHANNEL_CAPACITY: usize = 128;

pub struct AuthenticatedGuiConnection {
    pub inbound_rx: mpsc::Receiver<String>,
    pub outbound_tx: mpsc::Sender<String>,
}

impl AuthenticatedGuiConnection {
    pub fn new() -> (Self, mpsc::Sender<String>, mpsc::Receiver<String>) {
        let (inbound_tx, inbound_rx) = mpsc::channel(GUI_CONNECTION_CHANNEL_CAPACITY);
        let (outbound_tx, outbound_rx) = mpsc::channel(GUI_CONNECTION_CHANNEL_CAPACITY);
        (
            Self {
                inbound_rx,
                outbound_tx,
            },
            inbound_tx,
            outbound_rx,
        )
    }

    #[cfg(test)]
    pub(crate) fn new_for_test() -> (Self, mpsc::Sender<String>, mpsc::Receiver<String>) {
        Self::new()
    }
}

/// Backend for authenticated GUI bridge connections.
///
/// Implementations receive a connection with text channels and are expected to
/// forward validated JSON-RPC messages between the GUI host and the app-server
/// side of the bridge.
pub trait GuiBackend: Send + Sync + 'static {
    fn connect(
        &self,
        connection: AuthenticatedGuiConnection,
    ) -> impl std::future::Future<Output = anyhow::Result<()>> + Send;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authenticated_connection_channels_round_trip_text() {
        let (mut connection, inbound_tx, mut outbound_rx) =
            AuthenticatedGuiConnection::new_for_test();

        inbound_tx
            .try_send("{\"jsonrpc\":\"2.0\"}".to_string())
            .unwrap();
        assert_eq!(
            connection.inbound_rx.try_recv().unwrap(),
            "{\"jsonrpc\":\"2.0\"}"
        );

        connection
            .outbound_tx
            .try_send("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}".to_string())
            .unwrap();
        assert_eq!(
            outbound_rx.try_recv().unwrap(),
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}"
        );
    }
}
