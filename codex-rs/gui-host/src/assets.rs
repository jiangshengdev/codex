use std::collections::HashSet;
use std::path::PathBuf;

use axum::body::Body;
use axum::http::HeaderMap;
use axum::http::HeaderName;
use axum::http::HeaderValue;
use axum::http::Request;
use axum::http::StatusCode;
use axum::http::header::CONTENT_TYPE;
use axum::http::header::HOST;
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

pub async fn proxy_vite(config: DevAssetProxyConfig, request: Request<Body>) -> Response {
    let (parts, _body) = request.into_parts();
    let path_and_query = parts
        .uri
        .path_and_query()
        .map_or("/", axum::http::uri::PathAndQuery::as_str);
    let upstream_url = format!(
        "{}{}",
        config.vite_origin.trim_end_matches('/'),
        path_and_query
    );

    let client = match reqwest::Client::builder().no_proxy().build() {
        Ok(client) => client,
        Err(error) => return dev_proxy_error_response(&config.vite_origin, &error.to_string()),
    };

    let request_headers = end_to_end_headers(&parts.headers, HostHeader::Remove);
    match client
        .request(parts.method, upstream_url)
        .headers(request_headers)
        .send()
        .await
    {
        Ok(upstream) => {
            let status = upstream.status();
            let response_headers = end_to_end_headers(upstream.headers(), HostHeader::Preserve);
            let mut response = Response::new(Body::from_stream(upstream.bytes_stream()));
            *response.status_mut() = status;
            *response.headers_mut() = response_headers;
            with_security_headers(response)
        }
        Err(error) => dev_proxy_error_response(&config.vite_origin, &error.to_string()),
    }
}

enum HostHeader {
    Preserve,
    Remove,
}

fn end_to_end_headers(headers: &HeaderMap, host_header: HostHeader) -> HeaderMap {
    let hop_by_hop_headers = hop_by_hop_header_names(headers);
    let mut filtered = HeaderMap::new();
    for (name, value) in headers {
        if hop_by_hop_headers.contains(name)
            || matches!(host_header, HostHeader::Remove) && name == HOST
        {
            continue;
        }
        filtered.append(name.clone(), value.clone());
    }
    filtered
}

fn hop_by_hop_header_names(headers: &HeaderMap) -> HashSet<HeaderName> {
    let mut names = [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    ]
    .into_iter()
    .map(HeaderName::from_static)
    .collect::<HashSet<_>>();

    for value in headers.get_all("connection") {
        let Ok(value) = value.to_str() else {
            continue;
        };
        for name in value
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
        {
            if let Ok(name) = HeaderName::from_bytes(name.as_bytes()) {
                names.insert(name);
            }
        }
    }

    names
}

fn dev_proxy_error_response(vite_origin: &str, error: &str) -> Response {
    let mut response = (
        StatusCode::BAD_GATEWAY,
        dev_proxy_error_page(vite_origin, error),
    )
        .into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("text/html"));
    with_security_headers(response)
}

fn dev_proxy_error_page(vite_origin: &str, error: &str) -> String {
    let error = capitalize_first_char(error);
    DEV_PROXY_ERROR_HTML
        .replace("/* {{CODEX_GUI_HOST_CSS}} */", DEV_PROXY_ERROR_CSS)
        .replace("{{CODEX_GUI_HOST_VITE_ORIGIN}}", &html_escape(vite_origin))
        .replace("{{CODEX_GUI_HOST_ERROR}}", &html_escape(&error))
}

fn capitalize_first_char(input: &str) -> String {
    let mut chars = input.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
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
    use axum::body::Body;
    use axum::http::Request;
    use axum::http::StatusCode;
    use pretty_assertions::assert_eq;
    use tokio::net::TcpListener;

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

    #[test]
    fn dev_proxy_error_page_capitalizes_error_sentence() {
        let page = super::dev_proxy_error_page(
            "http://127.0.0.1:5173",
            "error sending request for url (http://127.0.0.1:5173/)",
        );

        assert!(page.contains("Error sending request for url"));
        assert!(!page.contains("error sending request for url"));
    }

    #[tokio::test]
    async fn proxy_vite_returns_embedded_html_when_upstream_is_unavailable() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("port should be reserved");
        let vite_origin = format!(
            "http://{}?unsafe=<script>",
            listener
                .local_addr()
                .expect("local addr should be available")
        );
        drop(listener);

        let config = DevAssetProxyConfig { vite_origin };
        let request = Request::builder()
            .uri("/?threadId=test")
            .body(Body::empty())
            .expect("request should build");
        let response = super::proxy_vite(config, request).await;

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
        assert!(body.contains("?unsafe=&lt;script&gt;"));
        assert!(body.contains("Connection error"));
        assert!(!body.contains("{{CODEX_GUI_HOST_"));
    }
}
