use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_gui_host::ProdAssetConfig;
use pretty_assertions::assert_eq;
use reqwest::StatusCode;

#[derive(Clone)]
struct NoopBackend;

impl GuiBackend for NoopBackend {
    async fn connect(&self, _connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        Ok(())
    }
}

#[tokio::test]
async fn prod_serves_hashed_asset_from_package_root() {
    let package_root = tempfile::tempdir().expect("tempdir should be created");
    let dist_dir = package_root.path().join("dist");
    let assets_dir = dist_dir.join("assets");
    tokio::fs::create_dir_all(&assets_dir)
        .await
        .expect("assets dir should be created");
    tokio::fs::write(dist_dir.join("index.html"), "<html></html>")
        .await
        .expect("index should be written");
    tokio::fs::write(
        assets_dir.join("index-abc123.js"),
        "console.log('prod hashed asset');\n",
    )
    .await
    .expect("hashed asset should be written");

    let handle = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Prod(ProdAssetConfig {
                package_root: package_root.path().to_path_buf(),
            }),
        },
        NoopBackend,
    )
    .await
    .expect("host should start");

    let response = reqwest::get(format!(
        "http://{}/assets/index-abc123.js",
        handle.local_addr()
    ))
    .await
    .expect("asset request should succeed");
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.text().await.expect("body should be readable");
    assert!(!body.is_empty());

    handle.shutdown().await;
}
