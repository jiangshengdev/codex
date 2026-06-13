use std::io;
use std::sync::Arc;

use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiHostMode;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;
use tokio::sync::Notify;

use crate::gui_transport::GuiTransportBackend;
use crate::in_process::InProcessClientSender;

pub struct GuiHostManager {
    sender: InProcessClientSender,
    config: GuiHostConfig,
    handle: Mutex<Option<GuiHostHandle>>,
}

impl GuiHostManager {
    pub fn new(sender: InProcessClientSender, config: GuiHostConfig) -> Self {
        Self {
            sender,
            config,
            handle: Mutex::new(None),
        }
    }

    pub async fn launch_urls_for_thread(&self, thread_id: ThreadId) -> io::Result<GuiLaunchUrls> {
        if let Some(urls) = {
            let guard = self.handle.lock().await;
            guard
                .as_ref()
                .map(|handle| handle.launch_urls_for_thread(thread_id))
        } {
            return Ok(urls);
        }

        let backend = GuiTransportBackend::new(self.sender.clone());
        let new_handle = GuiHost::start(self.config.clone(), backend).await?;
        let (urls, redundant_handle) = {
            let mut guard = self.handle.lock().await;
            match guard.as_ref() {
                Some(handle) => (handle.launch_urls_for_thread(thread_id), Some(new_handle)),
                None => {
                    let urls = new_handle.launch_urls_for_thread(thread_id);
                    *guard = Some(new_handle);
                    (urls, None)
                }
            }
        };

        if let Some(handle) = redundant_handle {
            handle.shutdown().await;
        }

        Ok(urls)
    }

    pub async fn shutdown(&self) {
        let handle = self.handle.lock().await.take();
        if let Some(handle) = handle {
            handle.shutdown().await;
        }
    }
}

impl Drop for GuiHostManager {
    fn drop(&mut self) {
        if let Ok(mut handle) = self.handle.try_lock()
            && let Some(handle) = handle.take()
        {
            handle.cancel_token().cancel();
        }
    }
}

pub struct SharedGuiHostLauncher {
    sender: InProcessClientSender,
    config: Result<GuiHostConfig, String>,
    state: Mutex<SharedGuiHostState>,
    launches_drained: Notify,
}

#[derive(Default)]
struct SharedGuiHostState {
    manager: Option<Arc<GuiHostManager>>,
    active_launches: usize,
    shutdown: bool,
}

impl SharedGuiHostLauncher {
    pub fn new(sender: InProcessClientSender, config: GuiHostConfig) -> Self {
        Self {
            sender,
            config: Ok(config),
            state: Mutex::new(SharedGuiHostState::default()),
            launches_drained: Notify::new(),
        }
    }

    pub fn default_for_profile(sender: InProcessClientSender) -> Self {
        let config = GuiHostMode::default_for_profile()
            .map(|mode| GuiHostConfig { mode })
            .map_err(|error| error.to_string());
        Self {
            sender,
            config,
            state: Mutex::new(SharedGuiHostState::default()),
            launches_drained: Notify::new(),
        }
    }

    pub async fn launch_urls_for_thread(&self, thread_id: ThreadId) -> io::Result<GuiLaunchUrls> {
        let manager = {
            let mut state = self.state.lock().await;
            if state.shutdown {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    "GUI host launcher is shut down",
                ));
            }

            let manager = match state.manager.as_ref() {
                Some(manager) => Arc::clone(manager),
                None => {
                    let config = self.config.as_ref().map_err(|message| {
                        io::Error::new(
                            io::ErrorKind::InvalidInput,
                            format!("GUI host config error: {message}"),
                        )
                    })?;
                    let manager =
                        Arc::new(GuiHostManager::new(self.sender.clone(), config.clone()));
                    state.manager = Some(Arc::clone(&manager));
                    manager
                }
            };
            state.active_launches += 1;
            manager
        };

        let result = manager.launch_urls_for_thread(thread_id).await;
        let should_notify = {
            let mut state = self.state.lock().await;
            state.active_launches = state
                .active_launches
                .checked_sub(1)
                .expect("active launch count should not underflow");
            state.shutdown && state.active_launches == 0
        };
        if should_notify {
            self.launches_drained.notify_waiters();
        }
        result
    }

    pub async fn shutdown(&self) {
        let manager = loop {
            let notified = self.launches_drained.notified();
            tokio::pin!(notified);
            let mut state = self.state.lock().await;
            state.shutdown = true;
            if state.active_launches == 0 {
                break state.manager.take();
            }

            notified.as_mut().enable();
            drop(state);
            notified.await;
        };

        if let Some(manager) = manager {
            manager.shutdown().await;
        }
    }
}

impl codex_gui_extension::GuiLauncher for SharedGuiHostLauncher {
    fn launch_gui_for_thread(
        &self,
        thread_id: ThreadId,
    ) -> codex_gui_extension::GuiLaunchFuture<'_> {
        Box::pin(async move {
            self.launch_urls_for_thread(thread_id)
                .await
                .map_err(|error| error.to_string())
        })
    }
}

#[cfg(test)]
mod tests {
    use codex_gui_host::DevAssetProxyConfig;
    use codex_gui_host::GuiHostConfig;
    use codex_gui_host::GuiHostMode;
    use codex_protocol::ThreadId;
    use pretty_assertions::assert_eq;

    use super::*;

    #[tokio::test]
    async fn launch_url_reuses_same_host_for_manager_lifetime() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let manager = GuiHostManager::new(
            client.sender(),
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
        );
        let thread_a =
            ThreadId::from_string("00000000-0000-0000-0000-0000000000a1").expect("valid thread id");
        let thread_b =
            ThreadId::from_string("00000000-0000-0000-0000-0000000000b2").expect("valid thread id");
        let urls_a = manager
            .launch_urls_for_thread(thread_a)
            .await
            .expect("first launch URLs should be created");
        let urls_b = manager
            .launch_urls_for_thread(thread_b)
            .await
            .expect("second launch URLs should reuse host");
        let origin_a = urls_a.entries[0]
            .url
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        let origin_b = urls_b.entries[0]
            .url
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        assert_eq!(origin_a, origin_b);
        assert_eq!(
            urls_a.entries[0].kind,
            codex_gui_host::GuiLaunchUrlKind::Local
        );
        assert!(
            urls_a.entries[0]
                .url
                .as_str()
                .contains("threadId=00000000-0000-0000-0000-0000000000a1")
        );
        assert!(
            urls_b.entries[0]
                .url
                .as_str()
                .contains("threadId=00000000-0000-0000-0000-0000000000b2")
        );
        manager.shutdown().await;
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }

    #[tokio::test]
    async fn shared_launcher_reuses_same_host_for_manager_lifetime() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let launcher = SharedGuiHostLauncher::new(
            client.sender(),
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
        );
        let thread_a =
            ThreadId::from_string("00000000-0000-0000-0000-0000000004a1").expect("valid thread id");
        let thread_b =
            ThreadId::from_string("00000000-0000-0000-0000-0000000004b2").expect("valid thread id");

        let urls_a = launcher
            .launch_urls_for_thread(thread_a)
            .await
            .expect("first launch URLs should be created");
        let urls_b = launcher
            .launch_urls_for_thread(thread_b)
            .await
            .expect("second launch URLs should reuse host");

        let origin_a = urls_a.entries[0]
            .url
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        let origin_b = urls_b.entries[0]
            .url
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        assert_eq!(origin_a, origin_b);
        launcher.shutdown().await;
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }

    #[tokio::test]
    async fn shared_launcher_rejects_launch_after_shutdown_without_starting_host() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let launcher = SharedGuiHostLauncher::new(
            client.sender(),
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
        );
        let thread_id =
            ThreadId::from_string("00000000-0000-0000-0000-0000000004c3").expect("valid thread id");

        launcher.shutdown().await;

        let error = launcher
            .launch_urls_for_thread(thread_id)
            .await
            .expect_err("launch after shutdown should fail");

        assert_eq!(error.kind(), io::ErrorKind::BrokenPipe);
        assert_eq!(error.to_string(), "GUI host launcher is shut down");
        assert!(launcher.state.lock().await.manager.is_none());
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }

    #[tokio::test]
    async fn shared_launcher_reports_config_error_at_launch_time() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let launcher = SharedGuiHostLauncher {
            sender: client.sender(),
            config: Err("bad config".to_string()),
            state: Mutex::new(SharedGuiHostState::default()),
            launches_drained: Notify::new(),
        };
        let thread_id =
            ThreadId::from_string("00000000-0000-0000-0000-0000000004d4").expect("valid thread id");

        let error = launcher
            .launch_urls_for_thread(thread_id)
            .await
            .expect_err("config error should surface during launch");

        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert_eq!(error.to_string(), "GUI host config error: bad config");
        assert!(launcher.state.lock().await.manager.is_none());
        launcher.shutdown().await;
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }
}
