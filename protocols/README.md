# protocols/

**Status:** empty — first implementations (ARP, ICMP) land in **v0.4**,
with DHCP/DNS/NAT/ACL/OSPF/STP/HSRP/IPv6 arriving through v0.8 (see
[../docs/ROADMAP.md](../docs/ROADMAP.md)).

Will hold one module per protocol, each operating purely on
`devices/`/`topology/` data and the `engine/PacketEngine.js` — no DOM.
