use super::*;
use crate::gui_launch_service::AppServerGuiLaunchService;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiHostMode;
use pretty_assertions::assert_eq;
use tokio::sync::Notify;

#[derive(Default)]
pub(super) struct StartPause {
    pub(super) started: Notify,
    pub(super) release: Notify,
    pub(super) address: Mutex<Option<std::net::SocketAddr>>,
}

#[tokio::test]
async fn shutdown_waits_for_inflight_gui_launch_cleanup() {
    let bridge = crate::gui_connection_bridge::test_support::start_local_bridge_for_test().await;
    let pause = Arc::new(StartPause::default());
    let mut manager = GuiHostManager::new_with_opener(
        bridge.opener(),
        GuiHostConfig {
            port: 0,
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
    );
    manager.start_pause = Some(Arc::clone(&pause));
    let service = Arc::new(AppServerGuiLaunchService::new(manager));
    let launching = {
        let service = Arc::clone(&service);
        tokio::spawn(async move { service.launch_urls_for_thread(ThreadId::new()).await })
    };
    pause.started.notified().await;
    let port = pause.address.lock().unwrap().expect("bound host").port();
    let endpoint = (std::net::Ipv4Addr::LOCALHOST, port);
    tokio::net::TcpStream::connect(endpoint)
        .await
        .expect("host is listening");
    let shutdown = service.shutdown();
    tokio::pin!(shutdown);
    let waiting_for_cleanup = futures::poll!(&mut shutdown).is_pending();
    pause.release.notify_one();
    let result = launching.await.expect("launch task should finish");
    if waiting_for_cleanup {
        shutdown.await;
    }
    bridge.shutdown().await;
    assert!(tokio::net::TcpStream::connect(endpoint).await.is_err());
    assert!(
        result.is_err(),
        "closed service must not publish launch URLs"
    );
    assert!(
        waiting_for_cleanup,
        "shutdown must await the in-flight host cleanup"
    );
}

#[tokio::test]
async fn concurrent_gui_launches_share_a_live_host_and_preserve_tasks() {
    let bridge = crate::gui_connection_bridge::test_support::start_local_bridge_for_test().await;
    let pause = Arc::new(StartPause::default());
    let mut manager = GuiHostManager::new_with_opener(
        bridge.opener(),
        GuiHostConfig {
            port: 0,
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
    );
    manager.start_pause = Some(Arc::clone(&pause));
    let service = Arc::new(AppServerGuiLaunchService::new(manager));
    let first = ThreadId::new();
    let second = ThreadId::new();
    let launching = {
        let service = Arc::clone(&service);
        tokio::spawn(async move { service.launch_urls_for_thread(first).await })
    };
    pause.started.notified().await;
    let first_port = pause
        .address
        .lock()
        .unwrap()
        .expect("first bound host")
        .port();
    let second_launch = service.launch_urls_for_thread(second);
    tokio::pin!(second_launch);
    assert!(futures::poll!(&mut second_launch).is_pending());
    pause.release.notify_waiters();
    let second_urls = second_launch.await.unwrap();
    let first_urls = launching.await.unwrap().unwrap();
    let first_url = url::Url::parse(&first_urls.entries[0].url).unwrap();
    let second_url = url::Url::parse(&second_urls.entries[0].url).unwrap();
    assert_eq!(first_url.port_or_known_default(), Some(first_port));
    assert_eq!(first_url.origin(), second_url.origin());
    assert_eq!(first_url.fragment(), second_url.fragment());
    assert_eq!(first_url.path(), format!("/task/{first}"));
    assert_eq!(second_url.path(), format!("/task/{second}"));
    tokio::net::TcpStream::connect((
        std::net::Ipv4Addr::LOCALHOST,
        first_url.port_or_known_default().unwrap(),
    ))
    .await
    .expect("returned host must be listening");
    service.shutdown().await;
    bridge.shutdown().await;
}
