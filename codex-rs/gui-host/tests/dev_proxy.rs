use std::sync::Arc;
use std::sync::Mutex;

use axum::Router;
use axum::body::Body;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::http::HeaderName;
use axum::http::HeaderValue;
use axum::http::Method;
use axum::http::Request;
use axum::http::Response;
use axum::http::StatusCode;
use axum::routing::any;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiBackend;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiHostMode;
use pretty_assertions::assert_eq;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

#[derive(Clone)]
struct NoopBackend;

impl GuiBackend for NoopBackend {
    async fn connect(&self, _connection: AuthenticatedGuiConnection) -> anyhow::Result<()> {
        Ok(())
    }
}

#[derive(Clone, Debug)]
struct CapturedRequest {
    method: Method,
    path_and_query: String,
    headers: HeaderMap,
}

#[derive(Clone, Default)]
struct UpstreamState {
    requests: Arc<Mutex<Vec<CapturedRequest>>>,
}

#[tokio::test]
async fn proxy_preserves_method_path_query_and_end_to_end_request_headers() {
    let servers = TestServers::start().await;
    let client = reqwest::Client::new();

    let get_response = client
        .get(format!("{}/module.js?raw&version=7", servers.gui_origin))
        .header("accept-encoding", "gzip")
        .header("if-none-match", "\"module-v7\"")
        .header("if-modified-since", "Wed, 21 Oct 2015 07:28:00 GMT")
        .header("range", "bytes=10-19")
        .send()
        .await
        .expect("GET through GUI host should succeed");
    assert_eq!(get_response.status(), StatusCode::OK);

    let head_response = client
        .head(format!("{}/module.js?raw&version=8", servers.gui_origin))
        .send()
        .await
        .expect("HEAD through GUI host should succeed");
    assert_eq!(head_response.status(), StatusCode::OK);
    assert_eq!(
        head_response
            .bytes()
            .await
            .expect("HEAD body should be readable"),
        b"".as_slice()
    );

    let requests = servers.requests();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0].method, Method::GET);
    assert_eq!(requests[0].path_and_query, "/module.js?raw&version=7");
    assert_eq!(requests[0].headers["accept-encoding"], "gzip");
    assert_eq!(requests[0].headers["if-none-match"], "\"module-v7\"");
    assert_eq!(
        requests[0].headers["if-modified-since"],
        "Wed, 21 Oct 2015 07:28:00 GMT"
    );
    assert_eq!(requests[0].headers["range"], "bytes=10-19");
    assert_eq!(requests[1].method, Method::HEAD);
    assert_eq!(requests[1].path_and_query, "/module.js?raw&version=8");

    servers.shutdown().await;
}

#[tokio::test]
async fn proxy_preserves_status_and_end_to_end_response_headers() {
    let servers = TestServers::start().await;

    let response = reqwest::get(format!("{}/response-metadata", servers.gui_origin))
        .await
        .expect("request through GUI host should succeed");

    assert_eq!(response.status(), StatusCode::CREATED);
    assert_eq!(response.headers()["content-type"], "text/javascript");
    assert_eq!(response.headers()["content-encoding"], "gzip");
    assert_eq!(response.headers()["vary"], "Accept-Encoding, Origin");
    assert_eq!(response.headers()["etag"], "\"asset-v1\"");
    assert_eq!(response.headers()["cache-control"], "public, max-age=60");
    assert_eq!(
        response.headers()["last-modified"],
        "Wed, 21 Oct 2015 07:28:00 GMT"
    );
    assert_eq!(response.headers()["content-range"], "bytes 0-9/20");

    servers.shutdown().await;
}

#[tokio::test]
async fn proxy_preserves_not_modified_and_partial_content_responses() {
    let servers = TestServers::start().await;
    let client = reqwest::Client::new();

    let not_modified = client
        .get(format!("{}/conditional", servers.gui_origin))
        .header("if-none-match", "\"current\"")
        .send()
        .await
        .expect("conditional request should succeed");
    assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED);
    assert_eq!(not_modified.headers()["etag"], "\"current\"");
    assert_eq!(
        not_modified
            .bytes()
            .await
            .expect("304 body should be readable"),
        b"".as_slice()
    );

    let partial = client
        .get(format!("{}/range", servers.gui_origin))
        .header("range", "bytes=5-9")
        .send()
        .await
        .expect("range request should succeed");
    assert_eq!(partial.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(partial.headers()["content-range"], "bytes 5-9/20");
    assert_eq!(
        partial
            .bytes()
            .await
            .expect("partial body should be readable"),
        b"56789".as_slice()
    );

    servers.shutdown().await;
}

#[tokio::test]
async fn proxy_filters_hop_by_hop_headers_in_both_directions() {
    let mut servers = RawTestServers::start().await;
    let client = reqwest::Client::new();

    let response = client
        .get(format!("{}/hop-by-hop", servers.gui_origin))
        .header("connection", "keep-alive, x-request-hop")
        .header("keep-alive", "timeout=5")
        .header("proxy-authenticate", "Basic realm=request")
        .header("proxy-authorization", "Basic request-secret")
        .header("te", "trailers")
        .header("trailer", "x-request-trailer")
        .header("upgrade", "websocket")
        .header("x-request-hop", "remove-me")
        .header("x-request-end-to-end", "preserve-me")
        .send()
        .await
        .expect("request through GUI host should succeed");

    assert_eq!(response.status(), StatusCode::OK);
    for name in [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "x-response-hop",
    ] {
        assert_eq!(response.headers().get(name), None, "unexpected {name}");
    }
    assert_eq!(response.headers()["x-response-end-to-end"], "preserve-me");

    let request = servers.request().await;
    assert_eq!(request.method, Method::GET);
    assert_eq!(request.path_and_query, "/hop-by-hop");
    for name in [
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "x-request-hop",
    ] {
        assert_eq!(request.headers.get(name), None, "unexpected {name}");
    }
    assert_eq!(request.headers["x-request-end-to-end"], "preserve-me");
    assert_eq!(request.headers["host"], servers.upstream_authority);

    servers.shutdown().await;
}

struct RawTestServers {
    gui_handle: GuiHostHandle,
    gui_origin: String,
    upstream_authority: String,
    upstream_task: JoinHandle<()>,
    request_rx: Option<oneshot::Receiver<CapturedRequest>>,
}

impl RawTestServers {
    async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("raw fake upstream should bind");
        let upstream_addr = listener
            .local_addr()
            .expect("raw fake upstream address should be available");
        let (request_tx, request_rx) = oneshot::channel();
        let upstream_task = tokio::spawn(async move {
            let (mut stream, _) = listener
                .accept()
                .await
                .expect("raw fake upstream should accept a request");
            let request = read_raw_request(&mut stream).await;
            request_tx
                .send(request)
                .expect("raw request receiver should stay open");
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\n\
Connection: keep-alive, x-response-hop\r\n\
Keep-Alive: timeout=5\r\n\
Proxy-Authenticate: Basic realm=response\r\n\
Proxy-Authorization: Basic response-secret\r\n\
TE: trailers\r\n\
Trailer: x-response-trailer\r\n\
Transfer-Encoding: chunked\r\n\
Upgrade: websocket\r\n\
X-Response-Hop: remove-me\r\n\
X-Response-End-To-End: preserve-me\r\n\
\r\n\
b\r\n\
hop headers\r\n\
0\r\n\
\r\n",
                )
                .await
                .expect("raw fake upstream response should be written");
        });

        let gui_handle = GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: format!("http://{upstream_addr}"),
                }),
            },
            NoopBackend,
        )
        .await
        .expect("GUI host should start");
        let gui_origin = local_origin(&gui_handle);

        Self {
            gui_handle,
            gui_origin,
            upstream_authority: upstream_addr.to_string(),
            upstream_task,
            request_rx: Some(request_rx),
        }
    }

    async fn request(&mut self) -> CapturedRequest {
        self.request_rx
            .take()
            .expect("raw request should only be read once")
            .await
            .expect("raw fake upstream should capture a request")
    }

    async fn shutdown(self) {
        self.gui_handle.shutdown().await;
        self.upstream_task.abort();
    }
}

async fn read_raw_request(stream: &mut tokio::net::TcpStream) -> CapturedRequest {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 1024];
    while !bytes.windows(4).any(|window| window == b"\r\n\r\n") {
        let read = stream
            .read(&mut buffer)
            .await
            .expect("raw request should be readable");
        assert!(read > 0, "raw request should contain complete headers");
        bytes.extend_from_slice(&buffer[..read]);
        assert!(
            bytes.len() <= 64 * 1024,
            "raw request headers are too large"
        );
    }

    let request = std::str::from_utf8(&bytes).expect("raw request should be UTF-8");
    let mut lines = request.split("\r\n");
    let mut request_line = lines
        .next()
        .expect("raw request should contain a request line")
        .split_whitespace();
    let method = request_line
        .next()
        .expect("raw request should contain a method")
        .parse::<Method>()
        .expect("raw request method should be valid");
    let path_and_query = request_line
        .next()
        .expect("raw request should contain a target")
        .to_string();
    let mut headers = HeaderMap::new();
    for line in lines.take_while(|line| !line.is_empty()) {
        let (name, value) = line
            .split_once(':')
            .expect("raw request header should contain a colon");
        headers.append(
            HeaderName::from_bytes(name.as_bytes()).expect("header name should be valid"),
            HeaderValue::from_str(value.trim()).expect("header value should be valid"),
        );
    }

    CapturedRequest {
        method,
        path_and_query,
        headers,
    }
}

struct TestServers {
    gui_handle: GuiHostHandle,
    gui_origin: String,
    upstream_task: JoinHandle<()>,
    upstream_state: UpstreamState,
}

impl TestServers {
    async fn start() -> Self {
        let upstream_state = UpstreamState::default();
        let app = Router::new()
            .fallback(any(upstream_handler))
            .with_state(upstream_state.clone());
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("fake upstream should bind");
        let upstream_addr = listener
            .local_addr()
            .expect("fake upstream address should be available");
        let upstream_task = tokio::spawn(async move {
            axum::serve(listener, app)
                .await
                .expect("fake upstream should serve");
        });

        let gui_handle = GuiHost::start(
            GuiHostConfig {
                mode: GuiHostMode::Dev(DevAssetProxyConfig {
                    vite_origin: format!("http://{upstream_addr}"),
                }),
            },
            NoopBackend,
        )
        .await
        .expect("GUI host should start");
        let gui_origin = local_origin(&gui_handle);

        Self {
            gui_handle,
            gui_origin,
            upstream_task,
            upstream_state,
        }
    }

    fn requests(&self) -> Vec<CapturedRequest> {
        self.upstream_state
            .requests
            .lock()
            .expect("request log mutex should not be poisoned")
            .clone()
    }

    async fn shutdown(self) {
        self.gui_handle.shutdown().await;
        self.upstream_task.abort();
    }
}

async fn upstream_handler(
    State(state): State<UpstreamState>,
    request: Request<Body>,
) -> Response<Body> {
    let path = request.uri().path().to_string();
    state
        .requests
        .lock()
        .expect("request log mutex should not be poisoned")
        .push(CapturedRequest {
            method: request.method().clone(),
            path_and_query: request
                .uri()
                .path_and_query()
                .expect("upstream request should have a path")
                .as_str()
                .to_string(),
            headers: request.headers().clone(),
        });

    match path.as_str() {
        "/response-metadata" => Response::builder()
            .status(StatusCode::CREATED)
            .header("content-type", "text/javascript")
            .header("content-encoding", "gzip")
            .header("vary", "Accept-Encoding, Origin")
            .header("etag", "\"asset-v1\"")
            .header("cache-control", "public, max-age=60")
            .header("last-modified", "Wed, 21 Oct 2015 07:28:00 GMT")
            .header("content-range", "bytes 0-9/20")
            .body(Body::from("metadata"))
            .expect("metadata response should build"),
        "/conditional" => Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header("etag", "\"current\"")
            .body(Body::from("must not reach client"))
            .expect("conditional response should build"),
        "/range" => Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header("content-range", "bytes 5-9/20")
            .body(Body::from("56789"))
            .expect("range response should build"),
        _ => Response::new(Body::from("upstream body")),
    }
}

fn local_origin(handle: &GuiHostHandle) -> String {
    let url = handle.launch_url_for_thread("test-thread");
    match url.split("/?").next() {
        Some(origin) => origin.to_string(),
        None => panic!("launch URL should include query"),
    }
}
