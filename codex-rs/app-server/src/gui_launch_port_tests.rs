use std::net::Ipv4Addr;

use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_protocol::ThreadId;
use pretty_assertions::assert_eq;
use tokio::net::TcpListener;

use super::AppServerGuiLaunchService;
use crate::gui_host::GuiHostManager;

#[tokio::test]
async fn occupied_port_falls_back_and_restart_reclaims_preferred_port() {
    let occupied = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).await.unwrap();
    let preferred_port = occupied.local_addr().unwrap().port();
    let bridge = crate::gui_connection_bridge::test_support::start_local_bridge_for_test().await;
    let config = GuiHostConfig {
        port: preferred_port,
        mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
    };
    let manager = GuiHostManager::new_with_opener(bridge.opener(), config.clone());
    let fallback = AppServerGuiLaunchService::new(manager);
    let task = ThreadId::new();
    let urls = fallback.launch_urls_for_thread(task).await.unwrap();
    let fallback_url = url::Url::parse(&urls.entries[0].url).unwrap();
    let fallback_port = fallback_url.port_or_known_default().unwrap();
    assert_ne!(fallback_port, preferred_port);
    assert_ne!(fallback_port, 0);
    for entry in &urls.entries {
        let entry = url::Url::parse(&entry.url).unwrap();
        assert_eq!(entry.port_or_known_default(), Some(fallback_port));
        assert_eq!(entry.path(), format!("/task/{task}"));
        assert_eq!(entry.fragment(), fallback_url.fragment());
    }
    tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, preferred_port))
        .await
        .expect("existing service remains available");
    drop(occupied);
    assert_eq!(fallback.launch_urls_for_thread(task).await.unwrap(), urls);

    let manager = GuiHostManager::new_with_opener(bridge.opener(), config.clone());
    let preferred = AppServerGuiLaunchService::new(manager);
    let preferred_urls = preferred
        .launch_urls_for_thread(ThreadId::new())
        .await
        .unwrap();
    let preferred_url = url::Url::parse(&preferred_urls.entries[0].url).unwrap();
    assert_eq!(preferred_url.port_or_known_default(), Some(preferred_port));
    assert_ne!(preferred_url.fragment(), fallback_url.fragment());

    let manager = GuiHostManager::new_with_opener(bridge.opener(), config.clone());
    let third = AppServerGuiLaunchService::new(manager);
    let third_urls = third.launch_urls_for_thread(ThreadId::new()).await.unwrap();
    let third_url = url::Url::parse(&third_urls.entries[0].url).unwrap();
    let third_port = third_url.port_or_known_default().unwrap();
    assert_ne!(third_port, preferred_port);
    assert_ne!(third_port, fallback_port);
    for port in [preferred_port, fallback_port, third_port] {
        tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .expect("all three GUI instances remain available");
    }
    preferred.shutdown().await;
    assert_eq!(fallback.launch_urls_for_thread(task).await.unwrap(), urls);
    let manager = GuiHostManager::new_with_opener(bridge.opener(), config);
    let restarted = AppServerGuiLaunchService::new(manager);
    let restarted_urls = restarted
        .launch_urls_for_thread(ThreadId::new())
        .await
        .unwrap();
    assert_eq!(
        url::Url::parse(&restarted_urls.entries[0].url)
            .unwrap()
            .port_or_known_default(),
        Some(preferred_port)
    );
    restarted.shutdown().await;
    third.shutdown().await;
    fallback.shutdown().await;
    bridge.shutdown().await;
}

#[tokio::test]
#[ignore = "requires port 80 to be available and permitted; run explicitly for acceptance"]
async fn real_port_80_gui_url_accepts_browser_default_authority() {
    let bridge = crate::gui_connection_bridge::test_support::start_local_bridge_for_test().await;
    let manager = GuiHostManager::new_with_opener(
        bridge.opener(),
        GuiHostConfig {
            port: 80,
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
    );
    let service = AppServerGuiLaunchService::new(manager);
    let urls = service
        .launch_urls_for_thread(ThreadId::new())
        .await
        .unwrap();
    let url = url::Url::parse(&urls.entries[0].url).unwrap();
    assert_eq!(
        url.port_or_known_default(),
        Some(80),
        "acceptance requires real port 80"
    );
    use tokio::io::AsyncReadExt;
    use tokio::io::AsyncWriteExt;
    let mut connection = tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, 80))
        .await
        .unwrap();
    connection
        .write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut response = String::new();
    connection.read_to_string(&mut response).await.unwrap();
    assert!(
        response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.1 502"),
        "{response}"
    );
    service.shutdown().await;
    bridge.shutdown().await;
}
