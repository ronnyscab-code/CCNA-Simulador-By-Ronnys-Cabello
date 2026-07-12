# Architecture

OpenCCNA Simulator is a static, backend-free, framework-free application
built from native ES Modules. It is designed to grow for years without
turning into a tangled mess, so the layering rules below are treated as hard
constraints, not suggestions.

## Layers

```
topology/   Pure data model. No DOM, no rendering, no CLI. Emits events.
engine/     Simulation + persistence logic. No DOM.
devices/    Device class hierarchy (Router, Switch, PC, ...). No DOM.
protocols/  Protocol implementations (ARP, ICMP, OSPF, ...). No DOM.
cli/        Cisco CLI parser and command implementations. No DOM.
scenarios/  Scenario/lab definitions and validation logic. No DOM.
ui/         Everything that touches the DOM: rendering, events, widgets.
labs/       Lab/scenario content data (JSON-ish modules), consumed by scenarios/.
js/         Application entry point (main.js) that wires layers together.
css/        Presentation only.
assets/     Static media (icons, etc).
```

**The rule:** anything outside `ui/` must be usable from a non-browser
context (e.g. a `node:test` file) without touching `document` or `window`.
`ui/` is the only layer allowed to import `topology`/`engine`/`devices` and
talk to the DOM. Data layers never import from `ui/`.

## Event-driven decoupling

`Topology`, `SelectionManager`, and `HistoryManager` all extend the native
`EventTarget`. The UI layer subscribes to their events (`nodeAdded`,
`edgeRemoved`, `selectionChanged`, `historyChanged`, ...) and re-renders in
response. This means the data model never needs to know that a canvas
exists — it could just as well be driven by the CLI, a test script, or a
future scenario auto-grader.

```
User input → ui/CanvasInteractions.js → topology/TopologyCommands.js (Command)
           → HistoryManager.execute(command) → command.execute()
           → mutates Topology → Topology dispatches event
           → ui/CanvasRenderer.js re-renders the affected nodes/edges
```

## Command pattern (undo/redo)

Every mutation that should be undoable is expressed as a command object with
`execute()` and `undo()` methods (`topology/TopologyCommands.js`). UI code
never mutates `Topology` directly — it always goes through
`HistoryManager.execute(command)`. This keeps undo/redo correct by
construction instead of by convention.

## Persistence

`engine/StorageManager.js` is a facade over two backends:

- `localStorage` — a single autosave slot, restored on load.
- `engine/IndexedDBAdapter.js` — named, multi-project storage (save/list/load/delete).

JSON export/import (`Topology.toJSON()` / `Topology.fromJSON()`) is the
canonical serialization format and is shared by both backends and the
file-based Export/Import buttons in the toolbar.

## Rendering

The topology is rendered as SVG (`ui/CanvasManager.js` +
`ui/CanvasRenderer.js`) rather than Canvas2D, because devices and cables are
discrete, hit-testable, DOM-addressable objects — SVG gives us that for
free (native hit testing, CSS styling, accessibility hooks). Canvas2D is
reserved for packet animation overlays (introduced in v0.4), where we expect
many short-lived, non-interactive moving objects.

`ui/Camera.js` owns the pan/zoom transform and all screen↔world coordinate
conversion. Nothing else is allowed to compute that math — every consumer
(drag handling, rubber-band selection, grid rendering) asks the `Camera`.

## Why no framework

React/Vue/Angular pull in a build step, which conflicts with the "open
`index.html` and it just works, deployable to GitHub Pages with zero config"
goal. Native ES Modules, `EventTarget`, and the DOM are enough to build a
clean, componentized UI at this scale — see `ui/Toolbar.js` and
`ui/ContextMenu.js` for the pattern used throughout: small classes that own
one DOM subtree and expose an imperative API plus events.

## Versioning discipline

Each folder above is scaffolded from v0.1 onward, but most start empty
(`devices/`, `protocols/`, `cli/`, `scenarios/`, `labs/`) with a short
`README.md` describing what lands there and in which roadmap version. See
[ROADMAP.md](ROADMAP.md).
