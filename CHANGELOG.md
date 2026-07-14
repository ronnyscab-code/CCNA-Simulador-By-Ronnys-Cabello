# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) (pre-1.0,
so minor bumps may include breaking changes).

## [Unreleased]

## [1.0.0] - 2026-07-14

### Added — CCNA Trainer & 1.0 release

- A study subsystem under `trainer/` (all DOM-free and unit-tested):
  - `questions.js` — an **original** question bank written to the CCNA
    200-301 blueprint, spanning all six domains, each item with an
    explanation and a blueprint reference. No questions are copied from Cisco
    or any third-party bank.
  - `SpacedRepetition.js` — an SM-2 scheduler (intervals grow on success,
    reset on lapse, ease floored at 1.3).
  - `TrainerStore.js` — progress persistence with injectable storage
    (localStorage in the browser, in-memory in tests): per-card SR state,
    stats, and unlocked achievements.
  - `Achievements.js` — milestone badges evaluated against the stats.
  - `TrainerEngine.js` — study (spaced-repetition queue), exam (scored
    quiz), flashcards, and stats, with achievement syncing.
- A **Trainer** modal (`ui/TrainerPanel.js`): Study, Exam, Flashcards, and
  Stats modes, immediate feedback with explanations, per-domain progress
  bars, and an achievements grid.

This marks **v1.0**: the editor, device model, Cisco-style CLI, packet
engine, switching, routing, VLANs/STP, OSPF, troubleshooting labs, and the
CCNA Trainer are all in place and tested (131 unit tests).

## [0.9.0] - 2026-07-13

### Added — Troubleshooting labs

- A scenario engine (`scenarios/ScenarioEngine.js`) that loads a deliberately
  broken topology, then scores the learner's fix against a set of checks.
- A reusable, DOM-free checks library (`scenarios/checks.js`):
  `pingSucceeds`/`pingFails`, `interfaceEnabled`, `interfaceHasIp`,
  `defaultGatewayIs`, `accessVlanIs`, `ospfNeighborUp`, and a `custom` escape
  hatch — each with a description, point weight, and pass/fail + detail.
- A scenario catalog (`labs/scenarios.js`) with authored faults (shut-down
  interface, missing IP, VLAN mismatch, un-advertised OSPF network) plus a
  parametric generator producing a family of addressing drills, built with a
  fluent `TopologyBuilder` (`labs/builders.js`).
- A "Labs" modal (`ui/ScenarioPanel.js`): browse scenarios, load one (it
  swaps the canvas to the broken network), read the objective, fix it via the
  CLI, then **Check** for a score. Hints reveal one at a time (small score
  penalty); the explanation appears once every check passes.

### Fixed

- OSPF only advertises subnets covered by a `network` statement — previously
  SPF leaked every connected subnet of a neighbor regardless of what it
  advertised.

## [0.8.0] - 2026-07-13

### Added — OSPF (single area)

- `protocols/ospf.js` — a converged single-area OSPFv2 control plane computed
  over the topology: router IDs (configured or highest interface IP),
  neighbor adjacencies on shared advertised subnets, DR/BDR election per
  segment, and Dijkstra (SPF) shortest-path routes to every remote subnet.
- OSPF-learned routes feed `routeLookup` as `type: "ospf"` entries, so a
  `ping` across routers now works with OSPF alone — no static routes needed.
- `show ip ospf neighbor` lists real adjacencies (router ID, priority,
  state like `FULL/DR`, address, interface); `show ip route` now includes
  `O` routes with `[110/metric]` and next hop.
- CLI: `ip ospf priority <n>` on an interface (influences DR/BDR election).

## [0.7.0] - 2026-07-13

### Added — VLANs, trunking & spanning tree

- Trunk-aware, VLAN-constrained layer-2 delivery: a frame's VLAN (set by its
  ingress access port) now propagates across multiple switches only over
  trunks that allow it. `L2Fabric.findPath` takes a `vlan` and refuses any
  switch port that doesn't carry it (access mismatch, or trunk not allowing
  the VLAN) — so `switchport trunk allowed vlan` actually prunes traffic.
- `engine/SpanningTree.js` — a Common Spanning Tree: root-bridge election by
  bridge ID, root-path-cost by link speed, and root/designated/blocking port
  roles. Redundant links are blocked so loops (e.g. a triangle of switches)
  can't produce a circulating or looping path.
- `L2Fabric.findPath` skips STP-blocked ports; the engine computes the tree
  once per ping.
- `show spanning-tree` now reflects the computed tree: which bridge is root,
  and each port's role (Root/Desg/Altn) and state (FWD/BLK).

## [0.6.0] - 2026-07-12

### Added — Routing

- `protocols/routing.js` — the forwarding decision: longest-prefix match over
  connected routes, static routes (`ip route`), and an endpoint's default
  gateway (modeled as `0.0.0.0/0`), resolving the egress interface and
  next-hop IP.
- `PacketEngine.ping` rewritten as a unified hop-by-hop forwarder: at each
  node it makes one routing decision and delivers the frame across one
  layer-2 segment to the next hop, decrementing TTL per router hop, until the
  packet reaches the destination. Same-subnet and switched delivery are now
  the single-hop case of the same algorithm.
- End-to-end pings across multiple routers via static routes now succeed and
  animate along the full router path; new failure reasons `no-route` and
  `ttl-expired`.
- `ip default-gateway <ip>` CLI command.

## [0.5.0] - 2026-07-12

### Added — Switching

- `engine/MacTable.js` — per-switch CAM table (VLAN + MAC → port), with
  learning/refresh and lookup.
- Switches learn source MACs as frames pass through them: a successful ping
  populates the CAM tables of every switch on the path, on the correct
  ports. `show mac address-table` renders the learned entries live.
- VLAN-aware layer-2 delivery: hosts on switch access ports in the same VLAN
  reach each other; hosts in different access VLANs cannot (new
  `different-vlan` ping reason) — the classic "same switch, different VLAN,
  no connectivity" behavior.
- `L2Fabric` gains VLAN helpers (a host's ingress access VLAN, the switch
  port facing a neighbor).

## [0.4.0] - 2026-07-12

### Added — Packet engine

- Protocol models under `protocols/`: `Frame` (Ethernet + EtherType +
  optional 802.1Q tag), `IPv4Packet` (with TTL decrement/expiry),
  `ArpMessage`/`ArpCache`, and `IcmpMessage` (echo request/reply).
- `engine/L2Fabric.js` — layer-2 reachability: switches, access points, and
  clouds relay frames transparently; routers/endpoints don't. Computes the
  broadcast domain and the node path between two hosts.
- `engine/PacketEngine.js` — simulates `ping` end to end: picks the egress
  interface by subnet, resolves the destination MAC via ARP (request/reply,
  cached per device), then exchanges ICMP echo. Returns a success/reason
  result plus an animation trace, with clear failure reasons (no source IP,
  different subnet, unreachable, not connected).
- CLI `ping`/`traceroute` now run on the real engine and animate; `reload`
  clears the ARP caches.
- `ui/PacketAnimator.js` — Canvas overlay that animates packets (ARP amber,
  ICMP blue/green) gliding along the cable path, re-projected through the
  camera so they track the devices while panning/zooming.

## [0.3.0] - 2026-07-12

### Added — Cisco-style CLI

- Modal IOS-like CLI under `cli/`: user EXEC, privileged EXEC, and the
  `config`, `config-if`, `config-vlan`, `config-line`, `config-router`
  submodes with correct prompts and `exit`/`end` transitions.
- `CommandTree` parser with minimum-unique-abbreviation (`conf t`,
  `sh ip int br`), Tab/`?` completion, and IOS-style error messages
  (`% Ambiguous command`, `% Incomplete command`, `^ % Invalid input`).
- Commands: `enable`/`disable`, `configure terminal`, `hostname`,
  `interface`, `description`, `shutdown`/`no shutdown`, `ip address`,
  `switchport mode/access/trunk`, `vlan`/`name`, `line`, `router ospf`,
  `network`, `ip route`, `copy running-config startup-config`,
  `write memory`, `erase startup-config`, `reload`, `ping`, `traceroute`.
- `show` commands: `running-config`, `startup-config`, `interfaces`,
  `ip interface brief`, `vlan brief`, `mac address-table`, `arp`,
  `cdp neighbors` (derived live from the cabling), `ip route` (connected +
  static), `spanning-tree`, `access-lists`, `ip ospf neighbor/interface`,
  `version`. Commands needing runtime tables render well-formed empty output
  today and fill in as the engine grows (v0.4+).
- `ui/Terminal.js` / `ui/TerminalManager.js`: draggable, resizable terminal
  windows (one per device) with command history and Tab completion. Open via
  right-click → Open CLI, the properties-panel button, or Enter on a
  selected device. CLI config changes update the canvas label and autosave.
- Device gains a `config` bag (VLAN database, static routes, OSPF, lines),
  serialized with the topology.

## [0.2.0] - 2026-07-12

### Added — Device model

- Full logical device layer under `devices/`: a `Device` base class plus
  `Router`, `Switch`, `PC`, `Laptop`, `Server`, `Firewall`, `AccessPoint`,
  `Cloud`, and `Printer`, each with a realistic default interface layout
  (routers ship shut down; switches ship as up access ports; endpoints get
  a single NIC).
- `NetworkInterface` with IOS-style names, burned-in MAC, IPv4 address/mask,
  admin state, and switchport settings; `Device.expandInterfaceName`
  resolves IOS abbreviations (`gi0/0` → `GigabitEthernet0/0`).
- `net-utils.js`: MAC generation/validation and IPv4 math (int/mask/prefix
  conversion, network/broadcast address, same-subnet test).
- `DeviceFactory` — single registry mapping type keys to classes for
  creation and deserialization.
- `Node` now owns a `Device`; `hostname` delegates to it. Topologies saved
  by v0.1 still load (the device is reconstructed from the type).
- Properties panel (`ui/PropertiesPanel.js`): edit hostname, per-interface
  admin state / IP / mask, and endpoint default gateway — all undoable via
  new `ConfigureInterfaceCommand` / `SetDevicePropertyCommand`.
- Cables now auto-assign a free interface on each endpoint and the panel
  shows the connected neighbor per port; connecting with no free port is
  refused with a status message.

## [0.1.0] - 2026-07-12

### Added — Topology Editor

- Infinite pannable/zoomable SVG canvas (`ui/Camera.js`, `ui/CanvasManager.js`).
- Dotted background grid with configurable size and snap-to-grid toggle.
- Device palette sidebar with drag & drop placement (`ui/Toolbar.js`).
- Nine original device icons: router, switch, PC, laptop, server, firewall,
  cloud, access point, printer (`assets/icons/`).
- Click-to-select, shift-click additive select, and rubber-band rectangle
  multi-select (`ui/SelectionManager.js`).
- Node dragging (single and multi), with grid snapping.
- "Connect" mode to draw cables between two devices.
- Rename (inline), duplicate, and delete via context menu or keyboard.
- Copy / paste of selected devices.
- Full undo/redo command stack (`ui/HistoryManager.js`, `topology/TopologyCommands.js`).
- JSON export/import of the full topology (`engine/StorageManager.js`).
- Autosave to `localStorage` and named project save/load via IndexedDB
  (`engine/IndexedDBAdapter.js`).
- Pure, framework-agnostic topology data model with event-based reactivity
  (`topology/Topology.js`, `topology/Node.js`, `topology/Edge.js`).
- Project scaffolding: MIT license, ESLint + Prettier configs, `node:test`
  unit tests for the engine layer, architecture and roadmap docs.

[Unreleased]: https://github.com/openccna/openccna-simulator/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/openccna/openccna-simulator/releases/tag/v0.1.0
