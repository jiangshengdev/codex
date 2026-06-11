use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::GuiBackend;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostMode;
use codex_gui_host::ProdAssetConfig;
use pretty_assertions::assert_eq;
use reqwest::StatusCode;
use std::path::PathBuf;

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

    let response = reqwest::get(format!("{}/assets/index-abc123.js", local_origin(&handle)))
        .await
        .expect("asset request should succeed");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("x-frame-options")
            .expect("x-frame-options header should be present"),
        "DENY"
    );
    assert_eq!(
        response
            .headers()
            .get("content-security-policy")
            .expect("content-security-policy header should be present"),
        "frame-ancestors 'none'"
    );
    let body = response.text().await.expect("body should be readable");
    assert!(!body.is_empty());

    handle.shutdown().await;
}

fn first_module_script_src(html: &str) -> Option<String> {
    let mut rest = html;
    while let Some(script_start) = rest.find("<script") {
        rest = &rest[script_start + "<script".len()..];
        let tag_end = rest.find('>')?;
        let tag = &rest[..tag_end];
        if script_attr(tag, "type").is_some_and(|value| value == "module") {
            return script_attr(tag, "src").map(str::to_string);
        }
        rest = &rest[tag_end + 1..];
    }

    None
}

fn script_attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let marker = format!("{name}=\"");
    let start = tag.find(&marker)? + marker.len();
    let value = &tag[start..];
    let end = value.find('"')?;
    Some(&value[..end])
}

#[test]
fn first_module_script_src_ignores_attribute_order() {
    let html = r#"
        <script crossorigin src="/assets/ignored.js"></script>
        <script defer src="/assets/index-abc123.js" crossorigin type="module"></script>
    "#;

    assert_eq!(
        first_module_script_src(html),
        Some("/assets/index-abc123.js".to_string())
    );
}

#[tokio::test]
async fn prod_serves_built_codex_gui_dist_from_package_root_env() {
    let Some(package_root) = std::env::var_os("CODEX_GUI_PACKAGE_ROOT") else {
        eprintln!("skipping real codex-gui dist smoke; CODEX_GUI_PACKAGE_ROOT is not set");
        return;
    };
    let package_root = PathBuf::from(package_root);
    let dist_dir = package_root.join("dist");
    assert!(
        dist_dir.join("index.html").is_file(),
        "expected {} to exist; run `pnpm --dir codex-gui run build` first",
        dist_dir.join("index.html").display()
    );

    let handle = GuiHost::start(
        GuiHostConfig {
            mode: GuiHostMode::Prod(ProdAssetConfig {
                package_root: package_root.clone(),
            }),
        },
        NoopBackend,
    )
    .await
    .expect("host should start with real codex-gui dist");

    let root_response = reqwest::get(format!("{}/", local_origin(&handle)))
        .await
        .expect("root request should succeed");
    assert_eq!(root_response.status(), StatusCode::OK);
    let html = root_response
        .text()
        .await
        .expect("html body should be readable");
    assert!(html.contains(r#"<div id="root"></div>"#));
    let script_src = first_module_script_src(&html).expect("Vite module script should exist");

    let asset_response = reqwest::get(format!("{}{}", local_origin(&handle), script_src))
        .await
        .expect("built asset request should succeed");
    assert_eq!(asset_response.status(), StatusCode::OK);
    assert!(
        asset_response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("javascript")),
        "built module asset should be served as JavaScript"
    );

    handle.shutdown().await;
}

fn local_origin(handle: &codex_gui_host::GuiHostHandle) -> String {
    let url = handle.launch_url_for_thread("test-thread");
    match url.split("/?").next() {
        Some(origin) => origin.to_string(),
        None => panic!("launch URL should include query"),
    }
}
