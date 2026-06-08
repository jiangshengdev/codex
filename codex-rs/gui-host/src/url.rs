use std::net::SocketAddr;

use crate::LaunchToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuiLaunchUrlKind {
    Local,
    Lan,
    Vpn,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdvertisedHost {
    pub kind: GuiLaunchUrlKind,
    pub label: String,
    pub host: String,
}

impl AdvertisedHost {
    pub fn new(kind: GuiLaunchUrlKind, label: impl Into<String>, host: impl Into<String>) -> Self {
        Self {
            kind,
            label: label.into(),
            host: host.into(),
        }
    }

    pub(crate) fn authority(&self, port: u16) -> String {
        format!("{}:{port}", host_for_url(&self.host))
    }

    pub(crate) fn origin(&self, port: u16) -> String {
        format!("http://{}", self.authority(port))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrlEntry {
    pub kind: GuiLaunchUrlKind,
    pub label: String,
    pub url: String,
}

impl GuiLaunchUrlEntry {
    pub fn new(kind: GuiLaunchUrlKind, label: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            kind,
            label: label.into(),
            url: url.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiLaunchUrls {
    pub entries: Vec<GuiLaunchUrlEntry>,
}

pub fn launch_url_for_thread(
    addr: SocketAddr,
    thread_id: impl std::fmt::Display,
    token: &LaunchToken,
) -> String {
    let hosts = [AdvertisedHost::new(
        GuiLaunchUrlKind::Local,
        "Local",
        "127.0.0.1",
    )];
    launch_urls_for_thread(addr.port(), &hosts, thread_id, token)
        .entries
        .into_iter()
        .next()
        .expect("local host should always produce a launch URL")
        .url
}

pub fn launch_urls_for_thread(
    port: u16,
    hosts: &[AdvertisedHost],
    thread_id: impl std::fmt::Display,
    token: &LaunchToken,
) -> GuiLaunchUrls {
    let thread_id = thread_id.to_string();
    let thread_id = urlencoding::encode(&thread_id);
    let entries = hosts
        .iter()
        .map(|host| {
            GuiLaunchUrlEntry::new(
                host.kind,
                host.label.clone(),
                format!(
                    "http://{}:{port}/?threadId={thread_id}#token={}",
                    host_for_url(&host.host),
                    token.as_str()
                ),
            )
        })
        .collect();
    GuiLaunchUrls { entries }
}

fn host_for_url(host: &str) -> String {
    if host.parse::<std::net::Ipv6Addr>().is_ok() {
        format!("[{host}]")
    } else {
        host.to_string()
    }
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

    #[test]
    fn launch_urls_use_advertised_hosts_in_order() {
        let token = LaunchToken::from_test_value("test-token");
        let hosts = vec![
            AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
            AdvertisedHost::new(GuiLaunchUrlKind::Lan, "LAN", "192.168.3.165"),
            AdvertisedHost::new(GuiLaunchUrlKind::Vpn, "VPN", "100.88.28.119"),
        ];

        let urls = launch_urls_for_thread(/*port*/ 4567, &hosts, "thread abc/#", &token);

        assert_eq!(
            urls.entries,
            vec![
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Local,
                    "Local",
                    "http://127.0.0.1:4567/?threadId=thread%20abc%2F%23#token=test-token",
                ),
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Lan,
                    "LAN",
                    "http://192.168.3.165:4567/?threadId=thread%20abc%2F%23#token=test-token",
                ),
                GuiLaunchUrlEntry::new(
                    GuiLaunchUrlKind::Vpn,
                    "VPN",
                    "http://100.88.28.119:4567/?threadId=thread%20abc%2F%23#token=test-token",
                ),
            ]
        );
    }
}
