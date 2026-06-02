use std::net::SocketAddr;

use crate::LaunchToken;

pub fn launch_url_for_thread(
    addr: SocketAddr,
    thread_id: impl std::fmt::Display,
    token: &LaunchToken,
) -> String {
    let thread_id = thread_id.to_string();
    let thread_id = urlencoding::encode(&thread_id);
    let port = addr.port();
    format!(
        "http://127.0.0.1:{port}/?threadId={thread_id}#token={}",
        token.as_str()
    )
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use super::*;
    use crate::LaunchToken;

    #[test]
    fn launch_url_uses_thread_query_and_fragment_token() {
        let addr: SocketAddr = "127.0.0.1:3456".parse().expect("addr should parse");
        let token = LaunchToken::from_test_value("test-token");

        assert_eq!(
            launch_url_for_thread(addr, "thread abc/#", &token),
            "http://127.0.0.1:3456/?threadId=thread%20abc%2F%23#token=test-token"
        );
    }
}
