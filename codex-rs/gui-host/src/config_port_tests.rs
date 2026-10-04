use super::*;
use pretty_assertions::assert_eq;

#[test]
fn configured_port_overrides_default() {
    assert_eq!(parse_port(Some(OsString::from("8080"))).unwrap(), 8080);
}

#[test]
fn missing_port_uses_default_and_zero_requests_an_ephemeral_port() {
    assert_eq!(parse_port(/*port*/ None).unwrap(), 80);
    for (value, expected) in [("0", 0), ("1", 1), ("65535", 65535)] {
        assert_eq!(parse_port(Some(OsString::from(value))).unwrap(), expected);
    }
}

#[test]
fn invalid_port_reports_configuration_error() {
    for value in ["", "-1", "65536", "8080.5", "http", " 8080", "8080 "] {
        let error = parse_port(Some(OsString::from(value))).expect_err("invalid port");
        assert!(error.to_string().contains("CODEX_GUI_PORT"), "{error:#}");
        assert!(error.to_string().contains("0 to 65535"), "{error:#}");
    }
}

#[cfg(unix)]
#[test]
fn non_unicode_port_reports_configuration_error() {
    use std::os::unix::ffi::OsStringExt;

    let error = parse_port(Some(OsString::from_vec(vec![0xff])))
        .expect_err("non-Unicode port must not use the default");
    assert!(error.to_string().contains("CODEX_GUI_PORT"), "{error:#}");
}
