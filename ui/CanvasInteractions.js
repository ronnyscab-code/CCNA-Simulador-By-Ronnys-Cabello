/**
 * CanvasInteractions.js
 *
 * Translates raw pointer, wheel, keyboard, and drag-and-drop DOM events
 * into calls on `CanvasManager`'s public action methods. This is the only
 * file that reads `event.clientX`/`event.target.closest(...)` — everything
 * downstream works in world coordinates and semantic actions.
 *
 * Owns only *gesture* state (is a drag/pan/rubber-band in progress, and
 * where it started) — everything persistent (selection, camera, topology)
 * lives on the objects `CanvasManager` was constructed with.
 */

import { InlineNodeEditor } from './InlineNodeEditor.js';

export class CanvasInteractions {
  /**
   * @param {import('./CanvasManager.js').CanvasManager} canvasManager
   * @param {{onContextMenu?: (type: 'node'|'edge'|'canvas', id: string|null, clientX: number, clientY: number) => void}} [options]
   */
  constructor(canvasManager, options = {}) {
    this.canvasManager = canvasManager;
    this.container = canvasManager.container;
    this.onContextMenu = options.onContextMenu ?? null;
    this.inlineEditor = new InlineNodeEditor(this.container);

    this.isPanning = false;
    this.panLast = null;
    this.isDraggingNodes = false;
    this.dragStartWorld = null;
    /** @type {Map<string, {nodeId: string, from: {x:number,y:number}, to: {x:number,y:number}}>|null} */
    this.dragMoves = null;
    this.isRubberBanding = false;
    this.rubberStartScreen = null;

    this._bindHandlers();
    this._attach();
  }

  _bindHandlers() {
    this.onPointerDown = this._onPointerDown.bind(this);
    this.onPointerMove = this._onPointerMove.bind(this);
    this.onPointerUp = this._onPointerUp.bind(this);
    this.onWheel = this._onWheel.bind(this);
    this.onDblClick = this._onDblClick.bind(this);
    this.onContextMenuEvent = this._onContextMenuEvent.bind(this);
    this.onDragOver = this._onDragOver.bind(this);
    this.onDrop = this._onDrop.bind(this);
    this.onKeyDown = this._onKeyDown.bind(this);
  }

  _attach() {
    this.container.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('wheel', this.onWheel, { passive: false });
    this.container.addEventListener('dblclick', this.onDblClick);
    this.container.addEventListener('contextmenu', this.onContextMenuEvent);
    this.container.addEventListener('dragover', this.onDragOver);
    this.container.addEventListener('drop', this.onDrop);
    window.addEventListener('keydown', this.onKeyDown);

    this.canvasManager.addEventListener('viewChange', () => {
      this.container.classList.toggle('connect-mode-active', this.canvasManager.connectMode);
    });
  }

  // --- Pointer: down ----------------------------------------------------

  _onPointerDown(event) {
    if (this.inlineEditor.isEditing()) return;

    if (event.button === 1) {
      event.preventDefault();
      this.isPanning = true;
      this.panLast = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0) return;

    const nodeEl = event.target.closest('.topology-node');
    const edgeEl = event.target.closest('.topology-edge-group');

    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      if (this.canvasManager.connectMode) {
        this.canvasManager.handleConnectClick(nodeId);
        return;
      }
      this._startNodeDrag(nodeId, event);
      return;
    }

    if (edgeEl) {
      this.canvasManager.selection.selectEdge(edgeEl.dataset.edgeId);
      return;
    }

    if (this.canvasManager.connectMode && this.canvasManager.connectSourceId) {
      this.canvasManager.cancelConnect();
      return;
    }
    this._startRubberBand(event);
  }

  _startNodeDrag(nodeId, event) {
    const selection = this.canvasManager.selection;
    if (event.shiftKey) {
      selection.toggleNode(nodeId);
    } else if (!selection.isNodeSelected(nodeId)) {
      selection.selectNode(nodeId);
    }

    const ids = selection.getSelectedNodeIds();
    if (ids.length === 0) return;

    this.isDraggingNodes = true;
    this.dragStartWorld = this.canvasManager.worldPointFromClient(event.clientX, event.clientY);
    this.dragMoves = new Map();
    for (const id of ids) {
      const node = this.canvasManager.topology.getNode(id);
      if (!node) continue;
      this.dragMoves.set(id, {
        nodeId: id,
        from: { x: node.x, y: node.y },
        to: { x: node.x, y: node.y },
      });
    }
  }

  _startRubberBand(event) {
    if (!event.shiftKey) this.canvasManager.clearSelection();
    this.isRubberBanding = true;
    this.rubberStartScreen = this.canvasManager.screenPointFromClient(event.clientX, event.clientY);
  }

  // --- Pointer: move ------------------------------------------------------

  _onPointerMove(event) {
    if (this.isPanning) {
      const dx = event.clientX - this.panLast.x;
      const dy = event.clientY - this.panLast.y;
      this.canvasManager.camera.panBy(dx, dy);
      this.panLast = { x: event.clientX, y: event.clientY };
      return;
    }

    if (this.isDraggingNodes) {
      const current = this.canvasManager.worldPointFromClient(event.clientX, event.clientY);
      const dx = current.x - this.dragStartWorld.x;
      const dy = current.y - this.dragStartWorld.y;
      const liveMoves = [];
      for (const move of this.dragMoves.values()) {
        const snapped = this.canvasManager.snapPoint({ x: move.from.x + dx, y: move.from.y + dy });
        move.to = snapped;
        liveMoves.push({ nodeId: move.nodeId, x: snapped.x, y: snapped.y });
      }
      this.canvasManager.moveNodesLive(liveMoves);
      return;
    }

    if (this.isRubberBanding) {
      const current = this.canvasManager.screenPointFromClient(event.clientX, event.clientY);
      const start = this.rubberStartScreen;
      this.canvasManager.updateRubberBandSelection({
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      });
      return;
    }

    if (this.canvasManager.connectMode && this.canvasManager.connectSourceId) {
      this.canvasManager.updateConnectPreview(
        this.canvasManager.worldPointFromClient(event.clientX, event.clientY),
      );
    }
  }

  // --- Pointer: up -----------------------------------------------------

  _onPointerUp() {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }
    if (this.isDraggingNodes) {
      this.isDraggingNodes = false;
      this.canvasManager.commitNodeMove(Array.from(this.dragMoves.values()));
      this.dragMoves = null;
      return;
    }
    if (this.isRubberBanding) {
      this.isRubberBanding = false;
      this.canvasManager.endRubberBandSelection();
    }
  }

  // --- Wheel / dblclick / context menu / DnD ----------------------------

  _onWheel(event) {
    event.preventDefault();
    const screen = this.canvasManager.screenPointFromClient(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.canvasManager.camera.zoomAt(factor, screen.x, screen.y);
  }

  _onDblClick(event) {
    const nodeEl = event.target.closest('.topology-node');
    if (!nodeEl) return;
    const nodeId = nodeEl.dataset.nodeId;
    const node = this.canvasManager.topology.getNode(nodeId);
    if (!node) return;

    this.inlineEditor.begin(node, this.canvasManager.camera, (newHostname) => {
      this.canvasManager.renameNode(nodeId, newHostname);
    });
  }

  _onContextMenuEvent(event) {
    event.preventDefault();
    if (!this.onContextMenu) return;

    const nodeEl = event.target.closest('.topology-node');
    const edgeEl = event.target.closest('.topology-edge-group');

    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      if (!this.canvasManager.selection.isNodeSelected(nodeId)) {
        this.canvasManager.selection.selectNode(nodeId);
      }
      this.onContextMenu('node', nodeId, event.clientX, event.clientY);
    } else if (edgeEl) {
      const edgeId = edgeEl.dataset.edgeId;
      this.canvasManager.selection.selectEdge(edgeId);
      this.onContextMenu('edge', edgeId, event.clientX, event.clientY);
    } else {
      this.onContextMenu('canvas', null, event.clientX, event.clientY);
    }
  }

  _onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  _onDrop(event) {
    event.preventDefault();
    const deviceType = event.dataTransfer.getData('text/device-type');
    if (!deviceType) return;
    this.canvasManager.addDeviceAtClient(deviceType, event.clientX, event.clientY);
  }

  // --- Keyboard ----------------------------------------------------------

  _onKeyDown(event) {
    if (this._isTypingTarget(event.target)) return;

    const meta = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const cm = this.canvasManager;

    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      cm.deleteSelection();
    } else if (meta && key === 'z' && event.shiftKey) {
      event.preventDefault();
      cm.history.redo();
    } else if (meta && key === 'z') {
      event.preventDefault();
      cm.history.undo();
    } else if (meta && key === 'y') {
      event.preventDefault();
      cm.history.redo();
    } else if (meta && key === 'd') {
      event.preventDefault();
      cm.duplicateSelection();
    } else if (meta && key === 'c') {
      cm.copySelection();
    } else if (meta && key === 'v') {
      cm.pasteClipboard();
    } else if (meta && key === 'a') {
      event.preventDefault();
      cm.selectAll();
    } else if (key === '+' || key === '=') {
      cm.zoomIn();
    } else if (key === '-') {
      cm.zoomOut();
    } else if (key === '0') {
      cm.zoomResetView();
    } else if (key === 'c' && !meta) {
      cm.toggleConnectMode();
    } else if (key === 'escape') {
      cm.cancelConnect();
      cm.clearSelection();
    }
  }

  /**
   * @param {EventTarget} target
   * @returns {boolean}
   */
  _isTypingTarget(target) {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }
}
