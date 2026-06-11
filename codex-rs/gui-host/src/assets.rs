use std::path::PathBuf;

use axum::body::Body;
use axum::http::HeaderValue;
use axum::http::StatusCode;
use axum::http::Uri;
use axum::http::header::CONTENT_TYPE;
use axum::response::IntoResponse;
use axum::response::Response;
use tower_http::services::ServeDir;

use crate::DevAssetProxyConfig;
use crate::ProdAssetConfig;

const X_FRAME_OPTIONS: &str = "x-frame-options";
const CONTENT_SECURITY_POLICY: &str = "content-security-policy";
const DEV_PROXY_ERROR_HTML: &str = include_str!("embedded_pages/dev_proxy_error.html");
const DEV_PROXY_ERROR_CSS: &str = include_str!("embedded_pages/assets/style.css");

pub fn prod_dist_dir(config: &ProdAssetConfig) -> anyhow::Result<PathBuf> {
    let dist_dir = config.dist_dir();
    if !dist_dir.is_dir() {
        anyhow::bail!("GUI dist directory is missing: {}", dist_dir.display());
    }
    Ok(dist_dir)
}

pub fn prod_assets_service(config: &ProdAssetConfig) -> ServeDir {
    ServeDir::new(config.dist_dir()).append_index_html_on_directories(true)
}

pub async fn serve_prod_index(config: ProdAssetConfig) -> Response {
    let index_path = config.dist_dir().join("index.html");
    match tokio::fs::read_to_string(&index_path).await {
        Ok(html) => with_security_headers(
            ([(CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response(),
        ),
        Err(error) => with_security_headers(
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("failed to read GUI index: {error}"),
            )
                .into_response(),
        ),
    }
}

pub async fn proxy_vite(config: DevAssetProxyConfig, uri: Uri) -> Response {
    let path_and_query = uri
        .path_and_query()
        .map_or("/", axum::http::uri::PathAndQuery::as_str);
    let upstream_url = format!(
        "{}{}",
        config.vite_origin.trim_end_matches('/'),
        path_and_query
    );

    match reqwest::get(upstream_url).await {
        Ok(upstream) => {
            let status = upstream.status();
            let content_type = upstream.headers().get(CONTENT_TYPE).cloned();
            match upstream.bytes().await {
                Ok(body) => {
                    let mut response = Response::new(Body::from(body));
                    *response.status_mut() = status;
                    if let Some(content_type) = content_type {
                        response.headers_mut().insert(CONTENT_TYPE, content_type);
                    }
                    with_security_headers(response)
                }
                Err(error) => with_security_headers(
                    (
                        StatusCode::BAD_GATEWAY,
                        format!("failed to read Vite response body: {error}"),
                    )
                        .into_response(),
                ),
            }
        }
        Err(error) => {
            let mut response = (
                StatusCode::BAD_GATEWAY,
                dev_proxy_error_page(&config.vite_origin, &error.to_string()),
            )
                .into_response();
            response
                .headers_mut()
                .insert(CONTENT_TYPE, HeaderValue::from_static("text/html"));
            with_security_headers(response)
        }
    }
}

fn dev_proxy_error_page(vite_origin: &str, error: &str) -> String {
    DEV_PROXY_ERROR_HTML
        .replace("{{CODEX_GUI_HOST_CSS}}", DEV_PROXY_ERROR_CSS)
        .replace("{{CODEX_GUI_HOST_VITE_ORIGIN}}", &html_escape(vite_origin))
        .replace("{{CODEX_GUI_HOST_ERROR}}", &html_escape(error))
}

fn html_escape(input: &str) -> String {
    let mut escaped = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

pub fn with_security_headers(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    response.headers_mut().insert(
        CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("frame-ancestors 'none'"),
    );
    response
}

pub async fn add_security_headers(response: Response) -> Response {
    with_security_headers(response)
}

#[cfg(test)]
mod tests {
    use axum::body;
    use axum::http::StatusCode;
    use axum::http::Uri;
    use pretty_assertions::assert_eq;

    use crate::DevAssetProxyConfig;
    use crate::ProdAssetConfig;

    #[test]
    fn prod_dist_dir_requires_existing_dist() {
        let package_root = tempfile::tempdir().expect("tempdir should be created");
        let config = ProdAssetConfig {
            package_root: package_root.path().to_path_buf(),
        };

        let error = super::prod_dist_dir(&config).expect_err("missing dist should fail");

        assert!(
            error.to_string().contains("GUI dist directory is missing"),
            "{error:#}"
        );
    }

    #[test]
    fn html_escape_escapes_dynamic_page_values() {
        assert_eq!(
            super::html_escape("<script data-x=\"1\">'&'</script>"),
            "&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/script&gt;"
        );
    }

    #[tokio::test]
    async fn proxy_vite_returns_embedded_html_when_upstream_is_unavailable() {
        let config = DevAssetProxyConfig {
            vite_origin: "http://[::1/?unsafe=<script>".to_string(),
        };
        let response = super::proxy_vite(
            config,
            "/?threadId=test"
                .parse::<Uri>()
                .expect("URI should be valid"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(
            response
                .headers()
                .get(super::CONTENT_TYPE)
                .expect("content-type should be present"),
            "text/html"
        );

        let body = body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should be readable");
        let body = String::from_utf8(body.to_vec()).expect("body should be UTF-8");

        assert!(body.contains("Waiting for Vite"));
        assert!(body.contains("pnpm --dir codex-gui dev"));
        assert!(body.contains("NO_PROXY=127.0.0.1,localhost"));
        assert!(body.contains("http://[::1/?unsafe=&lt;script&gt;"));
        assert!(body.contains("Connection error"));
        assert!(!body.contains("{{CODEX_GUI_HOST_"));
    }
}
