# Roadmap

OpenCCNA Simulator is built incrementally. Each version must be fully
functional and tested before the next one begins.

- [x] **v0.1 — Editor**
      Infinite canvas, pan/zoom, grid/snap, drag & drop, selection, cabling,
      rename/duplicate/delete, copy/paste, undo/redo, JSON export/import,
      localStorage/IndexedDB persistence.
- [x] **v0.2 — Devices**
      Full `Device` class hierarchy (`Router`, `Switch`, `PC`, `Server`,
      `AccessPoint`, `Firewall`, ...), interfaces, MAC addresses, IP
      configuration, device state, properties panel in the UI.
- [x] **v0.3 — CLI**
      Cisco-style CLI parser and terminal UI: modes (`config`, `config-if`,
      `config-router`, `config-line`, `config-vlan`), command set, tab
      completion, command history, Cisco-style error messages.
- [x] **v0.4 — Packet Engine**
      `PacketEngine`, `Packet`/`Frame` models, TTL, ARP, ICMP, TCP/UDP
      primitives, packet animation along cables.
- [x] **v0.5 — Switching**
      MAC address table, flooding, unicast/broadcast/multicast forwarding,
      VLAN-aware switching basics.
- [x] **v0.6 — Routing**
      Routing table, static routing, ARP-based next-hop resolution, ICMP
      end-to-end connectivity across routers.
- [x] **v0.7 — VLAN**
      VLANs, trunking (802.1Q), access/trunk ports, `show vlan brief`, STP/RSTP.
- [x] **v0.8 — OSPF**
      Single-area OSPF, neighbor discovery, `show ip ospf neighbor`, DR/BDR.
- [x] **v0.9 — Troubleshooting**
      Scenario engine: objectives, injected faults, validation, scoring,
      hints, explanations. Authored faults + a parametric generator.
- [ ] **v1.0 — Release**
      CCNA Trainer (original question bank aligned to the CCNA 200-301
      blueprint, study mode, exam mode, flashcards, spaced repetition,
      statistics, achievements), full documentation, stability pass.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how these pieces fit together.
