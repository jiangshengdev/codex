use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::extract::WebSocketUpgrade;
use axum::extract::ws::CloseFrame;
use axum::extract::ws::Message;
use axum::extract::ws::WebSocket;
use axum::http::HeaderMap;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::Response;
use futures::SinkExt;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::Map;
use serde_json::Value;
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::AdvertisedHost;
use crate::AuthenticatedGuiConnection;
use crate::GuiBackend;
use crate::LaunchToken;
use crate::browser_contract::AUTHENTICATE_METHOD;
use crate::browser_contract::GuiAuthenticateParams;
use crate::browser_contract::GuiAuthenticateResult;
use crate::host::GuiHostState;
use crate::host::is_advertised_host;
use crate::is_allowed_client_notification_method;
use crate::is_allowed_client_request_method;
use crate::is_allowed_server_notification_method;

/// Production authentication grace period for the first WebSocket frame.
const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const POLICY_VIOLATION: u16 = axum::extract::ws::close_code::POLICY;
const METHOD_NOT_FOUND: i64 = -32601;

#[derive(Deserialize)]
struct AuthenticateRequest {
    jsonrpc: String,
    id: serde_json::Value,
    method: String,
    params: GuiAuthenticateParams,
}

#[derive(Deserialize)]
struct JsonRpcEnvelope {
    jsonrpc: Option<String>,
    method: Option<String>,
    #[serde(flatten)]
    fields: Map<String, Value>,
}

enum BrowserTextDisposition {
    Forward,
    RejectRequest(Value),
    DropNotification,
    Close,
}

pub(crate) async fn ws_handler<B>(
    State(state): State<Arc<GuiHostState<B>>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response
where
    B: GuiBackend + Clone,
{
    let host = headers
        .get(axum::http::header::HOST)
        .and_then(|value| value.to_str().ok());
    let origin = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|value| value.to_str().ok());

    let Some(host) = host else {
        return StatusCode::FORBIDDEN.into_response();
    };

    if !validate_host_and_origin(
        &state.advertised_hosts,
        state.local_addr.port(),
        host,
        origin,
    ) {
        return StatusCode::FORBIDDEN.into_response();
    }

    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

pub(crate) fn validate_host_and_origin(
    advertised_hosts: &[AdvertisedHost],
    port: u16,
    host: &str,
    origin: Option<&str>,
) -> bool {
    if !is_advertised_host(advertised_hosts, port, host) {
        return false;
    }

    advertised_hosts.iter().any(|advertised| {
        host == advertised.authority(port) && origin == Some(advertised.origin(port).as_str())
    })
}

pub(crate) fn parse_authenticate_request(
    text: &str,
    expected_token: &LaunchToken,
) -> Result<serde_json::Value, ()> {
    let request: AuthenticateRequest = serde_json::from_str(text).map_err(|_| ())?;
    if request.jsonrpc == "2.0"
        && request.method == AUTHENTICATE_METHOD
        // The launch token is loopback-only, high entropy, and matched directly as specified.
        && request.params.token == expected_token.as_str()
    {
        Ok(request.id)
    } else {
        Err(())
    }
}

async fn handle_socket<B>(mut socket: WebSocket, state: Arc<GuiHostState<B>>)
where
    B: GuiBackend + Clone,
{
    let auth_message = timeout(auth_timeout(), socket.next()).await;
    let id = match auth_message {
        Ok(Some(Ok(Message::Text(text)))) => {
            match parse_authenticate_request(text.as_str(), &state.launch_token) {
                Ok(id) => id,
                Err(()) => {
                    close_policy_violation(&mut socket).await;
                    return;
                }
            }
        }
        _ => {
            close_policy_violation(&mut socket).await;
            return;
        }
    };

    if socket
        .send(Message::Text(authenticate_response(id).into()))
        .await
        .is_err()
    {
        return;
    }

    let (connection, inbound_tx, outbound_rx) = AuthenticatedGuiConnection::new();
    let backend = state.backend.clone();
    let backend_task = tokio::spawn(async move {
        if let Err(error) = backend.connect(connection).await {
            tracing::warn!(%error, "GUI backend connection failed");
        }
    });

    pump_authenticated_socket(socket, inbound_tx, outbound_rx).await;
    backend_task.abort();
    let _ = backend_task.await;
}

async fn pump_authenticated_socket(
    socket: WebSocket,
    inbound_tx: mpsc::Sender<String>,
    mut outbound_rx: mpsc::Receiver<String>,
) {
    let (mut browser_tx, mut browser_rx) = socket.split();

    loop {
        tokio::select! {
            message = browser_rx.next() => {
                match message {
                    Some(Ok(Message::Text(text))) => {
                        match classify_browser_text(text.as_str()) {
                            BrowserTextDisposition::Forward => {
                                if inbound_tx.send(text.to_string()).await.is_err() {
                                    break;
                                }
                            }
                            BrowserTextDisposition::RejectRequest(id) => {
                                if browser_tx.send(Message::Text(method_not_found_response(id).into())).await.is_err() {
                                    break;
                                }
                            }
                            BrowserTextDisposition::DropNotification => {}
                            BrowserTextDisposition::Close => {
                                let _ = browser_tx
                                    .send(Message::Close(Some(CloseFrame {
                                        code: POLICY_VIOLATION,
                                        reason: "".into(),
                                    })))
                                    .await;
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Binary(_))) | Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
                    Some(Err(error)) => {
                        tracing::debug!(%error, "GUI websocket receive failed");
                        break;
                    }
                }
            }
            outbound = outbound_rx.recv() => {
                let Some(text) = outbound else {
                    break;
                };
                if !is_allowed_backend_text(&text) {
                    continue;
                }
                if browser_tx.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

fn authenticate_response(id: serde_json::Value) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": GuiAuthenticateResult { authenticated: true },
    })
    .to_string()
}

#[cfg(test)]
fn is_allowed_browser_text(text: &str) -> bool {
    matches!(classify_browser_text(text), BrowserTextDisposition::Forward)
}

fn classify_browser_text(text: &str) -> BrowserTextDisposition {
    let Ok(envelope) = serde_json::from_str::<JsonRpcEnvelope>(text) else {
        return BrowserTextDisposition::Close;
    };

    if envelope.jsonrpc.as_deref() != Some("2.0") {
        return BrowserTextDisposition::Close;
    }

    if envelope.fields.contains_key("result") || envelope.fields.contains_key("error") {
        return BrowserTextDisposition::Close;
    }

    let Some(method) = envelope.method.as_deref() else {
        return BrowserTextDisposition::Close;
    };

    let id = envelope.fields.get("id");
    match id {
        None => {
            if is_allowed_client_notification_method(method) {
                BrowserTextDisposition::Forward
            } else {
                BrowserTextDisposition::DropNotification
            }
        }
        Some(id) => {
            if is_allowed_client_request_method(method) {
                BrowserTextDisposition::Forward
            } else {
                BrowserTextDisposition::RejectRequest(id.clone())
            }
        }
    }
}

fn is_allowed_backend_text(text: &str) -> bool {
    let Ok(envelope) = serde_json::from_str::<JsonRpcEnvelope>(text) else {
        return false;
    };

    if envelope.jsonrpc.as_deref() != Some("2.0") {
        return false;
    }

    let has_result = envelope.fields.contains_key("result");
    let has_error = envelope.fields.contains_key("error");
    if has_result && has_error {
        return false;
    }

    if has_result || has_error {
        return envelope.fields.contains_key("id") && envelope.method.is_none();
    }

    let Some(method) = envelope.method.as_deref() else {
        return false;
    };

    !envelope.fields.contains_key("id") && is_allowed_server_notification_method(method)
}

async fn close_policy_violation(socket: &mut WebSocket) {
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code: POLICY_VIOLATION,
            reason: "".into(),
        })))
        .await;
}

fn method_not_found_response(id: serde_json::Value) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": METHOD_NOT_FOUND,
            "message": "Method not found",
        },
    })
    .to_string()
}

fn auth_timeout() -> Duration {
    #[cfg(test)]
    {
        Duration::from_millis(50)
    }

    #[cfg(not(test))]
    {
        AUTH_TIMEOUT
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn validates_exact_host_and_origin() {
        let advertised_hosts = vec![
            crate::AdvertisedHost::new(crate::GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
            crate::AdvertisedHost::new(crate::GuiLaunchUrlKind::Lan, "LAN", "192.168.3.165"),
            crate::AdvertisedHost::new(crate::GuiLaunchUrlKind::Vpn, "VPN", "100.88.28.119"),
        ];

        assert!(super::validate_host_and_origin(
            &advertised_hosts,
            /*port*/ 4567,
            "127.0.0.1:4567",
            Some("http://127.0.0.1:4567")
        ));
        assert!(super::validate_host_and_origin(
            &advertised_hosts,
            /*port*/ 4567,
            "192.168.3.165:4567",
            Some("http://192.168.3.165:4567")
        ));
        assert!(!super::validate_host_and_origin(
            &advertised_hosts,
            /*port*/ 4567,
            "localhost:4567",
            Some("http://127.0.0.1:4567")
        ));
        assert!(!super::validate_host_and_origin(
            &advertised_hosts,
            /*port*/ 4567,
            "127.0.0.1:4567",
            Some("http://localhost:4567")
        ));
        assert!(!super::validate_host_and_origin(
            &advertised_hosts,
            /*port*/ 4567,
            "127.0.0.1:4567",
            /*origin*/ None
        ));
        assert!(!super::validate_host_and_origin(
            &advertised_hosts,
            /*port*/ 4567,
            "192.168.3.165:4567",
            Some("http://100.88.28.119:4567")
        ));
        assert!(!super::validate_host_and_origin(
            &advertised_hosts,
            /*port*/ 4567,
            "10.0.0.88:4567",
            Some("http://10.0.0.88:4567")
        ));
    }

    #[test]
    fn parses_valid_authenticate_request() {
        let token = LaunchToken::generate().expect("token should generate");
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 7,
            "method": AUTHENTICATE_METHOD,
            "params": GuiAuthenticateParams {
                token: token.as_str().to_string(),
            },
        })
        .to_string();

        assert_eq!(
            parse_authenticate_request(&text, &token).expect("auth should parse"),
            serde_json::json!(7)
        );
    }

    #[test]
    fn allows_backend_response_with_null_result() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": null,
        })
        .to_string();

        assert!(is_allowed_backend_text(&text));
    }

    #[test]
    fn allows_backend_response_with_object_result() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "attached": true,
            },
        })
        .to_string();

        assert!(is_allowed_backend_text(&text));
    }

    #[test]
    fn allows_backend_error_response() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "error": {
                "code": -32601,
                "message": "Method not found",
            },
        })
        .to_string();

        assert!(is_allowed_backend_text(&text));
    }

    #[test]
    fn rejects_backend_response_with_result_and_error() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": null,
            "error": {
                "code": -32603,
                "message": "Internal error",
            },
        })
        .to_string();

        assert!(!is_allowed_backend_text(&text));
    }

    #[test]
    fn production_auth_timeout_is_five_seconds() {
        assert_eq!(AUTH_TIMEOUT, Duration::from_secs(5));
    }

    #[test]
    fn allows_backend_projection_event_notification() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "thread/projection/event",
            "params": {},
        })
        .to_string();

        assert!(is_allowed_backend_text(&text));
    }

    #[test]
    fn rejects_other_backend_notification() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "thread/updated",
            "params": {},
        })
        .to_string();

        assert!(!is_allowed_backend_text(&text));
    }

    #[test]
    fn allows_browser_initialize_request() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {},
        })
        .to_string();

        assert!(is_allowed_browser_text(&text));
    }

    #[test]
    fn rejects_browser_notification() {
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "initialized",
            "params": {},
        })
        .to_string();

        assert!(!is_allowed_browser_text(&text));
    }

    #[test]
    fn rejects_authenticate_request_with_wrong_token() {
        let token = LaunchToken::generate().expect("token should generate");
        let text = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 7,
            "method": AUTHENTICATE_METHOD,
            "params": GuiAuthenticateParams {
                token: "wrong-token".to_string(),
            },
        })
        .to_string();

        assert_eq!(parse_authenticate_request(&text, &token), Err(()));
    }
}
