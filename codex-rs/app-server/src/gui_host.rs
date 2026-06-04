use std::io;

use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;

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

    pub async fn launch_url_for_thread(&self, thread_id: ThreadId) -> io::Result<String> {
        if let Some(url) = {
            let guard = self.handle.lock().await;
            guard
                .as_ref()
                .map(|handle| handle.launch_url_for_thread(thread_id))
        } {
            return Ok(url);
        }

        let backend = GuiTransportBackend::new(self.sender.clone());
        let new_handle = GuiHost::start(self.config.clone(), backend).await?;
        let (url, redundant_handle) = {
            let mut guard = self.handle.lock().await;
            match guard.as_ref() {
                Some(handle) => (handle.launch_url_for_thread(thread_id), Some(new_handle)),
                None => {
                    let url = new_handle.launch_url_for_thread(thread_id);
                    *guard = Some(new_handle);
                    (url, None)
                }
            }
        };

        if let Some(handle) = redundant_handle {
            handle.shutdown().await;
        }

        Ok(url)
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
        let url_a = manager
            .launch_url_for_thread(thread_a)
            .await
            .expect("first launch URL should be created");
        let url_b = manager
            .launch_url_for_thread(thread_b)
            .await
            .expect("second launch URL should reuse host");
        let origin_a = url_a
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        let origin_b = url_b
            .as_str()
            .split("/?")
            .next()
            .expect("URL should contain query");
        assert_eq!(origin_a, origin_b);
        assert!(
            url_a
                .as_str()
                .contains("threadId=00000000-0000-0000-0000-0000000000a1")
        );
        assert!(
            url_b
                .as_str()
                .contains("threadId=00000000-0000-0000-0000-0000000000b2")
        );
        manager.shutdown().await;
        client
            .shutdown()
            .await
            .expect("in-process runtime should shutdown cleanly");
    }
}
