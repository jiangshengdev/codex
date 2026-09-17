use anyhow::Result;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiBackend;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use pretty_assertions::assert_eq;
use reqwest::StatusCode;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;

#[derive(Clone)]
struct NoopBackend;

impl GuiBackend for NoopBackend {
    async fn connect(&self, _connection: AuthenticatedGuiConnection) -> Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn file_upload_shutdown_does_not_wait_for_stalled_client() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let authority = format!("127.0.0.1:{}", host.local_addr().port());
    let mut socket = tokio::net::TcpStream::connect(&authority).await?;
    let token = host.launch_token().as_str();
    socket.write_all(format!(
        "POST /upload?filename=stalled.bin HTTP/1.1\r\nHost: {authority}\r\nOrigin: http://{authority}\r\nAuthorization: Bearer {token}\r\nContent-Length: 100\r\nExpect: 100-continue\r\n\r\n"
    ).as_bytes()).await?;
    let mut interim = [0; 25];
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        socket.read_exact(&mut interim),
    )
    .await??;
    assert_eq!(&interim, b"HTTP/1.1 100 Continue\r\n\r\n");
    tokio::time::timeout(std::time::Duration::from_secs(2), host.shutdown()).await?;
    Ok(())
}

#[tokio::test]
async fn file_upload_preserves_original_bytes_and_survives_shutdown() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    let contents = b"\0\0\0\x18ftypheic\0\xfforiginal bytes";
    let response = reqwest::Client::new()
        .post(format!("{origin}/upload?filename=photo.HEIC"))
        .header("origin", &origin)
        .bearer_auth(host.launch_token().as_str())
        .body(contents.to_vec())
        .send()
        .await?;
    assert_eq!(response.status(), StatusCode::CREATED);
    let path = std::path::PathBuf::from(response.text().await?);
    assert!(path.is_absolute());
    assert_eq!(
        path.extension().and_then(|value| value.to_str()),
        Some("HEIC")
    );
    host.shutdown().await;
    assert_eq!(tokio::fs::read(&path).await?, contents);
    tokio::fs::remove_file(path).await?;
    Ok(())
}

#[tokio::test]
async fn file_upload_enforces_limit_on_actual_streamed_bytes() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    for (size, expected) in [
        (52_428_800, StatusCode::CREATED),
        (52_428_801, StatusCode::PAYLOAD_TOO_LARGE),
    ] {
        // An unknown-length stream ensures Content-Length cannot stand in for counting bytes.
        let content = vec![0xa5; size];
        let chunks: Vec<Result<Vec<u8>, std::io::Error>> = content
            .chunks(64 * 1024)
            .map(|chunk| Ok(chunk.to_vec()))
            .collect();
        let response = reqwest::Client::new()
            .post(format!("{origin}/upload?filename=data.bin"))
            .header("origin", &origin)
            .bearer_auth(host.launch_token().as_str())
            .body(reqwest::Body::wrap_stream(futures::stream::iter(chunks)))
            .send()
            .await?;
        assert_eq!(response.status(), expected);
        if expected == StatusCode::CREATED {
            let path = response.text().await?;
            assert_eq!(tokio::fs::read(&path).await?, content);
            tokio::fs::remove_file(path).await?;
        }
    }
    host.shutdown().await;
    Ok(())
}

#[tokio::test]
async fn file_upload_requires_token_and_same_origin() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    for (token, request_origin) in [
        ("wrong", origin.as_str()),
        (host.launch_token().as_str(), "http://untrusted.invalid"),
    ] {
        let response = reqwest::Client::new()
            .post(format!("{origin}/upload?filename=file.txt"))
            .header("origin", request_origin)
            .bearer_auth(token)
            .body("contents")
            .send()
            .await?;
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    let response = reqwest::Client::new()
        .post(format!("{origin}/upload?filename=file.txt"))
        .bearer_auth(host.launch_token().as_str())
        .body("contents")
        .send()
        .await?;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    host.shutdown().await;
    Ok(())
}

#[tokio::test]
async fn file_upload_prod_keeps_same_named_files_distinct() -> Result<()> {
    let package = tempfile::tempdir()?;
    tokio::fs::create_dir(package.path().join("dist")).await?;
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Prod(codex_gui_host::ProdAssetConfig {
                package_root: package.path().to_path_buf(),
            }),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    let mut paths = Vec::new();
    for content in [b"first".as_slice(), b"second".as_slice()] {
        let response = reqwest::Client::new()
            .post(format!("{origin}/upload"))
            .query(&[("filename", "../../untrusted/name.png")])
            .header("origin", &origin)
            .bearer_auth(host.launch_token().as_str())
            .body(content.to_vec())
            .send()
            .await?;
        assert_eq!(response.status(), StatusCode::CREATED);
        let path = std::path::PathBuf::from(response.text().await?);
        assert!(
            path.file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .starts_with("codex-upload-")
        );
        assert_eq!(
            path.extension().and_then(|value| value.to_str()),
            Some("png")
        );
        paths.push(path);
    }
    assert_ne!(paths[0], paths[1]);
    assert_eq!(tokio::fs::read(&paths[0]).await?, b"first");
    assert_eq!(tokio::fs::read(&paths[1]).await?, b"second");
    host.shutdown().await;
    for path in paths {
        tokio::fs::remove_file(path).await?;
    }
    Ok(())
}
