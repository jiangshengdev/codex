use std::fmt::Display;
use std::io;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::http::Uri;
use axum::middleware;
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

use crate::GuiBackend;
use crate::GuiHostConfig;
use crate::GuiHostMode;
use crate::LaunchToken;
use crate::assets;
use crate::launch_url_for_thread;

pub struct GuiHost;

pub struct GuiHostHandle {
    local_addr: SocketAddr,
    launch_token: LaunchToken,
    shutdown_tx: oneshot::Sender<()>,
    cancel_token: CancellationToken,
    server_task: tokio::task::JoinHandle<io::Result<()>>,
}

#[derive(Clone)]
pub(crate) struct GuiHostState<B> {
    pub(crate) local_addr: SocketAddr,
    pub(crate) launch_token: LaunchToken,
    pub(crate) mode: GuiHostMode,
    pub(crate) backend: B,
}

impl GuiHost {
    pub async fn start<B>(config: GuiHostConfig, backend: B) -> io::Result<GuiHostHandle>
    where
        B: GuiBackend + Clone,
    {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
        let local_addr = listener.local_addr()?;
        let launch_token = LaunchToken::generate().map_err(io::Error::other)?;
        let state = Arc::new(GuiHostState {
            local_addr,
            launch_token: launch_token.clone(),
            mode: config.mode,
            backend,
        });
        let app = router_for_state(state).map_err(io::Error::other)?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let cancel_token = CancellationToken::new();
        let server_cancel = cancel_token.clone();
        let server_task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    tokio::select! {
                        _ = shutdown_rx => {}
                        _ = server_cancel.cancelled() => {}
                    }
                })
                .await
        });

        Ok(GuiHostHandle {
            local_addr,
            launch_token,
            shutdown_tx,
            cancel_token,
            server_task,
        })
    }
}

impl GuiHostHandle {
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub fn launch_token(&self) -> &LaunchToken {
        &self.launch_token
    }

    pub fn launch_url_for_thread(&self, thread_id: impl Display) -> String {
        launch_url_for_thread(self.local_addr, thread_id, &self.launch_token)
    }

    /// Returns a clone of the server's cancel token.
    ///
    /// Cancelling the token triggers the same graceful shutdown path as
    /// `shutdown(self)`, while remaining sync-firable from any context.
    pub fn cancel_token(&self) -> CancellationToken {
        self.cancel_token.clone()
    }

    pub async fn shutdown(self) {
        let _ = self.shutdown_tx.send(());
        match self.server_task.await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                tracing::warn!(%error, "GUI host server stopped with error");
            }
            Err(error) => {
                tracing::warn!(%error, "GUI host server task failed");
            }
        }
    }
}

fn router_for_state<B>(state: Arc<GuiHostState<B>>) -> anyhow::Result<Router>
where
    B: GuiBackend + Clone,
{
    match &state.mode {
        GuiHostMode::Dev(config) => {
            let config = config.clone();
            Ok(Router::new()
                .route("/ws", get(crate::ws::ws_handler::<B>))
                .fallback(get(move |uri: Uri| {
                    let config = config.clone();
                    async move { assets::proxy_vite(config, uri).await }
                }))
                .with_state(state))
        }
        GuiHostMode::Prod(config) => {
            assets::prod_dist_dir(config)?;
            let root_config = config.clone();
            Ok(Router::new()
                .route(
                    "/",
                    get(move || {
                        let config = root_config.clone();
                        async move { assets::serve_prod_index(config).await }
                    }),
                )
                .route("/ws", get(crate::ws::ws_handler::<B>))
                .fallback_service(assets::prod_assets_service(config))
                .layer(middleware::map_response(assets::add_security_headers))
                .with_state(state))
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;
    use futures::SinkExt;
    use futures::StreamExt;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Error as TungsteniteError;
    use tokio_tungstenite::tungstenite::Message;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::protocol::CloseFrame;
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

    use crate::GuiHostConfig;
    use crate::GuiHostMode;
    use crate::ProdAssetConfig;
    use crate::host::GuiHost;
    use crate::test_support::NoopBackend;
    use crate::test_support::RecordingBackend;

    #[tokio::test]
    async fn binds_loopback_ephemeral_port() {
        let handle = GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Dev(crate::DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
            NoopBackend,
        )
        .await
        .expect("host should start");

        assert_eq!(handle.local_addr().ip(), std::net::Ipv4Addr::LOCALHOST);
        assert_ne!(handle.local_addr().port(), 0);

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn prod_root_serves_index_with_security_headers() {
        let package_root = tempfile::tempdir().expect("tempdir should be created");
        let dist_dir = package_root.path().join("dist");
        tokio::fs::create_dir(&dist_dir)
            .await
            .expect("dist dir should be created");
        tokio::fs::write(
            dist_dir.join("index.html"),
            "<html><body><h1>prod-static-test</h1></body></html>",
        )
        .await
        .expect("index should be written");
        let handle = GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Prod(ProdAssetConfig {
                    package_root: package_root.path().to_path_buf(),
                }),
            },
            NoopBackend,
        )
        .await
        .expect("host should start");

        let response = reqwest::get(format!("http://{}/", handle.local_addr()))
            .await
            .expect("root request should succeed");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get("x-frame-options")
                .expect("x-frame-options header should be present"),
            "DENY"
        );
        assert_eq!(
            response
                .headers()
                .get("content-security-policy")
                .expect("content-security-policy header should be present"),
            "frame-ancestors 'none'"
        );
        let body = response.text().await.expect("body should be readable");
        assert!(body.contains("<h1>prod-static-test</h1>"));

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn prod_static_index_serves_security_headers() {
        let package_root = tempfile::tempdir().expect("tempdir should be created");
        let dist_dir = package_root.path().join("dist");
        tokio::fs::create_dir(&dist_dir)
            .await
            .expect("dist dir should be created");
        tokio::fs::write(
            dist_dir.join("index.html"),
            "<html><body><h1>prod-static-test</h1></body></html>",
        )
        .await
        .expect("index should be written");
        let handle = GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Prod(ProdAssetConfig {
                    package_root: package_root.path().to_path_buf(),
                }),
            },
            NoopBackend,
        )
        .await
        .expect("host should start");

        let response = reqwest::get(format!("http://{}/index.html", handle.local_addr()))
            .await
            .expect("static request should succeed");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get("x-frame-options")
                .expect("x-frame-options header should be present"),
            "DENY"
        );
        assert_eq!(
            response
                .headers()
                .get("content-security-policy")
                .expect("content-security-policy header should be present"),
            "frame-ancestors 'none'"
        );

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_accepts_valid_authenticate_first_frame() {
        let handle = start_host(NoopBackend).await;
        let (mut websocket, _response) = connect_websocket(&handle).await;

        websocket
            .send(Message::Text(authenticate_request(&handle, 1).into()))
            .await
            .expect("auth frame should send");

        let message = websocket
            .next()
            .await
            .expect("auth response should arrive")
            .expect("auth response should be valid");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                &message.into_text().expect("auth response should be text"),
            )
            .expect("auth response should parse as JSON"),
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": {
                    "authenticated": true,
                },
            })
        );

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_disconnect_aborts_backend_connection() {
        let (backend, mut aborted_rx) = AbortSignalBackend::new();
        let handle = start_host(backend).await;
        let (mut websocket, _response) = connect_websocket(&handle).await;

        websocket
            .send(Message::Text(authenticate_request(&handle, 1).into()))
            .await
            .expect("auth frame should send");
        let _ = websocket.next().await.expect("auth response should arrive");
        websocket
            .close(None)
            .await
            .expect("websocket close frame should send");

        tokio::time::timeout(std::time::Duration::from_secs(1), aborted_rx.recv())
            .await
            .expect("backend should be aborted after browser disconnect")
            .expect("backend should send abort signal");

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_closes_1008_for_invalid_first_frame() {
        let handle = start_host(NoopBackend).await;
        let (mut websocket, _response) = connect_websocket(&handle).await;

        websocket
            .send(Message::Text("{\"jsonrpc\":\"2.0\",\"id\":1}".into()))
            .await
            .expect("invalid auth frame should send");

        let message = websocket
            .next()
            .await
            .expect("close frame should arrive")
            .expect("close frame should be valid");
        assert_eq!(
            message,
            Message::Close(Some(CloseFrame {
                code: CloseCode::Policy,
                reason: "".into(),
            }))
        );

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_closes_1008_when_authenticate_times_out() {
        let backend = RecordingBackend::new();
        let handle = start_host(backend.clone()).await;
        let (mut websocket, _response) = connect_websocket(&handle).await;

        let message = websocket
            .next()
            .await
            .expect("close frame should arrive")
            .expect("close frame should be valid");
        assert_eq!(
            message,
            Message::Close(Some(CloseFrame {
                code: CloseCode::Policy,
                reason: "".into(),
            }))
        );
        assert!(backend.received().is_empty());

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_returns_403_when_origin_is_missing() {
        let handle = start_host(NoopBackend).await;
        let url = format!("ws://{}/ws", handle.local_addr());
        let request = url.into_client_request().expect("request should build");

        assert_forbidden_connection(connect_async(request).await);

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_returns_403_when_host_does_not_match() {
        let handle = start_host(NoopBackend).await;
        let url = format!("ws://{}/ws", handle.local_addr());
        let mut request = url.into_client_request().expect("request should build");
        request.headers_mut().insert(
            "Host",
            format!("localhost:{}", handle.local_addr().port())
                .parse()
                .unwrap(),
        );
        request.headers_mut().insert(
            "Origin",
            format!("http://{}", handle.local_addr()).parse().unwrap(),
        );

        assert_forbidden_connection(connect_async(request).await);

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_returns_403_when_origin_does_not_match() {
        let handle = start_host(NoopBackend).await;
        let url = format!("ws://{}/ws", handle.local_addr());
        let mut request = url.into_client_request().expect("request should build");
        request
            .headers_mut()
            .insert("Origin", "http://localhost:5173".parse().unwrap());

        assert_forbidden_connection(connect_async(request).await);

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn browser_non_allowlisted_request_never_reaches_backend() {
        let backend = RecordingBackend::new();
        let handle = start_host(backend.clone()).await;
        let (mut websocket, _response) = connect_websocket(&handle).await;

        websocket
            .send(Message::Text(authenticate_request(&handle, 1).into()))
            .await
            .expect("auth frame should send");
        let _ = websocket.next().await.expect("auth response should arrive");

        websocket
            .send(Message::Text(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "thread/list",
                    "params": {},
                })
                .to_string()
                .into(),
            ))
            .await
            .expect("rejected frame should send");
        let message = websocket
            .next()
            .await
            .expect("method not found response should arrive")
            .expect("method not found response should be valid");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                &message.into_text().expect("error response should be text"),
            )
            .expect("error response should parse as JSON"),
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 2,
                "error": {
                    "code": -32601,
                    "message": "Method not found",
                },
            })
        );
        websocket
            .send(Message::Text(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "initialize",
                    "params": {},
                })
                .to_string()
                .into(),
            ))
            .await
            .expect("allowed frame should send");
        assert_eq!(
            backend.wait_for_received(&["initialize"]).await,
            vec!["initialize"]
        );

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn websocket_drops_disallowed_client_notification_without_closing() {
        let backend = RecordingBackend::new();
        let handle = start_host(backend.clone()).await;
        let (mut websocket, _response) = connect_websocket(&handle).await;

        websocket
            .send(Message::Text(authenticate_request(&handle, 1).into()))
            .await
            .expect("auth frame should send");
        let _ = websocket.next().await.expect("auth response should arrive");

        websocket
            .send(Message::Text(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "method": "initialized",
                    "params": {},
                })
                .to_string()
                .into(),
            ))
            .await
            .expect("rejected notification should send");
        websocket
            .send(Message::Text(
                serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "initialize",
                    "params": {},
                })
                .to_string()
                .into(),
            ))
            .await
            .expect("allowed frame should send");
        assert_eq!(
            backend.wait_for_received(&["initialize"]).await,
            vec!["initialize"]
        );

        handle.shutdown().await;
    }

    #[tokio::test]
    async fn two_browser_tabs_can_reuse_the_same_launch_token() {
        let backend = RecordingBackend::new();
        let handle = start_host(backend.clone()).await;

        for id in [1, 2] {
            let (mut websocket, _response) = connect_websocket(&handle).await;
            websocket
                .send(Message::Text(authenticate_request(&handle, id).into()))
                .await
                .expect("auth frame should send");
            let message = websocket
                .next()
                .await
                .expect("auth response should arrive")
                .expect("auth response should be valid");
            assert!(message.is_text());
        }

        handle.shutdown().await;
    }

    async fn start_host<B>(backend: B) -> crate::host::GuiHostHandle
    where
        B: crate::GuiBackend + Clone,
    {
        GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Dev(crate::DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
            backend,
        )
        .await
        .expect("host should start")
    }

    async fn connect_websocket(
        handle: &crate::host::GuiHostHandle,
    ) -> (
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        tokio_tungstenite::tungstenite::handshake::client::Response,
    ) {
        let url = format!("ws://{}/ws", handle.local_addr());
        let mut request = url.into_client_request().expect("request should build");
        request.headers_mut().insert(
            "Origin",
            format!("http://{}", handle.local_addr()).parse().unwrap(),
        );
        connect_async(request)
            .await
            .expect("websocket should connect")
    }

    fn assert_forbidden_connection(
        result: Result<
            (
                tokio_tungstenite::WebSocketStream<
                    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
                >,
                tokio_tungstenite::tungstenite::handshake::client::Response,
            ),
            TungsteniteError,
        >,
    ) {
        match result {
            Err(TungsteniteError::Http(response)) => {
                assert_eq!(response.status(), StatusCode::FORBIDDEN);
            }
            Ok(_) => panic!("websocket should not connect"),
            Err(error) => panic!("expected HTTP 403 error, got {error:?}"),
        }
    }

    fn authenticate_request(handle: &crate::host::GuiHostHandle, id: i64) -> String {
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "gui/authenticate",
            "params": {
                "token": handle.launch_token().as_str(),
            },
        })
        .to_string()
    }

    #[derive(Clone)]
    struct AbortSignalBackend {
        aborted_tx: tokio::sync::mpsc::UnboundedSender<()>,
    }

    impl AbortSignalBackend {
        fn new() -> (Self, tokio::sync::mpsc::UnboundedReceiver<()>) {
            let (aborted_tx, aborted_rx) = tokio::sync::mpsc::unbounded_channel();
            (Self { aborted_tx }, aborted_rx)
        }
    }

    impl crate::GuiBackend for AbortSignalBackend {
        async fn connect(
            &self,
            _connection: crate::AuthenticatedGuiConnection,
        ) -> anyhow::Result<()> {
            let _guard = AbortSignal {
                aborted_tx: self.aborted_tx.clone(),
            };
            std::future::pending::<()>().await;
            Ok(())
        }
    }

    struct AbortSignal {
        aborted_tx: tokio::sync::mpsc::UnboundedSender<()>,
    }

    impl Drop for AbortSignal {
        fn drop(&mut self) {
            let _ = self.aborted_tx.send(());
        }
    }
}
