/**
 * CanvasManager.js
 *
 * The editor's orchestration facade. Owns the SVG canvas and every piece of
 * transient view state that doesn't belong in `Topology` (grid visibility,
 * snap-to-grid, connect-mode, rubber-band box, clipboard). Every editing
 * action the UI can perform — add/move/delete/duplicate/rename devices,
 * connect cables, select — is a method here, so both keyboard shortcuts
 * (`CanvasInteractions`) and toolbar buttons (`Toolbar`) call the same
 * code path instead of duplicating logic.
 *
 * `CanvasManager` never touches raw pointer/keyboard events itself — that
 * parsing lives in `CanvasInteractions`. It never decides pixel-level SVG
 * markup either — that lives in `CanvasRenderer`. This file is the glue.
 */

import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';
import {
  AddNodeCommand,
  RemoveNodeCommand,
  RemoveEdgeCommand,
  AddEdgeCommand,
  MoveNodesCommand,
  RenameNodeCommand,
  CompositeCommand,
} from '../topology/TopologyCommands.js';
import {
  GRID_SIZE,
  buildCanvasLayers,
  updateGrid,
  updateWorldTransform,
  renderNodes,
  renderEdges,
  renderPendingEdge,
  renderSelectionBox,
} from './CanvasRenderer.js';

export class CanvasManager extends EventTarget {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.container
   * @param {SVGSVGElement} deps.svgRoot
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {import('./Camera.js').Camera} deps.camera
   * @param {import('./SelectionManager.js').SelectionManager} deps.selection
   * @param {import('./HistoryManager.js').HistoryManager} deps.history
   */
  constructor({ container, svgRoot, topology, camera, selection, history }) {
    super();
    this.container = container;
    this.svgRoot = svgRoot;
    this.topology = topology;
    this.camera = camera;
    this.selection = selection;
    this.history = history;

    this.gridVisible = true;
    this.snapEnabled = true;
    this.connectMode = false;
    this.connectSourceId = null;
    this.pendingEdgeToPoint = null;
    this.selectionBoxScreen = null;
    this.clipboard = [];

    this.refs = buildCanvasLayers(this.svgRoot);

    this.topology.addEventListener('nodeRemoved', () => this._onTopologyStructuralChange());
    this.topology.addEventListener('edgeRemoved', () => this._onTopologyStructuralChange());
    this.topology.addEventListener('cleared', () => this._onTopologyStructuralChange());
    this.topology.addEventListener('loaded', () => this._onTopologyStructuralChange());
    this.topology.addEventListener('nodeAdded', () => this.render());
    this.topology.addEventListener('nodeUpdated', () => this.render());
    this.topology.addEventListener('edgeAdded', () => this.render());
    this.selection.addEventListener('change', () => this.render());
    this.camera.addEventListener('change', () => this.render());

    this.render();
  }

  _onTopologyStructuralChange() {
    this.selection.pruneMissing(this.topology);
    this.render();
  }

  /**
   * Re-renders the entire canvas from current state. Safe to call
   * liberally — editor-scale topologies (dozens of devices) re-render
   * cheaply, and correctness matters far more than micro-optimizing this
   * for v0.1.
   */
  render() {
    updateGrid(this.refs, this.camera, this.gridVisible);
    updateWorldTransform(this.refs, this.camera);

    const nodes = this.topology.getNodes();
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    renderNodes(this.refs, nodes, this.selection.selectedNodeIds, this.connectSourceId);
    renderEdges(this.refs, this.topology.getEdges(), nodesById, this.selection.selectedEdgeIds);

    const sourceNode = this.connectSourceId ? this.topology.getNode(this.connectSourceId) : null;
    renderPendingEdge(this.refs, sourceNode, this.pendingEdgeToPoint);
    renderSelectionBox(this.refs, this.selectionBoxScreen);

    this.dispatchEvent(new CustomEvent('viewChange'));
  }

  // --- Coordinate helpers ------------------------------------------------

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x: number, y: number}} container-relative screen coordinates
   */
  screenPointFromClient(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x: number, y: number}} world coordinates
   */
  worldPointFromClient(clientX, clientY) {
    const screen = this.screenPointFromClient(clientX, clientY);
    return this.camera.toWorld(screen.x, screen.y);
  }

  /**
   * @param {{x: number, y: number}} point
   * @returns {{x: number, y: number}}
   */
  snapPoint(point) {
    if (!this.snapEnabled) return point;
    return {
      x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
    };
  }

  // --- Devices -------------------------------------------------------------

  /**
   * @param {string} deviceType
   * @param {number} clientX
   * @param {number} clientY
   * @returns {import('../topology/Node.js').Node}
   */
  addDeviceAtClient(deviceType, clientX, clientY) {
    const point = this.snapPoint(this.worldPointFromClient(clientX, clientY));
    const node = new Node({ id: this.topology.generateId(), deviceType, x: point.x, y: point.y });
    this.history.execute(new AddNodeCommand(this.topology, node));
    this.selection.selectNode(node.id);
    return node;
  }

  // --- Node dragging ---------------------------------------------------

  /**
   * Applies live position updates during a drag gesture, bypassing history
   * (the whole gesture becomes a single undo step on `commitNodeMove`).
   * @param {Array<{nodeId: string, x: number, y: number}>} moves
   */
  moveNodesLive(moves) {
    for (const move of moves) {
      this.topology.updateNode(move.nodeId, { x: move.x, y: move.y });
    }
  }

  /**
   * Finalizes a drag gesture as a single undoable step.
   * @param {Array<{nodeId: string, from: {x:number,y:number}, to: {x:number,y:number}}>} moves
   */
  commitNodeMove(moves) {
    const real = moves.filter((m) => m.from.x !== m.to.x || m.from.y !== m.to.y);
    if (real.length === 0) return;
    this.history.execute(new MoveNodesCommand(this.topology, real));
  }

  // --- Selection-driven editing ---------------------------------------

  selectAll() {
    this.selection.setSelection(
      this.topology.getNodes().map((n) => n.id),
      this.topology.getEdges().map((e) => e.id),
    );
  }

  clearSelection() {
    this.selection.clear();
  }

  deleteSelection() {
    const nodeIds = this.selection.getSelectedNodeIds();
    const edgeIds = this.selection.getSelectedEdgeIds();
    if (nodeIds.length === 0 && edgeIds.length === 0) return;

    const commands = [
      ...edgeIds
        .filter((id) => this.topology.getEdge(id))
        .map((id) => new RemoveEdgeCommand(this.topology, id)),
      ...nodeIds
        .filter((id) => this.topology.getNode(id))
        .map((id) => new RemoveNodeCommand(this.topology, id)),
    ];
    if (commands.length === 0) return;

    this.history.execute(new CompositeCommand(commands));
    this.selection.clear();
  }

  duplicateSelection() {
    const nodeIds = this.selection.getSelectedNodeIds();
    if (nodeIds.length === 0) return;

    const commands = [];
    const newIds = [];
    for (const id of nodeIds) {
      const original = this.topology.getNode(id);
      if (!original) continue;
      const clone = original.clone(this.topology.generateId());
      commands.push(new AddNodeCommand(this.topology, clone));
      newIds.push(clone.id);
    }
    if (commands.length === 0) return;

    this.history.execute(new CompositeCommand(commands));
    this.selection.setSelection(newIds);
  }

  copySelection() {
    const nodeIds = this.selection.getSelectedNodeIds();
    this.clipboard = nodeIds
      .map((id) => this.topology.getNode(id))
      .filter(Boolean)
      .map((node) => node.toJSON());
  }

  pasteClipboard() {
    if (this.clipboard.length === 0) return;

    const commands = [];
    const newIds = [];
    for (const data of this.clipboard) {
      const node = new Node({
        ...data,
        id: this.topology.generateId(),
        x: data.x + GRID_SIZE,
        y: data.y + GRID_SIZE,
        hostname: `${data.hostname}-copy`,
      });
      commands.push(new AddNodeCommand(this.topology, node));
      newIds.push(node.id);
    }

    this.history.execute(new CompositeCommand(commands));
    this.selection.setSelection(newIds);
    // Cascade: pasting again pastes relative to this paste, like most editors.
    this.clipboard = newIds.map((id) => this.topology.getNode(id).toJSON());
  }

  /**
   * @param {string} nodeId
   * @param {string} newHostname
   */
  renameNode(nodeId, newHostname) {
    const node = this.topology.getNode(nodeId);
    if (!node) return;
    const trimmed = newHostname.trim();
    if (!trimmed || trimmed === node.hostname) return;
    this.history.execute(new RenameNodeCommand(this.topology, nodeId, node.hostname, trimmed));
  }

  // --- View ------------------------------------------------------------

  toggleGrid() {
    this.gridVisible = !this.gridVisible;
    this.render();
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.dispatchEvent(new CustomEvent('viewChange'));
  }

  zoomIn() {
    const rect = this.container.getBoundingClientRect();
    this.camera.zoomIn(rect.width / 2, rect.height / 2);
  }

  zoomOut() {
    const rect = this.container.getBoundingClientRect();
    this.camera.zoomOut(rect.width / 2, rect.height / 2);
  }

  zoomResetView() {
    this.camera.reset();
  }

  // --- Connect mode ------------------------------------------------------

  toggleConnectMode() {
    this.connectMode = !this.connectMode;
    if (!this.connectMode) this.cancelConnect();
    else this.render();
    this.dispatchEvent(new CustomEvent('viewChange'));
  }

  cancelConnect() {
    this.connectSourceId = null;
    this.pendingEdgeToPoint = null;
    this.render();
  }

  /**
   * Called when a node is clicked while connect mode is active. The first
   * call picks the source device; the second picks the target and creates
   * the cable, then the tool stays armed so the user can chain more
   * connections without re-toggling it.
   * @param {string} nodeId
   */
  handleConnectClick(nodeId) {
    if (!this.connectSourceId) {
      this.connectSourceId = nodeId;
      this.render();
      return;
    }
    if (
      nodeId === this.connectSourceId ||
      this.topology.areConnected(this.connectSourceId, nodeId)
    ) {
      this.cancelConnect();
      return;
    }

    const edge = new Edge({
      id: this.topology.generateId(),
      sourceNodeId: this.connectSourceId,
      targetNodeId: nodeId,
    });
    this.history.execute(new AddEdgeCommand(this.topology, edge));
    this.connectSourceId = null;
    this.pendingEdgeToPoint = null;
    this.render();
  }

  /**
   * @param {{x: number, y: number}} worldPoint
   */
  updateConnectPreview(worldPoint) {
    if (!this.connectSourceId) return;
    this.pendingEdgeToPoint = worldPoint;
    this.render();
  }

  // --- Rubber-band selection ---------------------------------------------

  /**
   * @param {{x: number, y: number, width: number, height: number}} boxScreen
   */
  updateRubberBandSelection(boxScreen) {
    this.selectionBoxScreen = boxScreen;
    const hits = this.topology.getNodes().filter((node) => {
      const p = this.camera.toScreen(node.x, node.y);
      return (
        p.x >= boxScreen.x &&
        p.x <= boxScreen.x + boxScreen.width &&
        p.y >= boxScreen.y &&
        p.y <= boxScreen.y + boxScreen.height
      );
    });
    this.selection.setSelection(hits.map((n) => n.id));
  }

  endRubberBandSelection() {
    this.selectionBoxScreen = null;
    this.render();
  }
}
