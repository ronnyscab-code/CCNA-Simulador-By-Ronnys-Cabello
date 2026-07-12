/**
 * SelectionManager.js
 *
 * Tracks which topology nodes and edges are currently selected on the
 * canvas. Selection is kept as plain id sets rather than references to
 * `Node`/`Edge` objects so it stays valid even as the underlying objects
 * are replaced by undo/redo or a topology reload — `CanvasRenderer` simply
 * asks "is this id selected?" on every render.
 *
 * Dispatches a single "change" event after any mutation, rather than one
 * event per id, so listeners can do one batched re-render.
 */

export class SelectionManager extends EventTarget {
  constructor() {
    super();
    /** @type {Set<string>} */
    this.selectedNodeIds = new Set();
    /** @type {Set<string>} */
    this.selectedEdgeIds = new Set();
  }

  /**
   * Replaces the current selection with a single node.
   * @param {string} nodeId
   */
  selectNode(nodeId) {
    this.selectedNodeIds = new Set([nodeId]);
    this.selectedEdgeIds.clear();
    this._emitChange();
  }

  /**
   * Replaces the current selection with a single edge.
   * @param {string} edgeId
   */
  selectEdge(edgeId) {
    this.selectedEdgeIds = new Set([edgeId]);
    this.selectedNodeIds.clear();
    this._emitChange();
  }

  /**
   * Toggles a node in/out of the selection without clearing the rest
   * (shift-click behavior).
   * @param {string} nodeId
   */
  toggleNode(nodeId) {
    if (this.selectedNodeIds.has(nodeId)) {
      this.selectedNodeIds.delete(nodeId);
    } else {
      this.selectedNodeIds.add(nodeId);
    }
    this._emitChange();
  }

  /**
   * Replaces the selection with an explicit set of node/edge ids (used by
   * rubber-band rectangle selection and "select all").
   * @param {string[]} nodeIds
   * @param {string[]} [edgeIds]
   */
  setSelection(nodeIds, edgeIds = []) {
    this.selectedNodeIds = new Set(nodeIds);
    this.selectedEdgeIds = new Set(edgeIds);
    this._emitChange();
  }

  /**
   * @param {string} nodeId
   * @returns {boolean}
   */
  isNodeSelected(nodeId) {
    return this.selectedNodeIds.has(nodeId);
  }

  /**
   * @param {string} edgeId
   * @returns {boolean}
   */
  isEdgeSelected(edgeId) {
    return this.selectedEdgeIds.has(edgeId);
  }

  /**
   * @returns {string[]}
   */
  getSelectedNodeIds() {
    return Array.from(this.selectedNodeIds);
  }

  /**
   * @returns {string[]}
   */
  getSelectedEdgeIds() {
    return Array.from(this.selectedEdgeIds);
  }

  /**
   * @returns {number} total number of selected nodes + edges.
   */
  size() {
    return this.selectedNodeIds.size + this.selectedEdgeIds.size;
  }

  /**
   * @returns {boolean}
   */
  isEmpty() {
    return this.size() === 0;
  }

  clear() {
    if (this.isEmpty()) return;
    this.selectedNodeIds.clear();
    this.selectedEdgeIds.clear();
    this._emitChange();
  }

  /**
   * Drops ids that no longer exist in the topology (called after external
   * mutations such as undo/redo or a fresh topology load).
   * @param {import('../topology/Topology.js').Topology} topology
   */
  pruneMissing(topology) {
    let changed = false;
    for (const id of this.selectedNodeIds) {
      if (!topology.getNode(id)) {
        this.selectedNodeIds.delete(id);
        changed = true;
      }
    }
    for (const id of this.selectedEdgeIds) {
      if (!topology.getEdge(id)) {
        this.selectedEdgeIds.delete(id);
        changed = true;
      }
    }
    if (changed) this._emitChange();
  }

  _emitChange() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}
