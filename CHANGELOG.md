# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) (pre-1.0,
so minor bumps may include breaking changes).

## [Unreleased]

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
