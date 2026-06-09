use std::net::IpAddr;
use std::net::Ipv4Addr;
use std::net::Ipv6Addr;

use crate::AdvertisedHost;
use crate::GuiLaunchUrlKind;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InterfaceAddress {
    pub(crate) name: String,
    pub(crate) ip: IpAddr,
    pub(crate) is_default_route: bool,
    pub(crate) is_active: bool,
    pub(crate) is_loopback: bool,
}

pub(crate) fn advertised_hosts_from_interfaces(
    interfaces: &[InterfaceAddress],
    include_ipv6: bool,
) -> Vec<AdvertisedHost> {
    let mut hosts = vec![local_host()];

    if let Some(lan) = select_lan(interfaces) {
        hosts.push(AdvertisedHost::new(
            GuiLaunchUrlKind::Lan,
            "LAN",
            lan.to_string(),
        ));
    }

    if let Some(vpn) = select_vpn(interfaces, include_ipv6) {
        hosts.push(AdvertisedHost::new(
            GuiLaunchUrlKind::Vpn,
            "VPN",
            vpn.to_string(),
        ));
    }

    hosts
}

pub(crate) fn discover_advertised_hosts(include_ipv6: bool) -> Vec<AdvertisedHost> {
    advertised_hosts_from_interfaces(&collect_interface_addresses(), include_ipv6)
}

fn local_host() -> AdvertisedHost {
    AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1")
}

fn select_lan(interfaces: &[InterfaceAddress]) -> Option<IpAddr> {
    interfaces
        .iter()
        .find(|interface| interface.is_default_route && is_lan_candidate(interface))
        .or_else(|| {
            interfaces
                .iter()
                .find(|interface| is_lan_candidate(interface))
        })
        .map(|interface| interface.ip)
}

fn select_vpn(interfaces: &[InterfaceAddress], include_ipv6: bool) -> Option<IpAddr> {
    interfaces
        .iter()
        .find(|interface| is_cgnat_candidate(interface))
        .or_else(|| {
            include_ipv6.then(|| {
                interfaces
                    .iter()
                    .find(|interface| is_ula_candidate(interface))
            })?
        })
        .map(|interface| interface.ip)
}

fn is_lan_candidate(interface: &InterfaceAddress) -> bool {
    is_eligible(interface) && matches!(interface.ip, IpAddr::V4(ip) if is_rfc1918_ipv4(ip))
}

fn is_cgnat_candidate(interface: &InterfaceAddress) -> bool {
    is_eligible(interface) && matches!(interface.ip, IpAddr::V4(ip) if is_cgnat_ipv4(ip))
}

fn is_ula_candidate(interface: &InterfaceAddress) -> bool {
    is_eligible(interface) && matches!(interface.ip, IpAddr::V6(ip) if is_ula_ipv6(ip))
}

fn is_eligible(interface: &InterfaceAddress) -> bool {
    interface.is_active
        && !interface.is_loopback
        && !interface.ip.is_loopback()
        && !is_link_local(interface.ip)
}

fn is_rfc1918_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
}

fn is_cgnat_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (64..=127).contains(&octets[1])
}

fn is_ula_ipv6(ip: Ipv6Addr) -> bool {
    (ip.octets()[0] & 0xfe) == 0xfc
}

fn is_link_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_link_local(),
        IpAddr::V6(ip) => ip.is_unicast_link_local(),
    }
}

fn ipv4_from_network_order(address: u32) -> Ipv4Addr {
    Ipv4Addr::from(u32::from_be(address))
}

#[cfg(unix)]
fn collect_interface_addresses() -> Vec<InterfaceAddress> {
    use std::ffi::CStr;
    use std::ptr;

    let mut addrs = ptr::null_mut();
    // SAFETY: getifaddrs initializes `addrs` on success and the list is freed
    // with freeifaddrs before returning.
    if unsafe { libc::getifaddrs(&mut addrs) } != 0 {
        return Vec::new();
    }

    let mut interfaces = Vec::new();
    let mut cursor = addrs;
    while !cursor.is_null() {
        // SAFETY: cursor walks the valid linked list returned by getifaddrs.
        let ifaddr = unsafe { &*cursor };
        if !ifaddr.ifa_addr.is_null()
            && let Some(ip) = sockaddr_ip(ifaddr.ifa_addr)
        {
            let flags = ifaddr.ifa_flags as libc::c_int;
            let name = if ifaddr.ifa_name.is_null() {
                String::new()
            } else {
                // SAFETY: ifa_name is a NUL-terminated C string owned by the
                // getifaddrs list for the lifetime of this iteration.
                unsafe { CStr::from_ptr(ifaddr.ifa_name) }
                    .to_string_lossy()
                    .into_owned()
            };
            interfaces.push(InterfaceAddress {
                name,
                ip,
                // MVP collectors do not reliably detect the default route yet;
                // selector fallback picks the first eligible LAN candidate.
                is_default_route: false,
                is_active: flags & libc::IFF_UP != 0,
                is_loopback: flags & libc::IFF_LOOPBACK != 0,
            });
        }
        cursor = ifaddr.ifa_next;
    }

    // SAFETY: addrs was initialized by getifaddrs above and has not been freed.
    unsafe { libc::freeifaddrs(addrs) };
    interfaces
}

#[cfg(unix)]
fn sockaddr_ip(addr: *const libc::sockaddr) -> Option<IpAddr> {
    // SAFETY: callers pass a non-null sockaddr pointer from getifaddrs.
    let family = unsafe { (*addr).sa_family as libc::c_int };
    match family {
        libc::AF_INET => {
            // SAFETY: family confirms the sockaddr points to sockaddr_in.
            let sockaddr = unsafe { &*(addr.cast::<libc::sockaddr_in>()) };
            Some(IpAddr::V4(ipv4_from_network_order(
                sockaddr.sin_addr.s_addr,
            )))
        }
        libc::AF_INET6 => {
            // SAFETY: family confirms the sockaddr points to sockaddr_in6.
            let sockaddr = unsafe { &*(addr.cast::<libc::sockaddr_in6>()) };
            Some(IpAddr::V6(Ipv6Addr::from(sockaddr.sin6_addr.s6_addr)))
        }
        _ => None,
    }
}

#[cfg(windows)]
type AdapterAddresses = windows_sys::Win32::NetworkManagement::IpHelper::IP_ADAPTER_ADDRESSES_LH;

#[cfg(windows)]
struct AdapterAddressBuffer {
    storage: Vec<std::mem::MaybeUninit<AdapterAddresses>>,
}

#[cfg(windows)]
impl AdapterAddressBuffer {
    fn new(buffer_len: u32) -> Option<Self> {
        let element_count = (buffer_len as usize).div_ceil(std::mem::size_of::<AdapterAddresses>());
        let mut storage = Vec::new();
        storage.try_reserve_exact(element_count).ok()?;
        storage.resize_with(element_count, std::mem::MaybeUninit::uninit);
        Some(Self { storage })
    }

    fn as_mut_ptr(&mut self) -> *mut AdapterAddresses {
        self.storage.as_mut_ptr().cast::<AdapterAddresses>()
    }
}

#[cfg(windows)]
fn collect_interface_addresses() -> Vec<InterfaceAddress> {
    use std::ffi::CStr;
    use std::ptr;

    use windows_sys::Win32::Foundation::ERROR_BUFFER_OVERFLOW;
    use windows_sys::Win32::Foundation::ERROR_NO_DATA;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::NetworkManagement::IpHelper::GAA_FLAG_SKIP_ANYCAST;
    use windows_sys::Win32::NetworkManagement::IpHelper::GAA_FLAG_SKIP_DNS_INFO;
    use windows_sys::Win32::NetworkManagement::IpHelper::GAA_FLAG_SKIP_DNS_SERVER;
    use windows_sys::Win32::NetworkManagement::IpHelper::GAA_FLAG_SKIP_MULTICAST;
    use windows_sys::Win32::NetworkManagement::IpHelper::GetAdaptersAddresses;
    use windows_sys::Win32::NetworkManagement::IpHelper::IF_TYPE_SOFTWARE_LOOPBACK;
    use windows_sys::Win32::NetworkManagement::Ndis::IfOperStatusUp;
    use windows_sys::Win32::Networking::WinSock::AF_UNSPEC;

    let flags = GAA_FLAG_SKIP_ANYCAST
        | GAA_FLAG_SKIP_MULTICAST
        | GAA_FLAG_SKIP_DNS_SERVER
        | GAA_FLAG_SKIP_DNS_INFO;
    let mut buffer_len = 15 * 1024;

    for _ in 0..3 {
        let Some(mut buffer) = AdapterAddressBuffer::new(buffer_len) else {
            return Vec::new();
        };
        let adapter_addresses = buffer.as_mut_ptr();
        // SAFETY: `buffer` is valid writable storage for the adapter list,
        // aligned for IP_ADAPTER_ADDRESSES_LH, and `buffer_len` points to its
        // byte size as required by GetAdaptersAddresses.
        let result = unsafe {
            GetAdaptersAddresses(
                u32::from(AF_UNSPEC),
                flags,
                ptr::null(),
                adapter_addresses,
                &mut buffer_len,
            )
        };

        match result {
            ERROR_SUCCESS => {
                let mut interfaces = Vec::new();
                let mut adapter = adapter_addresses;
                while !adapter.is_null() {
                    // SAFETY: adapter walks the linked list written into
                    // `buffer` by GetAdaptersAddresses while `buffer` is alive.
                    let adapter_ref = unsafe { &*adapter };
                    let is_active = adapter_ref.OperStatus == IfOperStatusUp;
                    let is_loopback = adapter_ref.IfType == IF_TYPE_SOFTWARE_LOOPBACK;
                    let name = if adapter_ref.AdapterName.is_null() {
                        String::new()
                    } else {
                        // SAFETY: AdapterName is a NUL-terminated string owned
                        // by the adapter list in `buffer`.
                        unsafe { CStr::from_ptr(adapter_ref.AdapterName.cast()) }
                            .to_string_lossy()
                            .into_owned()
                    };

                    let mut unicast = adapter_ref.FirstUnicastAddress;
                    while !unicast.is_null() {
                        // SAFETY: unicast walks the adapter's valid unicast
                        // address linked list within `buffer`.
                        let unicast_ref = unsafe { &*unicast };
                        if let Some(ip) = windows_socket_address_ip(&unicast_ref.Address) {
                            interfaces.push(InterfaceAddress {
                                name: name.clone(),
                                ip,
                                // MVP collectors do not reliably detect the default route yet;
                                // selector fallback picks the first eligible LAN candidate.
                                is_default_route: false,
                                is_active,
                                is_loopback: is_loopback || ip.is_loopback(),
                            });
                        }
                        unicast = unicast_ref.Next;
                    }

                    adapter = adapter_ref.Next;
                }
                return interfaces;
            }
            ERROR_BUFFER_OVERFLOW => {}
            ERROR_NO_DATA => return Vec::new(),
            _ => return Vec::new(),
        }
    }

    Vec::new()
}

#[cfg(windows)]
fn windows_socket_address_ip(
    address: &windows_sys::Win32::Networking::WinSock::SOCKET_ADDRESS,
) -> Option<IpAddr> {
    use windows_sys::Win32::Networking::WinSock::AF_INET;
    use windows_sys::Win32::Networking::WinSock::AF_INET6;
    use windows_sys::Win32::Networking::WinSock::SOCKADDR_IN;
    use windows_sys::Win32::Networking::WinSock::SOCKADDR_IN6;

    if address.lpSockaddr.is_null() {
        return None;
    }

    // SAFETY: lpSockaddr is checked non-null and points to a sockaddr whose
    // family decides the concrete sockaddr layout.
    let family = unsafe { (*address.lpSockaddr).sa_family };
    match family {
        AF_INET => {
            // SAFETY: family confirms lpSockaddr points to SOCKADDR_IN.
            let sockaddr = unsafe { &*(address.lpSockaddr.cast::<SOCKADDR_IN>()) };
            // SAFETY: S_addr is the active representation for an IPv4 address.
            let address = unsafe { sockaddr.sin_addr.S_un.S_addr };
            Some(IpAddr::V4(ipv4_from_network_order(address)))
        }
        AF_INET6 => {
            // SAFETY: family confirms lpSockaddr points to SOCKADDR_IN6.
            let sockaddr = unsafe { &*(address.lpSockaddr.cast::<SOCKADDR_IN6>()) };
            // SAFETY: Byte is the active representation for an IPv6 address.
            let address = unsafe { sockaddr.sin6_addr.u.Byte };
            Some(IpAddr::V6(Ipv6Addr::from(address)))
        }
        _ => None,
    }
}

#[cfg(not(any(unix, windows)))]
fn collect_interface_addresses() -> Vec<InterfaceAddress> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use std::net::IpAddr;

    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    fn classifies_private_lan_ipv4() {
        let hosts = advertised_hosts_from_interfaces(
            &[interface(
                "en0",
                "192.168.3.165",
                /*is_default_route*/ true,
            )],
            /*include_ipv6*/ false,
        );

        assert_eq!(
            hosts,
            vec![
                AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
                AdvertisedHost::new(GuiLaunchUrlKind::Lan, "LAN", "192.168.3.165"),
            ]
        );
    }

    #[test]
    fn classifies_cgnat_ipv4_as_vpn() {
        let hosts = advertised_hosts_from_interfaces(
            &[interface(
                "utun0",
                "100.88.28.119",
                /*is_default_route*/ false,
            )],
            /*include_ipv6*/ false,
        );

        assert_eq!(
            hosts,
            vec![
                AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
                AdvertisedHost::new(GuiLaunchUrlKind::Vpn, "VPN", "100.88.28.119"),
            ]
        );
    }

    #[test]
    fn classifies_ula_ipv6_as_vpn_candidate() {
        let hosts = advertised_hosts_from_interfaces(
            &[interface(
                "utun1",
                "fd7a:115c:a1e0::1",
                /*is_default_route*/ false,
            )],
            /*include_ipv6*/ true,
        );

        assert_eq!(
            hosts,
            vec![
                AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
                AdvertisedHost::new(GuiLaunchUrlKind::Vpn, "VPN", "fd7a:115c:a1e0::1"),
            ]
        );
    }

    #[test]
    fn rejects_public_and_link_local_addresses() {
        let mut interfaces = vec![
            interface("en0", "8.8.8.8", /*is_default_route*/ true),
            interface("en1", "169.254.1.1", /*is_default_route*/ false),
            interface("utun0", "fe80::1", /*is_default_route*/ false),
        ];
        interfaces.push(InterfaceAddress {
            name: "lo0".to_string(),
            ip: "127.0.0.1".parse().unwrap(),
            is_default_route: false,
            is_active: true,
            is_loopback: true,
        });

        assert_eq!(
            advertised_hosts_from_interfaces(&interfaces, /*include_ipv6*/ true),
            vec![AdvertisedHost::new(
                GuiLaunchUrlKind::Local,
                "Local",
                "127.0.0.1",
            )]
        );
    }

    #[test]
    fn selects_one_lan_and_one_vpn_candidate() {
        let hosts = advertised_hosts_from_interfaces(
            &[
                interface("en1", "192.168.4.44", /*is_default_route*/ false),
                interface("en0", "192.168.3.165", /*is_default_route*/ true),
                interface("utun0", "100.88.28.119", /*is_default_route*/ false),
                interface("utun1", "100.90.1.8", /*is_default_route*/ false),
            ],
            /*include_ipv6*/ false,
        );

        assert_eq!(
            hosts,
            vec![
                AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
                AdvertisedHost::new(GuiLaunchUrlKind::Lan, "LAN", "192.168.3.165"),
                AdvertisedHost::new(GuiLaunchUrlKind::Vpn, "VPN", "100.88.28.119"),
            ]
        );
    }

    #[test]
    fn selects_lan_fallback_when_default_route_unknown() {
        let hosts = advertised_hosts_from_interfaces(
            &[
                interface("en1", "10.1.2.3", /*is_default_route*/ false),
                interface("en0", "192.168.3.165", /*is_default_route*/ false),
            ],
            /*include_ipv6*/ false,
        );

        assert_eq!(
            hosts,
            vec![
                AdvertisedHost::new(GuiLaunchUrlKind::Local, "Local", "127.0.0.1"),
                AdvertisedHost::new(GuiLaunchUrlKind::Lan, "LAN", "10.1.2.3"),
            ]
        );
    }

    #[test]
    fn does_not_advertise_ula_when_ipv6_disabled() {
        let hosts = advertised_hosts_from_interfaces(
            &[interface(
                "utun1",
                "fd7a:115c:a1e0::1",
                /*is_default_route*/ false,
            )],
            /*include_ipv6*/ false,
        );

        assert_eq!(
            hosts,
            vec![AdvertisedHost::new(
                GuiLaunchUrlKind::Local,
                "Local",
                "127.0.0.1",
            )]
        );
    }

    #[test]
    fn converts_network_order_ipv4_addresses() {
        assert_eq!(
            ipv4_from_network_order(u32::from_ne_bytes([192, 168, 3, 165])),
            Ipv4Addr::new(192, 168, 3, 165)
        );
    }

    fn interface(name: &str, ip: &str, is_default_route: bool) -> InterfaceAddress {
        InterfaceAddress {
            name: name.to_string(),
            ip: ip.parse::<IpAddr>().unwrap(),
            is_default_route,
            is_active: true,
            is_loopback: false,
        }
    }
}
