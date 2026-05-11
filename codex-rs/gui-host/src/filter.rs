pub fn is_allowed_client_request_method(method: &str) -> bool {
    matches!(
        method,
        "initialize" | "thread/projection/attach" | "thread/projection/detach"
    )
}

pub fn is_allowed_client_notification_method(_method: &str) -> bool {
    false
}

pub fn is_allowed_server_notification_method(method: &str) -> bool {
    matches!(method, "thread/projection/event")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_allowlist_contains_only_projection_bootstrap_requests() {
        assert!(is_allowed_client_request_method("initialize"));
        assert!(is_allowed_client_request_method("thread/projection/attach"));
        assert!(is_allowed_client_request_method("thread/projection/detach"));
        assert!(!is_allowed_client_request_method("thread/list"));
        assert!(!is_allowed_client_request_method("gui/authenticate"));
    }

    #[test]
    fn server_notification_allowlist_contains_only_projection_event() {
        assert!(is_allowed_server_notification_method(
            "thread/projection/event"
        ));
        assert!(!is_allowed_server_notification_method("thread/updated"));
        assert!(!is_allowed_server_notification_method("session/configured"));
    }

    #[test]
    fn client_notifications_are_rejected() {
        assert!(!is_allowed_client_notification_method("initialized"));
    }
}
