use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::Query;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::http::StatusCode;
use axum::http::header;
use futures::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::GuiBackend;
use crate::browser_contract::GuiUploadParams;
use crate::browser_contract::MAX_UPLOAD_BYTES;
use crate::host::GuiHostState;

pub(crate) async fn upload<B: GuiBackend + Clone>(
    State(state): State<Arc<GuiHostState<B>>>,
    Query(params): Query<GuiUploadParams>,
    headers: HeaderMap,
    body: Body,
) -> Result<(StatusCode, [(header::HeaderName, &'static str); 1], String), StatusCode> {
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok());
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if token != Some(state.launch_token.as_str())
        || !host.is_some_and(|host| {
            crate::ws::validate_host_and_origin(
                &state.advertised_hosts,
                state.local_addr.port(),
                host,
                origin,
            )
        })
    {
        return Err(StatusCode::FORBIDDEN);
    }
    // Keep only a portable extension, never a client-supplied directory or basename.
    let suffix = Path::new(&params.filename)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 32
                && value.bytes().all(|b| b.is_ascii_alphanumeric())
        })
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let temporary = tokio::task::spawn_blocking(move || {
        tempfile::Builder::new()
            .prefix("codex-upload-")
            .suffix(&suffix)
            .tempfile()
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let (file, path) = temporary.into_parts();
    let response_path = path
        .to_str()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .to_owned();
    let mut file = tokio::fs::File::from_std(file);
    let mut stream = body.into_data_stream();
    let mut total = 0usize;
    loop {
        let chunk = tokio::select! {
            biased;
            _ = state.shutdown.cancelled() => return Err(StatusCode::SERVICE_UNAVAILABLE),
            chunk = stream.next() => chunk,
        };
        let Some(chunk) = chunk else { break };
        let chunk = chunk.map_err(|_| StatusCode::BAD_REQUEST)?;
        if chunk.len() > MAX_UPLOAD_BYTES - total {
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }
        total += chunk.len();
        file.write_all(&chunk)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    file.flush()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    drop(file);
    // Until keep succeeds, dropping TempPath removes any incomplete upload.
    path.keep().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((
        StatusCode::CREATED,
        [(header::CACHE_CONTROL, "no-store")],
        response_path,
    ))
}
