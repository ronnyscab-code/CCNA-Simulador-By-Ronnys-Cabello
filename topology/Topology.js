/**
 * Topology.js
 *
 * The pure data model for a network topology: a set of `Node`s and `Edge`s,
 * with JSON serialization and event-based reactivity. This class has zero
 * knowledge of the DOM, SVG, or any rendering concern — the `ui/` layer
 * subscribes to its events and re-renders in response. See
 * `docs/ARCHITECTURE.md` for the full rationale.
 *
 * Events dispatched (all CustomEvent, detail shape noted):
 *   - "nodeAdded"    { node }
 *   - "nodeUpdated"  { node, changes }
 *   - "nodeRemoved"  { id }
 *   - "edgeAdded"    { edge }
 *   - "edgeRemoved"  { id }
 *   - "cleared"      {}
 *   - "loaded"       {}
 */

import { Node } from './Node.js';
import { Edge } from './Edge.js';

const SCHEMA_VERSION = 1;

/**
 * Generates a reasonably unique id. Prefers the Web Crypto API
 * (`crypto.randomUUID`), available in browsers and modern Node, and falls
 * back to a timestamp + random suffix so the engine layer still works in
 * older runtimes without adding a dependency.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class Topology extends EventTarget {
  constructor() {
    super();
    /** @type {Map<string, Node>} */
    this.nodes = new Map();
    /** @type {Map<string, Edge>} */
    this.edges = new Map();
  }

  /**
   * Returns a fresh unique id for a new node or edge.
   * @returns {string}
   */
  generateId() {
    return generateId();
  }

  // --- Nodes ---------------------------------------------------------

  /**
   * @param {Node} node
   * @returns {Node}
   */
  addNode(node) {
    if (!(node instanceof Node)) throw new TypeError('addNode expects a Node instance');
    if (this.nodes.has(node.id)) throw new Error(`Node id already exists: ${node.id}`);
    this.nodes.set(node.id, node);
    this.dispatchEvent(new CustomEvent('nodeAdded', { detail: { node } }));
    return node;
  }

  /**
   * Removes a node and cascades removal to every edge touching it.
   * @param {string} id
   * @returns {boolean} true if a node was removed
   */
  removeNode(id) {
    const node = this.nodes.get(id);
    if (!node) return false;

    for (const edge of this.getEdgesForNode(id)) {
      this.removeEdge(edge.id);
    }

    this.nodes.delete(id);
    this.dispatchEvent(new CustomEvent('nodeRemoved', { detail: { id } }));
    return true;
  }

  /**
   * Merges the given changes onto a node (e.g. { x, y } after a drag, or
   * { hostname } after a rename) and dispatches "nodeUpdated".
   * @param {string} id
   * @param {Partial<{hostname: string, x: number, y: number}>} changes
   * @returns {Node|null}
   */
  updateNode(id, changes) {
    const node = this.nodes.get(id);
    if (!node) return null;
    Object.assign(node, changes);
    this.dispatchEvent(new CustomEvent('nodeUpdated', { detail: { node, changes } }));
    return node;
  }

  /**
   * @param {string} id
   * @returns {Node|undefined}
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * @returns {Node[]}
   */
  getNodes() {
    return Array.from(this.nodes.values());
  }

  // --- Edges -----------------------------------------------------------

  /**
   * @param {Edge} edge
   * @returns {Edge}
   */
  addEdge(edge) {
    if (!(edge instanceof Edge)) throw new TypeError('addEdge expects an Edge instance');
    if (!this.nodes.has(edge.sourceNodeId) || !this.nodes.has(edge.targetNodeId)) {
      throw new Error('Edge references a node that does not exist in this topology');
    }
    if (this.edges.has(edge.id)) throw new Error(`Edge id already exists: ${edge.id}`);

    this.edges.set(edge.id, edge);
    this.dispatchEvent(new CustomEvent('edgeAdded', { detail: { edge } }));
    return edge;
  }

  /**
   * @param {string} id
   * @returns {boolean} true if an edge was removed
   */
  removeEdge(id) {
    if (!this.edges.has(id)) return false;
    this.edges.delete(id);
    this.dispatchEvent(new CustomEvent('edgeRemoved', { detail: { id } }));
    return true;
  }

  /**
   * @param {string} id
   * @returns {Edge|undefined}
   */
  getEdge(id) {
    return this.edges.get(id);
  }

  /**
   * @returns {Edge[]}
   */
  getEdges() {
    return Array.from(this.edges.values());
  }

  /**
   * @param {string} nodeId
   * @returns {Edge[]}
   */
  getEdgesForNode(nodeId) {
    return this.getEdges().filter((edge) => edge.connectsTo(nodeId));
  }

  /**
   * Returns true if the two nodes already have a direct cable between them.
   * @param {string} nodeIdA
   * @param {string} nodeIdB
   * @returns {boolean}
   */
  areConnected(nodeIdA, nodeIdB) {
    return this.getEdgesForNode(nodeIdA).some((edge) => edge.connectsTo(nodeIdB));
  }

  // --- Whole-topology operations ----------------------------------------

  /**
   * Removes every node and edge.
   */
  clear() {
    this.nodes.clear();
    this.edges.clear();
    this.dispatchEvent(new CustomEvent('cleared'));
  }

  /**
   * @returns {{version: number, nodes: object[], edges: object[]}}
   */
  toJSON() {
    return {
      version: SCHEMA_VERSION,
      nodes: this.getNodes().map((node) => node.toJSON()),
      edges: this.getEdges().map((edge) => edge.toJSON()),
    };
  }

  /**
   * Replaces the current contents of this topology with the given
   * serialized data and dispatches a single "loaded" event (rather than one
   * event per node/edge) so the UI can do one full re-render.
   * @param {{nodes?: object[], edges?: object[]}} data
   */
  loadFromJSON(data) {
    this.nodes.clear();
    this.edges.clear();

    for (const nodeData of data.nodes ?? []) {
      const node = Node.fromJSON(nodeData);
      this.nodes.set(node.id, node);
    }
    for (const edgeData of data.edges ?? []) {
      const edge = Edge.fromJSON(edgeData);
      this.edges.set(edge.id, edge);
    }

    this.dispatchEvent(new CustomEvent('loaded'));
  }

  /**
   * Builds a brand-new Topology from serialized data.
   * @param {object} data
   * @returns {Topology}
   */
  static fromJSON(data) {
    const topology = new Topology();
    topology.loadFromJSON(data);
    return topology;
  }
}
