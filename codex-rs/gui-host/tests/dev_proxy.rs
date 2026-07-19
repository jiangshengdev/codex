use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

use anyhow::Context;
use anyhow::Result;
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
use axum::http::header::CACHE_CONTROL;
use axum::http::header::CONTENT_ENCODING;
use axum::http::header::CONTENT_RANGE;
use axum::http::header::CONTENT_TYPE;
use axum::http::header::ETAG;
use axum::http::header::LAST_MODIFIED;
use axum::http::header::VARY;
use axum::routing::any;
use codex_gui_host::AuthenticatedGuiConnection;
use codex_gui_host::DevAssetProxyConfig;
use codex_gui_host::GuiBackend;
use codex_gui_host::GuiHost;
use codex_gui_host::GuiHostConfig;
use codex_gui_host::GuiHostHandle;
use codex_gui_host::GuiHostMode;
use futures::StreamExt;
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
async fn proxy_preserves_method_path_query_and_end_to_end_request_headers() -> Result<()> {
    let servers = TestServers::start().await?;
    let test_result = async {
        let client = reqwest::Client::new();

        let get_response = client
            .get(format!("{}/module.js?raw&version=7", servers.gui_origin))
            .header("accept-encoding", "gzip")
            .header("if-none-match", "\"module-v7\"")
            .header("if-modified-since", "Wed, 21 Oct 2015 07:28:00 GMT")
            .header("range", "bytes=10-19")
            .send()
            .await
            .context("GET through GUI host should succeed")?;
        assert_eq!(get_response.status(), StatusCode::OK);

        let head_response = client
            .head(format!("{}/module.js?raw&version=8", servers.gui_origin))
            .send()
            .await
            .context("HEAD through GUI host should succeed")?;
        assert_eq!(head_response.status(), StatusCode::OK);
        assert_eq!(
            head_response
                .bytes()
                .await
                .context("HEAD body should be readable")?,
            b"".as_slice()
        );

        let requests = servers.requests()?;
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
        Ok(())
    }
    .await;

    let shutdown_result = servers.shutdown().await;
    combine_test_and_cleanup(test_result, shutdown_result, "server shutdown")
}

#[tokio::test]
async fn proxy_preserves_status_and_end_to_end_response_headers() -> Result<()> {
    let servers = TestServers::start().await?;
    let test_result = async {
        let response = reqwest::get(format!("{}/response-metadata", servers.gui_origin))
            .await
            .context("request through GUI host should succeed")?;

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
        Ok(())
    }
    .await;

    let shutdown_result = servers.shutdown().await;
    combine_test_and_cleanup(test_result, shutdown_result, "server shutdown")
}

#[tokio::test]
async fn proxy_preserves_not_modified_and_partial_content_responses() -> Result<()> {
    let servers = TestServers::start().await?;
    let test_result = async {
        let client = reqwest::Client::new();

        let not_modified = client
            .get(format!("{}/conditional", servers.gui_origin))
            .header("if-none-match", "\"current\"")
            .send()
            .await
            .context("conditional request should succeed")?;
        assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED);
        assert_eq!(not_modified.headers()["etag"], "\"current\"");
        assert_eq!(
            not_modified
                .bytes()
                .await
                .context("304 body should be readable")?,
            b"".as_slice()
        );

        let partial = client
            .get(format!("{}/range", servers.gui_origin))
            .header("range", "bytes=5-9")
            .send()
            .await
            .context("range request should succeed")?;
        assert_eq!(partial.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(partial.headers()["content-range"], "bytes 5-9/20");
        assert_eq!(
            partial
                .bytes()
                .await
                .context("partial body should be readable")?,
            b"56789".as_slice()
        );
        Ok(())
    }
    .await;

    let shutdown_result = servers.shutdown().await;
    combine_test_and_cleanup(test_result, shutdown_result, "server shutdown")
}

#[tokio::test]
async fn proxy_filters_hop_by_hop_headers_in_both_directions() -> Result<()> {
    let mut servers = RawTestServers::start().await?;
    let test_result = async {
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
            .context("request through GUI host should succeed")?;

        assert_eq!(response.status(), StatusCode::OK);
        for name in [
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "upgrade",
            "x-response-hop",
        ] {
            assert_eq!(response.headers().get(name), None, "unexpected {name}");
        }
        // Hyper generates chunked framing for this downstream hop because the proxied body is a
        // stream with no known length; this does not indicate that the upstream header was copied.
        assert_eq!(response.headers()["transfer-encoding"], "chunked");
        assert_eq!(response.headers()["x-response-end-to-end"], "preserve-me");

        let request = servers.request().await?;
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
        Ok(())
    }
    .await;

    let shutdown_result = servers.shutdown().await;
    combine_test_and_cleanup(test_result, shutdown_result, "server shutdown")
}

#[tokio::test]
async fn proxy_streams_first_chunk_before_upstream_completes() -> Result<()> {
    let mut servers = StreamingTestServers::start().await?;
    let gui_url = format!("{}/stream", servers.gui_origin);
    let mut client_task = tokio::spawn(async move {
        let response = reqwest::get(gui_url)
            .await
            .context("streaming request should succeed")?;
        if response.status() != StatusCode::OK {
            anyhow::bail!(
                "streaming response should be 200, got {}",
                response.status()
            );
        }
        let mut body = response.bytes_stream();
        let first = body
            .next()
            .await
            .context("streaming response should contain a first chunk")?
            .context("first response chunk should be readable")?;
        Ok((first, body))
    });

    let first_chunk = async {
        tokio::time::timeout(Duration::from_secs(5), servers.wait_for_first_chunk_sent())
            .await
            .context("fake upstream should send its first chunk before the timeout")??;
        tokio::time::timeout(Duration::from_secs(2), &mut client_task)
            .await
            .context("first proxied chunk was not received before upstream completion")?
            .context("streaming client task should complete")?
    }
    .await;
    let release_result = servers.release_upstream();
    let first_chunk = combine_test_and_cleanup(
        first_chunk,
        release_result,
        "releasing the streaming upstream",
    );

    let test_result = async {
        let (first, mut body) = first_chunk?;
        let mut remainder = Vec::new();
        while let Some(chunk) = body.next().await {
            let chunk = chunk.context("remaining response should be readable")?;
            remainder.extend_from_slice(&chunk);
        }
        Ok((first, remainder))
    }
    .await;

    if !client_task.is_finished() {
        client_task.abort();
    }
    let shutdown_result = servers.shutdown().await;
    combine_test_and_cleanup(test_result, shutdown_result, "server shutdown").map(
        |(first, remainder)| {
            assert_eq!(first, b"first".as_slice());
            assert_eq!(remainder, b"-second".as_slice());
        },
    )
}

struct StreamingTestServers {
    gui_handle: GuiHostHandle,
    gui_origin: String,
    upstream_task: JoinHandle<Result<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    first_chunk_rx: Option<oneshot::Receiver<()>>,
    release_tx: Option<oneshot::Sender<()>>,
}

impl StreamingTestServers {
    async fn start() -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .context("streaming fake upstream should bind")?;
        let upstream_addr = listener
            .local_addr()
            .context("streaming fake upstream address should be available")?;
        let (first_chunk_tx, first_chunk_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let upstream_task = tokio::spawn(async move {
            let serve = async move {
                let (mut stream, _) = listener
                    .accept()
                    .await
                    .context("streaming fake upstream should accept a request")?;
                let _request = read_raw_request(&mut stream).await?;
                stream
                    .write_all(
                        b"HTTP/1.1 200 OK\r\n\
Content-Type: text/plain\r\n\
Transfer-Encoding: chunked\r\n\
\r\n\
5\r\n\
first\r\n",
                    )
                    .await
                    .context("first response chunk should be written")?;
                stream
                    .flush()
                    .await
                    .context("first response chunk should be flushed")?;
                first_chunk_tx
                    .send(())
                    .map_err(|_| anyhow::anyhow!("first chunk receiver should stay open"))?;
                release_rx
                    .await
                    .context("streaming test should release the remaining response")?;
                stream
                    .write_all(b"7\r\n-second\r\n0\r\n\r\n")
                    .await
                    .context("remaining response should be written")?;
                Ok(())
            };
            tokio::select! {
                biased;
                result = serve => result,
                _ = shutdown_rx => Ok(()),
            }
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
        .context("GUI host should start")?;
        let gui_origin = local_origin(&gui_handle)?;

        Ok(Self {
            gui_handle,
            gui_origin,
            upstream_task,
            shutdown_tx: Some(shutdown_tx),
            first_chunk_rx: Some(first_chunk_rx),
            release_tx: Some(release_tx),
        })
    }

    async fn wait_for_first_chunk_sent(&mut self) -> Result<()> {
        self.first_chunk_rx
            .take()
            .context("first chunk notification should only be awaited once")?
            .await
            .context("streaming fake upstream should send the first chunk")
    }

    fn release_upstream(&mut self) -> Result<()> {
        if let Some(release_tx) = self.release_tx.take() {
            release_tx
                .send(())
                .map_err(|_| anyhow::anyhow!("streaming upstream should wait for release"))?;
        }
        Ok(())
    }

    async fn shutdown(mut self) -> Result<()> {
        let release_result = self.release_upstream();
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
        self.gui_handle.shutdown().await;
        let shutdown_result = self
            .upstream_task
            .await
            .context("streaming fake upstream task should join")
            .and_then(|result| result.context("streaming fake upstream should stop"));
        combine_test_and_cleanup(
            release_result,
            shutdown_result,
            "stopping the streaming upstream",
        )
    }
}

struct RawTestServers {
    gui_handle: GuiHostHandle,
    gui_origin: String,
    upstream_authority: String,
    upstream_task: JoinHandle<Result<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    request_rx: Option<oneshot::Receiver<CapturedRequest>>,
}

impl RawTestServers {
    async fn start() -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .context("raw fake upstream should bind")?;
        let upstream_addr = listener
            .local_addr()
            .context("raw fake upstream address should be available")?;
        let (request_tx, request_rx) = oneshot::channel();
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let upstream_task = tokio::spawn(async move {
            let serve = async move {
                let (mut stream, _) = listener
                    .accept()
                    .await
                    .context("raw fake upstream should accept a request")?;
                let request = read_raw_request(&mut stream).await?;
                request_tx
                    .send(request)
                    .map_err(|_| anyhow::anyhow!("raw request receiver should stay open"))?;
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
                    .context("raw fake upstream response should be written")?;
                Ok(())
            };
            tokio::select! {
                biased;
                result = serve => result,
                _ = shutdown_rx => Ok(()),
            }
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
        .context("GUI host should start")?;
        let gui_origin = local_origin(&gui_handle)?;

        Ok(Self {
            gui_handle,
            gui_origin,
            upstream_authority: upstream_addr.to_string(),
            upstream_task,
            shutdown_tx: Some(shutdown_tx),
            request_rx: Some(request_rx),
        })
    }

    async fn request(&mut self) -> Result<CapturedRequest> {
        self.request_rx
            .take()
            .context("raw request should only be read once")?
            .await
            .context("raw fake upstream should capture a request")
    }

    async fn shutdown(mut self) -> Result<()> {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
        self.gui_handle.shutdown().await;
        self.upstream_task
            .await
            .context("raw fake upstream task should join")??;
        Ok(())
    }
}

async fn read_raw_request(stream: &mut tokio::net::TcpStream) -> Result<CapturedRequest> {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 1024];
    while !bytes.windows(4).any(|window| window == b"\r\n\r\n") {
        let read = stream
            .read(&mut buffer)
            .await
            .context("raw request should be readable")?;
        if read == 0 {
            anyhow::bail!("raw request should contain complete headers");
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() > 64 * 1024 {
            anyhow::bail!("raw request headers are too large");
        }
    }

    let request = std::str::from_utf8(&bytes).context("raw request should be UTF-8")?;
    let mut lines = request.split("\r\n");
    let mut request_line = lines
        .next()
        .context("raw request should contain a request line")?
        .split_whitespace();
    let method = request_line
        .next()
        .context("raw request should contain a method")?
        .parse::<Method>()
        .context("raw request method should be valid")?;
    let path_and_query = request_line
        .next()
        .context("raw request should contain a target")?
        .to_string();
    let mut headers = HeaderMap::new();
    for line in lines.take_while(|line| !line.is_empty()) {
        let (name, value) = line
            .split_once(':')
            .with_context(|| format!("raw request header should contain a colon: {line}"))?;
        headers.append(
            HeaderName::from_bytes(name.as_bytes()).context("header name should be valid")?,
            HeaderValue::from_str(value.trim()).context("header value should be valid")?,
        );
    }

    Ok(CapturedRequest {
        method,
        path_and_query,
        headers,
    })
}

struct TestServers {
    gui_handle: GuiHostHandle,
    gui_origin: String,
    upstream_task: JoinHandle<Result<()>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    upstream_state: UpstreamState,
}

impl TestServers {
    async fn start() -> Result<Self> {
        let upstream_state = UpstreamState::default();
        let app = Router::new()
            .fallback(any(upstream_handler))
            .with_state(upstream_state.clone());
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .context("fake upstream should bind")?;
        let upstream_addr = listener
            .local_addr()
            .context("fake upstream address should be available")?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let upstream_task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .context("fake upstream should serve")
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
        .context("GUI host should start")?;
        let gui_origin = local_origin(&gui_handle)?;

        Ok(Self {
            gui_handle,
            gui_origin,
            upstream_task,
            shutdown_tx: Some(shutdown_tx),
            upstream_state,
        })
    }

    fn requests(&self) -> Result<Vec<CapturedRequest>> {
        self.upstream_state
            .requests
            .lock()
            .map(|requests| requests.clone())
            .map_err(|_| anyhow::anyhow!("request log mutex should not be poisoned"))
    }

    async fn shutdown(mut self) -> Result<()> {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
        self.gui_handle.shutdown().await;
        self.upstream_task
            .await
            .context("fake upstream task should join")??;
        Ok(())
    }
}

async fn upstream_handler(
    State(state): State<UpstreamState>,
    request: Request<Body>,
) -> Response<Body> {
    let path = request.uri().path().to_string();
    let path_and_query = request
        .uri()
        .path_and_query()
        .map_or_else(|| request.uri().path(), |value| value.as_str())
        .to_string();
    let captured_request = CapturedRequest {
        method: request.method().clone(),
        path_and_query,
        headers: request.headers().clone(),
    };
    match state.requests.lock() {
        Ok(mut requests) => requests.push(captured_request),
        Err(_) => {
            return static_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                [],
                "request log mutex should not be poisoned",
            );
        }
    }

    match path.as_str() {
        "/response-metadata" => static_response(
            StatusCode::CREATED,
            [
                (CONTENT_TYPE, HeaderValue::from_static("text/javascript")),
                (CONTENT_ENCODING, HeaderValue::from_static("gzip")),
                (VARY, HeaderValue::from_static("Accept-Encoding, Origin")),
                (ETAG, HeaderValue::from_static("\"asset-v1\"")),
                (
                    CACHE_CONTROL,
                    HeaderValue::from_static("public, max-age=60"),
                ),
                (
                    LAST_MODIFIED,
                    HeaderValue::from_static("Wed, 21 Oct 2015 07:28:00 GMT"),
                ),
                (CONTENT_RANGE, HeaderValue::from_static("bytes 0-9/20")),
            ],
            "metadata",
        ),
        "/conditional" => static_response(
            StatusCode::NOT_MODIFIED,
            [(ETAG, HeaderValue::from_static("\"current\""))],
            "must not reach client",
        ),
        "/range" => static_response(
            StatusCode::PARTIAL_CONTENT,
            [(CONTENT_RANGE, HeaderValue::from_static("bytes 5-9/20"))],
            "56789",
        ),
        _ => Response::new(Body::from("upstream body")),
    }
}

fn static_response<const N: usize>(
    status: StatusCode,
    headers: [(HeaderName, HeaderValue); N],
    body: &'static str,
) -> Response<Body> {
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = status;
    for (name, value) in headers {
        response.headers_mut().insert(name, value);
    }
    response
}

fn combine_test_and_cleanup<T>(
    test_result: Result<T>,
    cleanup_result: Result<()>,
    cleanup_name: &str,
) -> Result<T> {
    match (test_result, cleanup_result) {
        (Ok(value), Ok(())) => Ok(value),
        (Ok(_), Err(cleanup_error)) => Err(cleanup_error),
        (Err(test_error), Ok(())) => Err(test_error),
        (Err(test_error), Err(cleanup_error)) => {
            Err(test_error.context(format!("{cleanup_name} also failed: {cleanup_error:#}")))
        }
    }
}

fn local_origin(handle: &GuiHostHandle) -> Result<String> {
    let url = handle.launch_url_for_thread("test-thread");
    let (origin, _) = url
        .split_once("/?")
        .context("launch URL should include query")?;
    Ok(origin.to_string())
}
