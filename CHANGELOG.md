# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) (pre-1.0,
so minor bumps may include breaking changes).

## [Unreleased]

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
