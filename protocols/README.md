# protocols/

**Status:** first models land in **v0.4** (ARP, ICMP, IPv4, Ethernet); more
protocols arrive through v0.8 (see [../docs/ROADMAP.md](../docs/ROADMAP.md)).

DOM-free protocol data models, operated on by `engine/PacketEngine.js`.

- `Frame.js` — layer-2 Ethernet frame (`EtherType`, broadcast MAC, VLAN tag).
- `ipv4.js` — `IPv4Packet` with TTL decrement/expiry and protocol tag.
- `arp.js` — `ArpMessage` + per-device `ArpCache`.
- `icmp.js` — `IcmpMessage` (echo request/reply, time-exceeded, unreachable).

Coming later: DHCP, DNS, NAT/PAT, ACL, static/OSPF routing, STP/RSTP, VLAN
trunking, EtherChannel, port security, HSRP, IPv6/OSPFv3.
