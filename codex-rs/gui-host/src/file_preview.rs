use std::path::Component;
use std::sync::Arc;

use axum::extract::Query;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::http::StatusCode;
use axum::http::header;
use axum::response::IntoResponse;
use tokio::io::AsyncReadExt;

use crate::GuiBackend;
use crate::browser_contract::GuiFilePreviewParams;
use crate::browser_contract::MAX_UPLOAD_BYTES;
use crate::host::GuiHostState;

pub(crate) async fn preview<B: GuiBackend + Clone>(
    State(state): State<Arc<GuiHostState<B>>>,
    Query(params): Query<GuiFilePreviewParams>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok());
    let origin = headers
        .get(header::ORIGIN)
        .map(|value| value.to_str())
        .transpose()
        .map_err(|_| StatusCode::FORBIDDEN)?;
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    if token != Some(state.launch_token.as_str())
        || !host.is_some_and(|host| match origin {
            Some(origin) => crate::ws::validate_host_and_origin(
                &state.advertised_hosts,
                state.local_addr.port(),
                host,
                Some(origin),
            ),
            None => crate::host::is_advertised_host(
                &state.advertised_hosts,
                state.local_addr.port(),
                host,
            ),
        })
    {
        return Err(StatusCode::FORBIDDEN);
    }
    let path = params.path;
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        || !path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("codex-upload-"))
    {
        return Err(StatusCode::FORBIDDEN);
    }
    let temporary_root = tokio::fs::canonicalize(std::env::temp_dir())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let parent = path.parent().ok_or(StatusCode::FORBIDDEN)?;
    let parent = tokio::fs::canonicalize(parent)
        .await
        .map_err(|_| StatusCode::FORBIDDEN)?;
    if parent != temporary_root {
        return Err(StatusCode::FORBIDDEN);
    }
    let metadata = tokio::fs::symlink_metadata(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if !metadata.file_type().is_file() {
        return Err(StatusCode::FORBIDDEN);
    }
    let mut options = tokio::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    #[cfg(windows)]
    // FILE_FLAG_OPEN_REPARSE_POINT prevents following a replacement symlink.
    options.custom_flags(0x00200000);
    let file = options
        .open(parent.join(path.file_name().ok_or(StatusCode::FORBIDDEN)?))
        .await
        .map_err(|_| StatusCode::FORBIDDEN)?;
    let metadata = file
        .metadata()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !metadata.file_type().is_file() {
        return Err(StatusCode::FORBIDDEN);
    }
    if metadata.len() > MAX_UPLOAD_BYTES as u64 {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let mut bytes = Vec::new();
    file.take(MAX_UPLOAD_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if bytes.len() > MAX_UPLOAD_BYTES {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let content_type = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
    };
    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, "no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        bytes,
    ))
}
