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

// Run in a subprocess so the OS temporary directory and disk-write limits are
// isolated from parallel tests, without changing the parent process environment.
#[tokio::test]
async fn file_upload_storage_and_transport_failures() -> Result<()> {
    if std::env::var_os("CODEX_UPLOAD_FAILURE_CHILD").is_none() {
        let directory = tempfile::tempdir()?;
        let output = std::process::Command::new(std::env::current_exe()?)
            .args([
                "--exact",
                "file_upload_storage_and_transport_failures",
                "--nocapture",
            ])
            .env("CODEX_UPLOAD_FAILURE_CHILD", "1")
            .env("TMPDIR", directory.path())
            .env("TMP", directory.path())
            .env("TEMP", directory.path())
            .output()?;
        assert!(
            output.status.success(),
            "child test failed: {}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        return Ok(());
    }
    let host = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Dev(DevAssetProxyConfig::default()),
        },
        NoopBackend,
    )
    .await?;
    let authority = format!("127.0.0.1:{}", host.local_addr().port());
    let origin = format!("http://{authority}");
    let token = host.launch_token().as_str();
    let client = reqwest::Client::new();

    // Closing the write side before Content-Length is reached cannot publish a path.
    let mut socket = tokio::net::TcpStream::connect(&authority).await?;
    socket.write_all(format!(
        "POST /upload?filename=broken.bin HTTP/1.1\r\nHost: {authority}\r\nOrigin: {origin}\r\nAuthorization: Bearer {token}\r\nContent-Length: 100\r\nConnection: close\r\nExpect: 100-continue\r\n\r\n"
    ).as_bytes()).await?;
    let mut interim = [0; 25];
    socket.read_exact(&mut interim).await?;
    assert_eq!(&interim, b"HTTP/1.1 100 Continue\r\n\r\n");
    socket.write_all(b"partial").await?;
    socket.shutdown().await?;
    let mut reply = Vec::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        socket.read_to_end(&mut reply),
    )
    .await??;
    assert!(!String::from_utf8_lossy(&reply).contains("201 Created"));

    // Force a real filesystem write failure only in this isolated test process.
    #[cfg(unix)]
    {
        let mut previous = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        // SAFETY: getrlimit writes a valid rlimit; the signal disposition and limit
        // affect only this dedicated subprocess, which runs no other tests.
        unsafe {
            assert_eq!(libc::getrlimit(libc::RLIMIT_FSIZE, &mut previous), 0);
            assert_ne!(libc::signal(libc::SIGXFSZ, libc::SIG_IGN), libc::SIG_ERR);
            let limited = libc::rlimit {
                rlim_cur: 1024,
                rlim_max: previous.rlim_max,
            };
            assert_eq!(libc::setrlimit(libc::RLIMIT_FSIZE, &limited), 0);
        }
        let response = client
            .post(format!("{origin}/upload?filename=write-failure.bin"))
            .header("origin", &origin)
            .bearer_auth(token)
            .body(vec![7; 2048])
            .send()
            .await?;
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        // SAFETY: restore the limit obtained above in the isolated subprocess.
        unsafe {
            assert_eq!(libc::setrlimit(libc::RLIMIT_FSIZE, &previous), 0);
        }
    }

    // Successful response is discarded, modeling a caller that cannot recover its path.
    let contents = b"complete original payload";
    let lost_response = client
        .post(format!("{origin}/upload?filename=retry.HEIC"))
        .header("origin", &origin)
        .bearer_auth(token)
        .body(contents.to_vec())
        .send()
        .await?;
    assert_eq!(lost_response.status(), StatusCode::CREATED);
    drop(lost_response);
    let mut entries = tokio::fs::read_dir(std::env::temp_dir()).await?;
    let saved_path = entries
        .next_entry()
        .await?
        .expect("committed file must remain")
        .path();
    assert_eq!(tokio::fs::read(&saved_path).await?, contents);
    assert!(
        entries.next_entry().await?.is_none(),
        "failed uploads must not leave partial files"
    );

    let retried = client
        .post(format!("{origin}/upload?filename=retry.HEIC"))
        .header("origin", &origin)
        .bearer_auth(token)
        .body(contents.to_vec())
        .send()
        .await?;
    assert_eq!(retried.status(), StatusCode::CREATED);
    let retried_path = std::path::PathBuf::from(retried.text().await?);
    assert_ne!(saved_path, retried_path);
    assert_eq!(tokio::fs::read(&saved_path).await?, contents);
    assert_eq!(tokio::fs::read(&retried_path).await?, contents);
    host.shutdown().await;
    Ok(())
}
