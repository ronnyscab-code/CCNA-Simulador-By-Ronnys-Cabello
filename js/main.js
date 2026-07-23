/**
 * main.js
 *
 * Application entry point. Wires together the topology data model, the
 * view-state singletons (Camera, SelectionManager, HistoryManager), the
 * persistence facade, and the editor UI (CanvasManager, CanvasInteractions,
 * Toolbar, ContextMenu). No other module is allowed to instantiate more
 * than one of these — this file is the single composition root.
 */

import { Topology } from '../topology/Topology.js';
import { StorageManager } from '../engine/StorageManager.js';
import { Camera } from '../ui/Camera.js';
import { SelectionManager } from '../ui/SelectionManager.js';
import { HistoryManager } from '../ui/HistoryManager.js';
import { CanvasManager } from '../ui/CanvasManager.js';
import { CanvasInteractions } from '../ui/CanvasInteractions.js';
import { Toolbar } from '../ui/Toolbar.js';
import { ContextMenu } from '../ui/ContextMenu.js';
import { PropertiesPanel } from '../ui/PropertiesPanel.js';
import { ScenarioPanel } from '../ui/ScenarioPanel.js';
import { TrainerPanel } from '../ui/TrainerPanel.js';
import { WelcomePanel } from '../ui/WelcomePanel.js';
import { PracticePanel } from '../ui/PracticePanel.js';
import { TerminalManager } from '../ui/TerminalManager.js';
import { PacketEngine } from '../engine/PacketEngine.js';
import { PacketAnimator } from '../ui/PacketAnimator.js';
import { TelemetryRail } from '../ui/TelemetryRail.js';

const AUTOSAVE_TOPOLOGY_EVENTS = [
  'nodeAdded',
  'nodeRemoved',
  'nodeUpdated',
  'edgeAdded',
  'edgeRemoved',
  'cleared',
  'loaded',
];

function bootstrap() {
  const topology = new Topology();
  const camera = new Camera();
  const selection = new SelectionManager();
  const history = new HistoryManager();
  const storage = new StorageManager();

  const container = document.getElementById('canvas-container');
  const svgRoot = document.getElementById('canvas-root');
  const canvasManager = new CanvasManager({
    container,
    svgRoot,
    topology,
    camera,
    selection,
    history,
  });

  const packetEngine = new PacketEngine(topology);
  const packetAnimator = new PacketAnimator({ container, topology, camera });

  // The live-state rail tracks whichever device is selected, and refreshes on
  // every canvas render so learned tables appear as soon as a ping resolves.
  const telemetryRail = new TelemetryRail({ container, topology, engine: packetEngine });
  canvasManager.addEventListener('viewChange', () => {
    telemetryRail.setVisible(canvasManager.telemetryVisible);
    telemetryRail.refresh();
  });
  selection.addEventListener('change', () => {
    const [nodeId] = selection.getSelectedNodeIds();
    telemetryRail.setFocus(nodeId ?? null);
  });

  // Cabling/addressing changes invalidate cached ARP entries — clear them so
  // pings re-resolve against the current topology.
  for (const eventName of ['edgeAdded', 'edgeRemoved', 'nodeRemoved', 'loaded', 'cleared']) {
    topology.addEventListener(eventName, () => packetEngine.reset());
  }

  const terminals = new TerminalManager({
    topology,
    layer: document.getElementById('terminal-layer'),
    packetEngine,
    onPackets: (events) => {
      packetAnimator.play(events);
      // Traffic is what fills the ARP and MAC tables, and it never triggers a
      // canvas render — so the rail has to be told the moment packets fly.
      telemetryRail.refresh();
    },
  });

  const contextMenu = new ContextMenu(document.getElementById('context-menu'));
  const interactions = new CanvasInteractions(canvasManager, {
    onActivateNode: (nodeId) => terminals.open(nodeId),
    onContextMenu: (type, id, clientX, clientY) =>
      showContextMenu({
        contextMenu,
        canvasManager,
        topology,
        camera,
        interactions,
        terminals,
        type,
        id,
        clientX,
        clientY,
      }),
  });

  new Toolbar({ topology, camera, history, storage, canvasManager });
  new PropertiesPanel({ topology, selection, history, canvasManager, terminals });
  new ScenarioPanel({ topology, engine: packetEngine, history });
  new PracticePanel({ topology, engine: packetEngine, history });
  new TrainerPanel();
  new WelcomePanel();

  // On phones the properties panel is a collapsible bottom drawer: tapping
  // its title toggles it, and selecting a device auto-opens it (so the
  // "Open CLI" button is one tap away). Harmless on desktop.
  setupMobileDrawer(selection);

  // Surface transient engine messages (e.g. "no free interface") in the
  // status bar's mode slot for a few seconds.
  const statusMode = document.getElementById('status-mode');
  canvasManager.addEventListener('notify', (event) => {
    const previous = statusMode.textContent;
    statusMode.textContent = event.detail.message;
    setTimeout(() => {
      statusMode.textContent = canvasManager.connectMode ? 'Connect mode' : 'Select mode';
      if (statusMode.textContent === '') statusMode.textContent = previous;
    }, 2500);
  });

  restoreAutosave(topology, storage);
  wireAutosave(topology, storage);

  window.addEventListener('resize', () => canvasManager.render());
}

/**
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {import('../engine/StorageManager.js').StorageManager} storage
 */
function restoreAutosave(topology, storage) {
  const data = storage.loadAutosave();
  if (data) topology.loadFromJSON(data);
}

/**
 * Turns the properties panel into a collapsible bottom drawer on small
 * screens: tap the title to toggle, and selecting a single device opens it.
 * @param {import('../ui/SelectionManager.js').SelectionManager} selection
 */
function setupMobileDrawer(selection) {
  const panel = document.getElementById('properties-panel');
  const title = panel?.querySelector('.panel-title');
  if (!panel || !title) return;
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

  if (isMobile()) panel.classList.add('collapsed');
  title.addEventListener('click', () => {
    if (isMobile()) panel.classList.toggle('collapsed');
  });
  selection.addEventListener('change', () => {
    if (isMobile() && selection.getSelectedNodeIds().length === 1) {
      panel.classList.remove('collapsed');
    }
  });
}

/**
 * @param {import('../topology/Topology.js').Topology} topology
 * @param {import('../engine/StorageManager.js').StorageManager} storage
 */
function wireAutosave(topology, storage) {
  const save = () => storage.saveAutosave(topology);
  for (const eventName of AUTOSAVE_TOPOLOGY_EVENTS) {
    topology.addEventListener(eventName, save);
  }
  window.addEventListener('beforeunload', save);
}

/**
 * Builds and shows the right-click menu for a node, edge, or empty canvas.
 * @param {object} ctx
 */
function showContextMenu(ctx) {
  const {
    contextMenu,
    canvasManager,
    topology,
    camera,
    interactions,
    terminals,
    type,
    id,
    clientX,
    clientY,
  } = ctx;

  if (type === 'node') {
    const node = topology.getNode(id);
    const hasDevice = Boolean(node && node.device);
    contextMenu.show(clientX, clientY, [
      {
        label: 'Open CLI',
        shortcut: 'Enter',
        disabled: !hasDevice,
        action: () => terminals.open(id),
      },
      {
        label: 'Rename',
        shortcut: 'Dbl-click',
        action: () => {
          if (!node) return;
          interactions.inlineEditor.begin(node, camera, (newHostname) =>
            canvasManager.renameNode(id, newHostname),
          );
        },
      },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => canvasManager.duplicateSelection() },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => canvasManager.copySelection() },
      { separator: true },
      { label: 'Delete', shortcut: 'Del', action: () => canvasManager.deleteSelection() },
    ]);
    return;
  }

  if (type === 'edge') {
    contextMenu.show(clientX, clientY, [
      { label: 'Delete cable', shortcut: 'Del', action: () => canvasManager.deleteSelection() },
    ]);
    return;
  }

  contextMenu.show(clientX, clientY, [
    {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      disabled: canvasManager.clipboard.length === 0,
      action: () => canvasManager.pasteClipboard(),
    },
    { label: 'Select all', shortcut: 'Ctrl+A', action: () => canvasManager.selectAll() },
  ]);
}

bootstrap();
