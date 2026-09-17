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

#[tokio::test]
async fn file_preview_returns_uploaded_image_bytes_without_origin() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    let client = reqwest::Client::new();
    let contents = b"\x89PNG\r\n\x1a\nimage bytes";
    let upload = client
        .post(format!("{origin}/upload?filename=photo.png"))
        .header("origin", &origin)
        .bearer_auth(host.launch_token().as_str())
        .body(contents.to_vec())
        .send()
        .await?;
    assert_eq!(upload.status(), StatusCode::CREATED);
    let path = upload.text().await?;
    let preview = client
        .get(format!("{origin}/upload/preview"))
        .query(&[("path", &path)])
        .bearer_auth(host.launch_token().as_str())
        .send()
        .await?;
    assert_eq!(preview.status(), StatusCode::OK);
    assert_eq!(preview.headers()["content-type"], "image/png");
    assert_eq!(preview.headers()["cache-control"], "no-store");
    assert_eq!(preview.headers()["x-content-type-options"], "nosniff");
    assert_eq!(preview.bytes().await?.as_ref(), contents);
    tokio::fs::remove_file(path).await?;
    host.shutdown().await;
    Ok(())
}

#[tokio::test]
async fn file_preview_survives_host_restart_and_identifies_supported_media() -> Result<()> {
    let package = tempfile::tempdir()?;
    tokio::fs::create_dir(package.path().join("dist")).await?;
    let config = GuiHostConfig {
        mode: GuiHostMode::Prod(codex_gui_host::ProdAssetConfig {
            package_root: package.path().to_path_buf(),
        }),
    };
    let host = GuiHost::start(config.clone(), NoopBackend).await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    let client = reqwest::Client::new();
    let mut uploaded = Vec::new();
    // The endpoint serves original bytes based on their signature, without decoding or transcoding.
    for (contents, content_type) in [
        (b"\x89PNG\r\n\x1a\n".as_slice(), "image/png"),
        (b"\xff\xd8\xff\xe0".as_slice(), "image/jpeg"),
        (b"GIF87a".as_slice(), "image/gif"),
        (b"GIF89a".as_slice(), "image/gif"),
        (b"RIFF\x04\x00\x00\x00WEBP".as_slice(), "image/webp"),
    ] {
        let response = client
            .post(format!("{origin}/upload?filename=image.bin"))
            .header("origin", &origin)
            .bearer_auth(host.launch_token().as_str())
            .body(contents.to_vec())
            .send()
            .await?;
        assert_eq!(response.status(), StatusCode::CREATED);
        uploaded.push((response.text().await?, contents, content_type));
    }
    host.shutdown().await;
    let host = GuiHost::start(config, NoopBackend).await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    for (path, contents, content_type) in uploaded {
        let response = client
            .get(format!("{origin}/upload/preview"))
            .query(&[("path", &path)])
            .header("origin", &origin)
            .bearer_auth(host.launch_token().as_str())
            .send()
            .await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["content-type"], content_type);
        assert_eq!(response.bytes().await?.as_ref(), contents);
        tokio::fs::remove_file(path).await?;
    }
    host.shutdown().await;
    Ok(())
}

impl GuiBackend for NoopBackend {
    async fn connect(&self, _connection: AuthenticatedGuiConnection) -> Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn file_preview_requires_token_trusted_host_and_valid_origin_when_present() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    let authority = format!("127.0.0.1:{}", host.local_addr().port());
    let image = tempfile::Builder::new()
        .prefix("codex-upload-")
        .suffix(".png")
        .tempfile()?;
    tokio::fs::write(image.path(), b"\x89PNG\r\n\x1a\n").await?;
    for (token, request_origin, request_host) in [
        ("wrong", Some(origin.as_str()), authority.as_str()),
        ("wrong", None, authority.as_str()),
        (
            host.launch_token().as_str(),
            Some("http://untrusted.invalid"),
            authority.as_str(),
        ),
        (
            host.launch_token().as_str(),
            Some("null"),
            authority.as_str(),
        ),
        (host.launch_token().as_str(), Some(""), authority.as_str()),
        (host.launch_token().as_str(), None, "untrusted.invalid"),
        (
            host.launch_token().as_str(),
            Some(origin.as_str()),
            "untrusted.invalid",
        ),
    ] {
        let mut request = reqwest::Client::new()
            .get(format!("{origin}/upload/preview"))
            .query(&[("path", image.path())])
            .header("host", request_host)
            .bearer_auth(token);
        if let Some(request_origin) = request_origin {
            request = request.header("origin", request_origin);
        }
        assert_eq!(request.send().await?.status(), StatusCode::FORBIDDEN);
    }
    let malformed_origin = reqwest::header::HeaderValue::from_bytes(b"\xff")?;
    let response = reqwest::Client::new()
        .get(format!("{origin}/upload/preview"))
        .query(&[("path", image.path())])
        .header("origin", malformed_origin)
        .bearer_auth(host.launch_token().as_str())
        .send()
        .await?;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let response = reqwest::Client::new()
        .get(format!("{origin}/upload/preview"))
        .query(&[("path", image.path())])
        .send()
        .await?;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    host.shutdown().await;
    Ok(())
}

#[tokio::test]
async fn file_preview_rejects_non_upload_paths_non_images_and_oversized_files() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    let ordinary = tempfile::NamedTempFile::new()?;
    let directory = tempfile::Builder::new().prefix("codex-upload-").tempdir()?;
    let nested = tempfile::Builder::new()
        .prefix("codex-upload-")
        .tempfile_in(directory.path())?;
    let unsupported = tempfile::Builder::new()
        .prefix("codex-upload-")
        .suffix(".png")
        .tempfile()?;
    tokio::fs::write(
        unsupported.path(),
        b"<svg xmlns='http://www.w3.org/2000/svg'/>",
    )
    .await?;
    let oversized = tempfile::Builder::new()
        .prefix("codex-upload-")
        .suffix(".png")
        .tempfile()?;
    oversized.as_file().set_len(52_428_801)?;
    let missing = std::env::temp_dir().join("codex-upload-nonexistent-preview-test.png");
    let traversal = directory
        .path()
        .join("..")
        .join(unsupported.path().file_name().unwrap());
    for (path, status) in [
        (ordinary.path(), StatusCode::FORBIDDEN),
        (directory.path(), StatusCode::FORBIDDEN),
        (nested.path(), StatusCode::FORBIDDEN),
        (unsupported.path(), StatusCode::UNSUPPORTED_MEDIA_TYPE),
        (oversized.path(), StatusCode::PAYLOAD_TOO_LARGE),
        (missing.as_path(), StatusCode::NOT_FOUND),
        (traversal.as_path(), StatusCode::FORBIDDEN),
        (
            std::path::Path::new("codex-upload-relative.png"),
            StatusCode::FORBIDDEN,
        ),
    ] {
        let response = reqwest::Client::new()
            .get(format!("{origin}/upload/preview"))
            .query(&[("path", path)])
            .header("origin", &origin)
            .bearer_auth(host.launch_token().as_str())
            .send()
            .await?;
        assert_eq!(response.status(), status, "{path:?}");
    }
    host.shutdown().await;
    Ok(())
}

#[cfg(unix)]
#[tokio::test]
async fn file_preview_rejects_symbolic_links() -> Result<()> {
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let origin = format!("http://127.0.0.1:{}", host.local_addr().port());
    let target = tempfile::NamedTempFile::new()?;
    tokio::fs::write(target.path(), b"\x89PNG\r\n\x1a\n").await?;
    let link = tempfile::Builder::new()
        .prefix("codex-upload-")
        .suffix(".png")
        .tempfile()?
        .into_temp_path();
    tokio::fs::remove_file(&link).await?;
    std::os::unix::fs::symlink(target.path(), &link)?;
    let response = reqwest::Client::new()
        .get(format!("{origin}/upload/preview"))
        .query(&[("path", link.to_path_buf())])
        .header("origin", &origin)
        .bearer_auth(host.launch_token().as_str())
        .send()
        .await?;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    host.shutdown().await;
    Ok(())
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
