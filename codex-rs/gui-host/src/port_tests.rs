use super::*;
use crate::DevAssetProxyConfig;
use crate::test_support::NoopBackend;
use pretty_assertions::assert_eq;

#[tokio::test]
async fn binding_errors_other_than_address_in_use_are_preserved() {
    for kind in [
        io::ErrorKind::PermissionDenied,
        io::ErrorKind::AddrNotAvailable,
    ] {
        let error = bind_listener(/*preferred_port*/ 80, |port| {
            assert_eq!(port, 80, "must not retry on a temporary port");
            std::future::ready(Err(io::Error::new(kind, "binding failure")))
        })
        .await
        .expect_err("binding error must propagate");
        assert_eq!(
            (error.kind(), error.to_string()),
            (kind, "binding failure".to_string())
        );
    }
}

#[tokio::test]
async fn fallback_binding_error_is_preserved() {
    let error = bind_listener(/*preferred_port*/ 80, |port| {
        std::future::ready(Err(if port == 80 {
            io::Error::from(io::ErrorKind::AddrInUse)
        } else {
            io::Error::new(io::ErrorKind::PermissionDenied, "fallback binding failure")
        }))
    })
    .await
    .expect_err("fallback binding error must propagate");
    assert_eq!(
        (error.kind(), error.to_string()),
        (
            io::ErrorKind::PermissionDenied,
            "fallback binding failure".to_string()
        )
    );
}

#[test]
fn default_http_port_accepts_omitted_authority_port_without_relaxing_origin() {
    let hosts = [
        AdvertisedHost::new(crate::GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
        AdvertisedHost::new(crate::GuiLaunchUrlKind::Lan, "LAN", "192.0.2.1"),
        AdvertisedHost::new(crate::GuiLaunchUrlKind::Local, "IPv6", "::1"),
    ];
    for (host, origin) in [
        ("127.0.0.1", "http://127.0.0.1"),
        ("127.0.0.1:80", "http://127.0.0.1"),
        ("127.0.0.1", "http://127.0.0.1:80"),
        ("[::1]", "http://[::1]"),
    ] {
        assert!(is_advertised_host(&hosts, /*port*/ 80, host));
        assert!(crate::ws::validate_host_and_origin(
            &hosts,
            /*port*/ 80,
            host,
            Some(origin)
        ));
    }
    for (port, host, origin) in [
        (81, "127.0.0.1", "http://127.0.0.1"),
        (80, "127.0.0.1:81", "http://127.0.0.1"),
        (80, "127.0.0.1", "http://127.0.0.1:81"),
        (80, "127.0.0.1", "https://127.0.0.1"),
        (80, "127.0.0.1", "http://192.0.2.1"),
        (80, "127.0.0.1", "http://127.0.0.1/"),
        (80, "127.0.0.1", "http://user@127.0.0.1"),
    ] {
        assert!(!crate::ws::validate_host_and_origin(
            &hosts,
            port,
            host,
            Some(origin)
        ));
    }
}

#[tokio::test]
async fn uses_preferred_port_when_available() {
    let reservation = TcpListener::bind((std::net::Ipv4Addr::UNSPECIFIED, 0))
        .await
        .expect("reserve port");
    let preferred_port = reservation.local_addr().expect("address").port();
    drop(reservation);
    let handle = GuiHost::start(
        GuiHostConfig {
            port: preferred_port,
            mode: GuiHostMode::Dev(DevAssetProxyConfig {
                vite_origin: "http://127.0.0.1:5173".to_string(),
            }),
        },
        NoopBackend,
    )
    .await
    .expect("host should start");
    assert_eq!(
        handle.local_addr(),
        SocketAddr::from((std::net::Ipv4Addr::UNSPECIFIED, preferred_port))
    );
    handle.shutdown().await;
}

#[tokio::test]
async fn occupied_preferred_port_falls_back_without_moving_after_release() {
    let occupied = TcpListener::bind((std::net::Ipv4Addr::UNSPECIFIED, 0))
        .await
        .expect("reserve port");
    let preferred_port = occupied.local_addr().expect("address").port();
    let config = GuiHostConfig {
        port: preferred_port,
        mode: GuiHostMode::Dev(DevAssetProxyConfig {
            vite_origin: "http://127.0.0.1:5173".to_string(),
        }),
    };
    let handle = GuiHost::start(config.clone(), NoopBackend)
        .await
        .expect("occupied port should fall back");
    let fallback_port = handle.local_addr().port();
    assert_ne!(fallback_port, preferred_port);
    assert_ne!(fallback_port, 0);
    drop(occupied);
    let restarted = GuiHost::start(config, NoopBackend)
        .await
        .expect("released preferred port should be available");
    assert_eq!(restarted.local_addr().port(), preferred_port);
    for port in [fallback_port, preferred_port] {
        let response = reqwest::get(format!("http://127.0.0.1:{port}/"))
            .await
            .expect("both hosts remain reachable");
        assert_ne!(response.status(), axum::http::StatusCode::FORBIDDEN);
    }
    handle.shutdown().await;
    restarted.shutdown().await;
}

#[tokio::test]
#[ignore = "requires port 80 to be available and bindable by the current user"]
async fn production_default_port_80_serves_http_and_authenticates_websocket() {
    use futures::SinkExt;
    use futures::StreamExt;
    use tokio_tungstenite::tungstenite::Message;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let package = tempfile::tempdir().expect("package directory");
    let dist = package.path().join("dist");
    tokio::fs::create_dir(&dist).await.expect("dist directory");
    tokio::fs::write(dist.join("index.html"), "fixed-port-gui")
        .await
        .expect("index file");
    let handle = GuiHost::start(
        GuiHostConfig {
            port: 80,
            mode: GuiHostMode::Prod(crate::ProdAssetConfig {
                package_root: package.path().to_path_buf(),
            }),
        },
        crate::test_support::RecordingBackend::new(),
    )
    .await
    .expect("production host should bind port 80");
    assert_eq!(handle.local_addr().port(), 80);
    let response = reqwest::get("http://127.0.0.1/")
        .await
        .expect("HTTP response");
    assert_eq!(response.status(), axum::http::StatusCode::OK);
    assert_eq!(response.text().await.expect("body"), "fixed-port-gui");
    let mut request = format!("ws://127.0.0.1{}", crate::browser_contract::WEBSOCKET_PATH)
        .into_client_request()
        .expect("WebSocket request");
    request
        .headers_mut()
        .insert("Origin", "http://127.0.0.1".parse().unwrap());
    let (mut websocket, _) = tokio_tungstenite::connect_async(request)
        .await
        .expect("WebSocket handshake");
    websocket
        .send(Message::Text(
            serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": crate::browser_contract::AUTHENTICATE_METHOD,
                "params": { "token": handle.launch_token().as_str() }
            })
            .to_string()
            .into(),
        ))
        .await
        .expect("authenticate request");
    let response = tokio::time::timeout(std::time::Duration::from_secs(5), websocket.next())
        .await
        .expect("authentication deadline")
        .expect("authentication response")
        .expect("valid message");
    let response: serde_json::Value =
        serde_json::from_str(response.to_text().expect("text response")).expect("JSON response");
    assert_eq!(
        response,
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": { "authenticated": true }
        })
    );
    websocket.close(None).await.expect("close WebSocket");
    drop(websocket);
    handle.shutdown().await;
}
