# OpenCCNA Simulator

A free, open-source, browser-based network simulator for studying CCNA —
inspired by the idea of Cisco Packet Tracer, built entirely from scratch with
original code, original artwork, and an original CLI implementation. No
Cisco code, assets, or trademarked interface is used anywhere in this
project.

Runs 100% in the browser. No backend, no build step, no account.

## Status

**v0.8 — OSPF** (done). See [docs/ROADMAP.md](docs/ROADMAP.md)
for the full version plan through v1.0, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for how the codebase is organized.

## Features

**Editor (v0.1)**

- Infinite canvas with pan (middle-mouse drag) and zoom (mouse wheel).
- Grid with snap-to-grid.
- Drag & drop device palette: router, switch, PC, laptop, server, firewall,
  cloud, access point, printer.
- Click to select, shift-click to multi-select, drag a rubber-band to
  select a region.
- Move, rename, duplicate, delete, copy/paste devices.
- Connect mode to cable devices together.
- Full undo/redo.
- Export/import the topology as JSON.
- Autosave to `localStorage`; named projects saved in `IndexedDB`.

**Devices (v0.2)**

- Real device model behind every node: interfaces with IOS-style names,
  MAC addresses, IPv4 addressing, and admin state.
- Properties panel to configure hostname, per-interface IP/mask/enabled,
  and endpoint default gateway — every edit undoable.
- Cables auto-assign a free interface on each end; the panel shows each
  port's connected neighbor.

**CLI (v0.3)**

- Modal, IOS-style command line per device (right-click → Open CLI, the
  properties-panel button, or Enter on a selected device).
- Minimum-unique abbreviation (`conf t`, `sh ip int br`), Tab / `?`
  completion, command history, and Cisco-style error messages.
- Configuration (`hostname`, `interface`, `ip address`, `switchport`,
  `vlan`, `ip route`, `router ospf`, ...) mutates the live device model and
  reflects immediately on the canvas; `show` commands render running-config,
  interface briefs, CDP neighbors (from the cabling), routes, and more.

**Packet engine (v0.4)**

- `ping` and `traceroute` actually simulate: the engine picks an egress
  interface by subnet, resolves the destination MAC with ARP, and exchanges
  ICMP echo across the real layer-2 fabric (works through switches).
- Packets animate along the cabling — ARP (amber) then ICMP (blue/green) —
  tracking the devices as you pan and zoom.

**Switching (v0.5)**

- Switches learn source MACs as traffic flows; `show mac address-table`
  reflects what they've learned, on the right ports and VLANs.
- Access-port VLANs segregate traffic: same VLAN reaches, different VLAN
  doesn't — just like real gear.

**Routing (v0.6)**

- Routers forward hop by hop using connected + static routes (longest-prefix
  match); hosts follow their default gateway. TTL decrements per hop.
- `ping` reaches hosts several subnets and routers away, and the packet
  animates along the full router path.

**VLANs, trunking & STP (v0.7)**

- VLANs isolate traffic across trunked switches; `switchport trunk allowed vlan`
  really prunes VLANs off a trunk.
- Spanning tree elects a root bridge and blocks redundant links so loops
  can't form; `show spanning-tree` shows the port roles and states.

**OSPF (v0.8)**

- Single-area OSPF: enable it with `router ospf` + `network ... area 0` and
  routers form adjacencies, elect DR/BDR, and learn each other's subnets —
  cross-router `ping` works with no static routes.
- `show ip ospf neighbor` and the `O` routes in `show ip route` reflect the
  live, converged state.

## Getting started

No build step is required — this is plain ES Modules, HTML, and CSS.

```bash
# clone, then from the project root:
npm run dev
# or, without Node at all:
python3 -m http.server 5173
```

Open `http://localhost:5173` in a modern browser (Chrome, Firefox, Edge,
Safari — anything with ES Modules and SVG support).

> Opening `index.html` directly via `file://` will **not** work — ES Module
> imports require an HTTP server, even a local one.

### Deploying

This project is designed to be deployed as-is to GitHub Pages: point Pages
at the repository root (or `main` branch) and it works with zero
configuration.

## Development

```bash
npm install      # only needed for lint/format/test tooling
npm run lint      # ESLint
npm run format    # Prettier
npm test          # node:test — engine/data-layer unit tests
```

## Project structure

```
OpenCCNA-Simulator/
├── index.html        Entry point
├── css/               Presentation
├── js/                Application bootstrap (main.js)
├── assets/            Icons and static media
├── engine/            Simulation + persistence logic (no DOM)
├── devices/           Device class hierarchy (v0.2+)
├── protocols/         Protocol implementations (v0.4+)
├── topology/          Pure topology data model
├── cli/               Cisco-style CLI (v0.3+)
├── scenarios/         Troubleshooting scenario engine (v0.9+)
├── labs/              Lab/scenario content (v0.9+)
├── ui/                DOM rendering and interaction (the only DOM-aware layer)
├── docs/               Architecture and roadmap docs
└── tests/             node:test unit tests
```

## Contributing

This project is built version by version (see the roadmap) and each version
must be fully working and tested before the next begins. Issues and pull
requests are welcome — please keep contributions inside the layering rules
described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

- Code outside `ui/` must never touch `document`/`window`.
- Mutations to the topology go through a `Command` object executed via
  `HistoryManager`, so undo/redo stays correct.
- Run `npm run lint`, `npm run format:check`, and `npm test` before opening
  a PR.

## Content policy

- No Cisco IOS source, documentation text, icons, or UI is copied. The CLI
  behavior is reimplemented from publicly documented command syntax and
  output shapes, not from Cisco source.
- No exam questions are copied from Cisco, ExamTopics, Boson, 9tut, or any
  other question bank. The CCNA Trainer (from v1.0) uses an original
  question bank written against the public CCNA 200-301 exam blueprint.

## License

[MIT](LICENSE) — free for personal, educational, and commercial use.
