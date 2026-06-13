use std::io;
use std::sync::Arc;
use std::sync::Mutex;

use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;

use crate::gui_connection_bridge::ExtraConnectionLocalGuiOpener;
use crate::gui_connection_bridge::LocalGuiConnectionOpener;
use crate::gui_transport::GuiTransportBackend;
use crate::in_process::InProcessClientSender;

pub struct GuiHostManager {
    opener: Arc<dyn LocalGuiConnectionOpener>,
    config: GuiHostConfig,
    state: Mutex<GuiHostState>,
}

#[derive(Default)]
struct GuiHostState {
    handle: Option<GuiHostHandle>,
    closed: bool,
}

impl GuiHostManager {
    pub fn new(sender: InProcessClientSender, config: GuiHostConfig) -> Self {
        Self::new_with_opener(
            Arc::new(ExtraConnectionLocalGuiOpener::new(
                sender.extra_connection_sender(),
            )),
            config,
        )
    }

    pub(crate) fn new_with_opener(
        opener: Arc<dyn LocalGuiConnectionOpener>,
        config: GuiHostConfig,
    ) -> Self {
        Self {
            opener,
            config,
            state: Mutex::new(GuiHostState::default()),
        }
    }

    pub async fn launch_urls_for_thread(&self, thread_id: ThreadId) -> io::Result<GuiLaunchUrls> {
        if let Some(urls) = {
            let state = self.state.lock().map_err(state_lock_error)?;
            if state.closed {
                return Err(closed_error());
            }
            state
                .handle
                .as_ref()
                .map(|handle| handle.launch_urls_for_thread(thread_id))
        } {
            return Ok(urls);
        }

        let backend = GuiTransportBackend::new(Arc::clone(&self.opener));
        let new_handle = GuiHost::start(self.config.clone(), backend).await?;
        let (urls, redundant_handle) = {
            let mut state = self.state.lock().map_err(state_lock_error)?;
            if state.closed {
                (Err(closed_error()), Some(new_handle))
            } else {
                match state.handle.as_ref() {
                    Some(handle) => (
                        Ok(handle.launch_urls_for_thread(thread_id)),
                        Some(new_handle),
                    ),
                    None => {
                        let urls = new_handle.launch_urls_for_thread(thread_id);
                        state.handle = Some(new_handle);
                        (Ok(urls), None)
                    }
                }
            }
        };

        if let Some(handle) = redundant_handle {
            handle.shutdown().await;
        }

        urls
    }

    pub async fn shutdown(&self) {
        let handle = match self.state.lock() {
            Ok(mut state) => {
                state.closed = true;
                state.handle.take()
            }
            Err(_) => None,
        };
        if let Some(handle) = handle {
            handle.shutdown().await;
        }
    }

    pub(crate) fn cancel(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.closed = true;
            if let Some(handle) = state.handle.take() {
                handle.cancel_token().cancel();
            }
        }
    }

    #[cfg(test)]
    pub(crate) async fn has_active_host_for_test(&self) -> bool {
        self.state
            .lock()
            .map(|state| state.handle.is_some())
            .unwrap_or(false)
    }
}

impl Drop for GuiHostManager {
    fn drop(&mut self) {
        self.cancel();
    }
}

fn closed_error() -> io::Error {
    io::Error::new(io::ErrorKind::BrokenPipe, "GUI host manager is closed")
}

fn state_lock_error<T>(_: std::sync::PoisonError<T>) -> io::Error {
    io::Error::other("GUI host manager state is poisoned")
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
    async fn cancel_prevents_future_launches() {
        let client = crate::in_process::tests::start_test_client_for_bridge().await;
        let manager = GuiHostManager::new(
            client.sender(),
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: "http://127.0.0.1:5173".to_string(),
                }),
            },
        );
        let thread_id = ThreadId::default();

        manager.cancel();
        let result = manager.launch_urls_for_thread(thread_id).await;

        if result.is_ok() {
            manager.shutdown().await;
            client
                .shutdown()
                .await
                .expect("in-process runtime should shutdown cleanly");
            panic!("launch should fail after manager is canceled");
        }
        let error = result.expect_err("launch should fail after manager is canceled");
        assert_eq!(error.kind(), std::io::ErrorKind::BrokenPipe);
        assert_eq!(error.to_string(), "GUI host manager is closed");
        assert!(!manager.has_active_host_for_test().await);
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }
}
