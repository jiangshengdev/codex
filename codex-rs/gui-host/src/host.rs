use std::fmt::Display;
use std::io;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::Uri;
use axum::response::IntoResponse;
use axum::response::Response;
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

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
        let server_task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await
        });

        Ok(GuiHostHandle {
            local_addr,
            launch_token,
            shutdown_tx,
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
    let _ = (&state.local_addr, &state.launch_token, &state.backend);

    match &state.mode {
        GuiHostMode::Dev(config) => {
            let _ = config;
            Ok(Router::new()
                .fallback(get(dev_fallback::<B>))
                .with_state(state))
        }
        GuiHostMode::Prod(config) => {
            assets::prod_dist_dir(&config)?;
            Ok(Router::new()
                .route("/", get(prod_root::<B>))
                .fallback_service(assets::prod_assets_service(&config))
                .with_state(state))
        }
    }
}

async fn dev_fallback<B>(State(state): State<Arc<GuiHostState<B>>>, uri: Uri) -> Response
where
    B: GuiBackend + Clone,
{
    match &state.mode {
        GuiHostMode::Dev(config) => assets::proxy_vite(config.clone(), uri).await,
        GuiHostMode::Prod(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn prod_root<B>(State(state): State<Arc<GuiHostState<B>>>) -> Response
where
    B: GuiBackend + Clone,
{
    match &state.mode {
        GuiHostMode::Dev(_) => StatusCode::NOT_FOUND.into_response(),
        GuiHostMode::Prod(config) => assets::serve_prod_index(config.clone()).await,
    }
}

#[cfg(test)]
mod tests {
    use crate::GuiHostConfig;
    use crate::GuiHostMode;
    use crate::host::GuiHost;
    use crate::test_support::NoopBackend;

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
}
