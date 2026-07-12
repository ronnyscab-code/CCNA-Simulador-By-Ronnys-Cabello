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

  const contextMenu = new ContextMenu(document.getElementById('context-menu'));
  const interactions = new CanvasInteractions(canvasManager, {
    onContextMenu: (type, id, clientX, clientY) =>
      showContextMenu({
        contextMenu,
        canvasManager,
        topology,
        camera,
        interactions,
        type,
        id,
        clientX,
        clientY,
      }),
  });

  new Toolbar({ topology, camera, history, storage, canvasManager });

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
  const { contextMenu, canvasManager, topology, camera, interactions, type, id, clientX, clientY } =
    ctx;

  if (type === 'node') {
    contextMenu.show(clientX, clientY, [
      {
        label: 'Rename',
        shortcut: 'Dbl-click',
        action: () => {
          const node = topology.getNode(id);
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
