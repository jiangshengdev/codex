use std::io;
use std::sync::Arc;

use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;
use tokio::sync::Mutex;

use crate::gui_connection_bridge::ExtraConnectionLocalGuiOpener;
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

        let backend = GuiTransportBackend::new(Arc::new(ExtraConnectionLocalGuiOpener::new(
            self.sender.extra_connection_sender(),
        )));
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
}
