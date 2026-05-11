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
        Err(_) => with_security_headers(
            (
                StatusCode::BAD_GATEWAY,
                format!("Start Vite at {}", config.vite_origin),
            )
                .into_response(),
        ),
    }
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

#[cfg(test)]
mod tests {
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
}
