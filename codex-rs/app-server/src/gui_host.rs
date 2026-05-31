//! GUI host lifecycle owned by the app-server runtime.

use std::sync::Arc;
use std::sync::OnceLock;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

use anyhow::Context;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiHostMode;
use tokio::sync::Mutex as AsyncMutex;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

use crate::gui_transport::GuiTransportBackend;
use crate::in_process::InProcessClientSender;

pub struct GuiHostManager {
    inner: AsyncMutex<GuiHostInner>,
    host_cancel: OnceLock<CancellationToken>,
    stopped: AtomicBool,
    cancel_token: CancellationToken,
    sender: InProcessClientSender,
}

struct GuiHostInner {
    state: GuiHostState,
    next_start_id: u64,
}

enum GuiHostState {
    Empty,
    Starting {
        start_id: u64,
        completed: watch::Receiver<()>,
    },
    Ready(GuiHostHandle),
}

enum LaunchAction {
    Start {
        completed: watch::Sender<()>,
    },
    Wait {
        start_id: u64,
        completed: watch::Receiver<()>,
    },
}

impl GuiHostManager {
    pub fn new(sender: InProcessClientSender) -> Self {
        Self {
            inner: AsyncMutex::new(GuiHostInner {
                state: GuiHostState::Empty,
                next_start_id: 0,
            }),
            host_cancel: OnceLock::new(),
            stopped: AtomicBool::new(false),
            cancel_token: CancellationToken::new(),
            sender,
        }
    }

    pub fn cancel_nonblocking(&self) {
        if self.stopped.swap(true, Ordering::AcqRel) {
            return;
        }
        self.cancel_token.cancel();
        if let Some(host_cancel) = self.host_cancel.get() {
            host_cancel.cancel();
        }
    }

    pub async fn launch_url_for_thread(
        self: &Arc<Self>,
        primary_thread_id: &str,
    ) -> anyhow::Result<String> {
        loop {
            if self.stopped.load(Ordering::Acquire) {
                anyhow::bail!("GUI host manager is stopped");
            }

            let action = {
                let mut inner = self.inner.lock().await;
                if self.stopped.load(Ordering::Acquire) {
                    anyhow::bail!("GUI host manager is stopped");
                }

                match &mut inner.state {
                    GuiHostState::Empty => {
                        let start_id = inner.next_start_id;
                        inner.next_start_id = inner.next_start_id.wrapping_add(1);
                        let (completed_tx, completed_rx) = watch::channel(());
                        inner.state = GuiHostState::Starting {
                            start_id,
                            completed: completed_rx,
                        };
                        LaunchAction::Start {
                            completed: completed_tx,
                        }
                    }
                    GuiHostState::Starting {
                        start_id,
                        completed,
                    } => LaunchAction::Wait {
                        start_id: *start_id,
                        completed: completed.clone(),
                    },
                    GuiHostState::Ready(handle) => {
                        return Ok(handle.launch_url_for_thread(primary_thread_id));
                    }
                }
            };

            match action {
                LaunchAction::Wait {
                    start_id,
                    mut completed,
                } => {
                    if completed.changed().await.is_err() {
                        let mut inner = self.inner.lock().await;
                        if matches!(
                            &inner.state,
                            GuiHostState::Starting {
                                start_id: active_start_id,
                                ..
                            } if *active_start_id == start_id
                        ) {
                            inner.state = GuiHostState::Empty;
                        }
                    }
                }
                LaunchAction::Start { completed } => {
                    let mode =
                        GuiHostMode::default_for_profile().context("resolve GUI host mode")?;
                    let backend = GuiTransportBackend::new(
                        self.sender.clone(),
                        self.cancel_token.child_token(),
                    );
                    let start_result = GuiHost::start(GuiHostConfig { mode }, backend)
                        .await
                        .context("start GUI host");

                    let handle = match start_result {
                        Ok(handle) => handle,
                        Err(error) => {
                            let mut inner = self.inner.lock().await;
                            inner.state = GuiHostState::Empty;
                            let _ = completed.send(());
                            return Err(error);
                        }
                    };

                    if self.stopped.load(Ordering::Acquire) {
                        handle.cancel_token().cancel();
                        let mut inner = self.inner.lock().await;
                        inner.state = GuiHostState::Empty;
                        let _ = completed.send(());
                        drop(handle);
                        anyhow::bail!("GUI host manager is stopped");
                    }

                    let url = handle.launch_url_for_thread(primary_thread_id);
                    let _ = self.host_cancel.set(handle.cancel_token());
                    let mut inner = self.inner.lock().await;
                    if self.stopped.load(Ordering::Acquire) {
                        handle.cancel_token().cancel();
                        inner.state = GuiHostState::Empty;
                        let _ = completed.send(());
                        drop(handle);
                        anyhow::bail!("GUI host manager is stopped");
                    }
                    inner.state = GuiHostState::Ready(handle);
                    let _ = completed.send(());
                    return Ok(url);
                }
            }
        }
    }

    pub async fn shutdown(self: Arc<Self>) {
        self.cancel_nonblocking();
        loop {
            let mut starting = None;
            let mut ready = None;
            let mut start_id = None;
            {
                let mut inner = self.inner.lock().await;
                match &mut inner.state {
                    GuiHostState::Empty => {
                        return;
                    }
                    GuiHostState::Starting {
                        start_id: active_start_id,
                        completed,
                    } => {
                        start_id = Some(*active_start_id);
                        starting = Some(completed.clone());
                    }
                    GuiHostState::Ready(_) => {
                        if let GuiHostState::Ready(handle) =
                            std::mem::replace(&mut inner.state, GuiHostState::Empty)
                        {
                            ready = Some(handle);
                        }
                    }
                }
            }

            if let Some(handle) = ready {
                handle.shutdown().await;
                return;
            }

            if let Some(mut completed) = starting
                && completed.changed().await.is_err()
            {
                let mut inner = self.inner.lock().await;
                if matches!(
                    (start_id, &inner.state),
                    (
                        Some(wait_start_id),
                        GuiHostState::Starting {
                            start_id: active_start_id,
                            ..
                        }
                    ) if wait_start_id == *active_start_id
                ) {
                    inner.state = GuiHostState::Empty;
                }
            }
        }
    }
}

impl Drop for GuiHostManager {
    fn drop(&mut self) {
        self.cancel_nonblocking();
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::Arc;

    use codex_app_server_protocol::ClientInfo;
    use codex_app_server_protocol::InitializeParams;
    use codex_arg0::Arg0DispatchPaths;
    use codex_config::CloudRequirementsLoader;
    use codex_config::LoaderOverrides;
    use codex_core::config::Config;
    use codex_core::config::ConfigBuilder;
    use codex_exec_server::EnvironmentManager;
    use codex_feedback::CodexFeedback;
    use codex_protocol::protocol::SessionSource;
    use pretty_assertions::assert_eq;
    use tempfile::TempDir;
    use url::Url;

    use super::*;
    use crate::in_process;
    use crate::in_process::DEFAULT_IN_PROCESS_CHANNEL_CAPACITY;
    use crate::in_process::InProcessClientHandle;
    use crate::in_process::InProcessStartArgs;

    #[tokio::test]
    async fn launch_url_for_thread_reuses_single_host_and_token() {
        let TestRuntime {
            client,
            _codex_home,
        } = start_test_runtime(SessionSource::Cli).await;
        let manager = Arc::new(GuiHostManager::new(client.sender()));

        let url_a = match manager.launch_url_for_thread("thread-a").await {
            Ok(url) => url,
            Err(error) => panic!("url a: {error}"),
        };
        let url_b = match manager.launch_url_for_thread("thread-b").await {
            Ok(url) => url,
            Err(error) => panic!("url b: {error}"),
        };

        let parsed_a = match Url::parse(&url_a) {
            Ok(url) => url,
            Err(error) => panic!("url a should parse: {error}"),
        };
        let parsed_b = match Url::parse(&url_b) {
            Ok(url) => url,
            Err(error) => panic!("url b should parse: {error}"),
        };
        assert_eq!(parsed_a.scheme(), "http");
        assert_eq!(parsed_a.host_str(), Some("127.0.0.1"));
        assert_eq!(parsed_a.port(), parsed_b.port());
        assert_eq!(parsed_a.fragment(), parsed_b.fragment());
        assert_eq!(
            parsed_a.query_pairs().find(|(key, _)| key == "threadId"),
            Some(("threadId".into(), "thread-a".into()))
        );
        assert_eq!(
            parsed_b.query_pairs().find(|(key, _)| key == "threadId"),
            Some(("threadId".into(), "thread-b".into()))
        );

        manager.shutdown().await;
        match client.shutdown().await {
            Ok(()) => {}
            Err(error) => panic!("runtime shutdown: {error}"),
        }
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
            Err(_) => match Config::load_default_with_cli_overrides_for_codex_home(
                codex_home.to_path_buf(),
                Vec::new(),
            )
            .await
            {
                Ok(config) => config,
                Err(error) => panic!("default config should load: {error}"),
            },
        }
    }

    async fn start_test_runtime(session_source: SessionSource) -> TestRuntime {
        let codex_home = match TempDir::new() {
            Ok(codex_home) => codex_home,
            Err(error) => panic!("temp dir: {error}"),
        };
        let config = Arc::new(build_test_config(codex_home.path()).await);
        let state_db = match codex_rollout::state_db::try_init(config.as_ref()).await {
            Ok(state_db) => state_db,
            Err(error) => panic!("state db should initialize for GUI host test: {error}"),
        };
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
                    name: "gui-host-test".to_string(),
                    title: None,
                    version: "0.0.0".to_string(),
                },
                capabilities: None,
            },
            channel_capacity: DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
        };
        let client = match in_process::start(args).await {
            Ok(client) => client,
            Err(error) => panic!("in-process runtime should start: {error}"),
        };
        TestRuntime {
            client,
            _codex_home: codex_home,
        }
    }
}
