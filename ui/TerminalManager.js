/**
 * TerminalManager.js
 *
 * Owns the collection of open terminal windows and the per-device
 * `CliSession`s behind them. Sessions are cached per node id, so closing and
 * reopening a device's CLI preserves its mode and command history for as
 * long as the node exists.
 *
 * When a CLI command changes device config, the session calls back here and
 * we push a no-op `updateNode` through the topology. That single event makes
 * the canvas re-render (a `hostname` change updates the label), the
 * properties panel refresh, and the autosave fire — without the CLI layer
 * needing to know any of those consumers exist.
 */

import { CliSession } from '../cli/CliSession.js';
import { Terminal } from './Terminal.js';

export class TerminalManager {
  /**
   * @param {object} deps
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {HTMLElement} deps.layer - Overlay container for terminal windows.
   */
  constructor({ topology, layer }) {
    this.topology = topology;
    this.layer = layer;
    /** @type {Map<string, CliSession>} */
    this.sessions = new Map();
    /** @type {Map<string, Terminal>} */
    this.terminals = new Map();

    // Drop cached sessions when their node is deleted.
    this.topology.addEventListener('nodeRemoved', (event) => {
      const { id } = event.detail;
      this.sessions.delete(id);
      const terminal = this.terminals.get(id);
      if (terminal) terminal.close();
    });
  }

  /**
   * @param {string} nodeId
   * @returns {CliSession|null}
   */
  _sessionFor(nodeId) {
    if (this.sessions.has(nodeId)) return this.sessions.get(nodeId);
    const node = this.topology.getNode(nodeId);
    if (!node || !node.device) return null;
    const session = new CliSession({
      node,
      topology: this.topology,
      onConfigChange: () => this.topology.updateNode(nodeId, {}),
    });
    this.sessions.set(nodeId, session);
    return session;
  }

  /**
   * Opens (or focuses, if already open) the CLI for a device.
   * @param {string} nodeId
   */
  open(nodeId) {
    const existing = this.terminals.get(nodeId);
    if (existing) {
      existing.focus();
      return;
    }
    const session = this._sessionFor(nodeId);
    if (!session) return;

    const terminal = new Terminal({
      session,
      root: this.layer,
      onClose: () => this.terminals.delete(nodeId),
    });
    this.terminals.set(nodeId, terminal);
  }
}
