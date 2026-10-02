use super::AppServerGuiLaunchService;
use super::GuiLaunchServiceError;
use codex_protocol::ThreadId;
use futures::SinkExt;
use futures::StreamExt;
use pretty_assertions::assert_eq;
use std::net::Ipv4Addr;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

const CHILD_TEST: &str = "gui_launch_service::gui_launch_env_tests::gui_port_env_child";

#[tokio::test]
async fn empty_gui_port_reports_configuration_error() {
    run_env_case(Some(""), "invalid", "dev").await;
}

#[tokio::test]
async fn invalid_gui_ports_report_configuration_errors() {
    for value in ["-1", "65536", "abc", "80.5"] {
        run_env_case(Some(value), "invalid", "prod").await;
    }
}

#[tokio::test]
async fn configured_gui_ports_serve_http_and_authenticate_websocket() {
    for mode in ["dev", "prod"] {
        run_env_case(Some("0"), "ephemeral", mode).await;
        let occupied = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).await.unwrap();
        let port = occupied.local_addr().unwrap().port().to_string();
        run_env_case(Some(&port), "occupied", mode).await;
        TcpStream::connect((Ipv4Addr::LOCALHOST, occupied.local_addr().unwrap().port()))
            .await
            .expect("occupying service must remain available");
        drop(occupied);
        run_env_case(Some(&port), "fixed", mode).await;
    }
}

#[tokio::test]
#[ignore = "requires port 80 to be available and permitted; run explicitly for acceptance"]
async fn unset_gui_port_serves_http_and_authenticates_on_port_80() {
    run_env_case(/*port*/ None, "default", "prod").await;
}

async fn run_env_case(port: Option<&str>, case: &str, mode: &str) {
    let package = tempfile::tempdir().unwrap();
    let completion = package.path().join("child-completed");
    tokio::fs::create_dir(package.path().join("dist"))
        .await
        .unwrap();
    tokio::fs::write(package.path().join("dist/index.html"), "gui-env-port-page")
        .await
        .unwrap();
    let vite = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let vite_url = format!("http://{}", vite.local_addr().unwrap());
    let vite_task = tokio::spawn(async move {
        axum::serve(
            vite,
            axum::Router::new().fallback(|| async { "gui-env-port-page" }),
        )
        .await
        .unwrap();
    });
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", CHILD_TEST, "--ignored", "--nocapture"])
        .env("CODEX_GUI_HOST_MODE", mode)
        .env("CODEX_GUI_PACKAGE_ROOT", package.path())
        .env("CODEX_GUI_VITE_URL", vite_url)
        .env("CODEX_GUI_PORT_TEST_CASE", case)
        .env("CODEX_GUI_PORT_TEST_COMPLETION", &completion)
        .kill_on_drop(true);
    match port {
        Some(port) => {
            command.env("CODEX_GUI_PORT", port);
        }
        None => {
            command.env_remove("CODEX_GUI_PORT");
        }
    }
    let output = tokio::time::timeout(Duration::from_secs(30), command.output()).await;
    vite_task.abort();
    let _ = vite_task.await;
    let output = output.expect("child must finish").unwrap();
    assert!(
        output.status.success(),
        "case {case}, mode {mode}: {output:?}"
    );
    assert_eq!(
        tokio::fs::read_to_string(completion)
            .await
            .expect("child must write its completion marker"),
        "GUI_PORT_ENV_VERIFIED",
        "child must execute the assertion path: {output:?}"
    );
}

#[tokio::test]
#[ignore = "invoked by parent with isolated environment"]
async fn gui_port_env_child() {
    let case = std::env::var("CODEX_GUI_PORT_TEST_CASE").expect("parent must select a case");
    let bridge = crate::gui_connection_bridge::test_support::start_local_bridge_for_test().await;
    let service = AppServerGuiLaunchService::new_with_default_config(bridge.opener());
    let thread = ThreadId::new();
    let result = service.launch_urls_for_thread(thread).await;
    if case == "invalid" {
        match result {
            Err(GuiLaunchServiceError::Config { message }) => {
                assert!(message.contains("CODEX_GUI_PORT"), "{message}");
                assert!(message.contains("65535"), "{message}");
            }
            other => panic!("expected configuration error, got {other:?}"),
        }
    } else {
        let urls = result.expect("valid configuration should launch");
        let url = url::Url::parse(&urls.entries[0].url).unwrap();
        let port = url.port_or_known_default().unwrap();
        match case.as_str() {
            "default" => assert_eq!(port, 80),
            "fixed" => assert_eq!(
                port,
                std::env::var("CODEX_GUI_PORT")
                    .unwrap()
                    .parse::<u16>()
                    .unwrap()
            ),
            "occupied" => assert_ne!(
                port,
                std::env::var("CODEX_GUI_PORT")
                    .unwrap()
                    .parse::<u16>()
                    .unwrap()
            ),
            "ephemeral" => {}
            other => panic!("unknown case {other}"),
        }
        assert_ne!(port, 0);
        for entry in &urls.entries {
            let entry = url::Url::parse(&entry.url).unwrap();
            assert_eq!(entry.port_or_known_default(), Some(port));
            assert_eq!(entry.path(), format!("/task/{thread}"));
            assert_eq!(entry.fragment(), url.fragment());
        }
        assert_eq!(service.launch_urls_for_thread(thread).await.unwrap(), urls);
        let mut connection = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        connection
            .write_all(
                format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n")
                    .as_bytes(),
            )
            .await
            .unwrap();
        let mut response = String::new();
        connection.read_to_string(&mut response).await.unwrap();
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        assert!(response.contains("gui-env-port-page"), "{response}");

        let mut request = format!("ws://127.0.0.1:{port}/ws")
            .into_client_request()
            .unwrap();
        request.headers_mut().insert(
            "Origin",
            format!("http://127.0.0.1:{port}").parse().unwrap(),
        );
        let (mut websocket, _) = tokio_tungstenite::connect_async(request).await.unwrap();
        let token = url.fragment().unwrap().strip_prefix("token=").unwrap();
        websocket.send(Message::Text(serde_json::json!({
            "jsonrpc": "2.0", "id": 1, "method": "gui/authenticate", "params": { "token": token }
        }).to_string().into())).await.unwrap();
        let response = tokio::time::timeout(Duration::from_secs(5), websocket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let response: serde_json::Value =
            serde_json::from_str(response.to_text().unwrap()).unwrap();
        assert_eq!(
            response,
            serde_json::json!({"jsonrpc": "2.0", "id": 1, "result": {"authenticated": true}})
        );
        websocket.close(None).await.unwrap();
        drop(websocket);
    }
    service.shutdown().await;
    bridge.shutdown().await;
    tokio::fs::write(
        std::env::var_os("CODEX_GUI_PORT_TEST_COMPLETION")
            .expect("parent must provide a completion marker path"),
        "GUI_PORT_ENV_VERIFIED",
    )
    .await
    .unwrap();
}
