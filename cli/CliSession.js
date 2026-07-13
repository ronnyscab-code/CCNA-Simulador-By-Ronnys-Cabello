/**
 * CliSession.js
 *
 * One interactive CLI session bound to a single device. Holds the mode
 * stack, the per-submode context (which interface / VLAN / line is being
 * configured), and the command history. It is DOM-free: a terminal widget
 * in `ui/` feeds it lines and renders the strings it returns, but the
 * session itself could just as well be driven by a test or a lab script.
 *
 * The command trees (one per mode) are built by `cli/commands.js`; their
 * handlers receive this session as their context, so a handler for
 * `interface` can call `session.enterInterface(...)`, a handler for
 * `ip address` can reach `session.currentInterface`, and so on.
 */

import { Mode, buildPrompt, isConfigMode } from './modes.js';
import { buildCommandTrees } from './commands.js';

export class CliSession {
  /**
   * @param {object} deps
   * @param {import('../topology/Node.js').Node} deps.node
   * @param {import('../topology/Topology.js').Topology} deps.topology
   * @param {() => void} [deps.onConfigChange] - Called after a command that
   *   mutates device config, so the UI can re-render / autosave.
   */
  constructor({ node, topology, onConfigChange = () => {} }) {
    this.node = node;
    this.device = node.device;
    this.topology = topology;
    this.onConfigChange = onConfigChange;

    /** @type {string[]} mode stack; last element is the current mode. */
    this.modeStack = [Mode.USER_EXEC];

    // Per-submode context.
    this.currentInterface = null; // NetworkInterface in config-if
    this.currentVlanId = null; // number in config-vlan
    this.currentLine = null; // string in config-line
    this.routerProcess = null; // { protocol, id } in config-router

    /** @type {string[]} executed command lines, oldest first. */
    this.commandHistory = [];
    this.historyCursor = 0;

    this.trees = buildCommandTrees();
  }

  // --- Mode helpers ------------------------------------------------------

  get currentMode() {
    return this.modeStack[this.modeStack.length - 1];
  }

  get prompt() {
    return buildPrompt(this.device.hostname, this.currentMode);
  }

  /**
   * @param {string} mode
   */
  _pushMode(mode) {
    this.modeStack.push(mode);
  }

  /**
   * Pops one config level. `exit` from global config returns to privileged
   * EXEC; from a submode it returns to global config.
   */
  exitMode() {
    if (this.modeStack.length > 1) {
      this.modeStack.pop();
    }
    // Clear submode context when leaving it.
    if (this.currentMode === Mode.GLOBAL_CONFIG || !isConfigMode(this.currentMode)) {
      this.currentInterface = null;
      this.currentVlanId = null;
      this.currentLine = null;
      this.routerProcess = null;
    }
  }

  /**
   * `end` / Ctrl-Z: jump straight back to privileged EXEC from any config mode.
   */
  endToPrivileged() {
    this.modeStack = [Mode.USER_EXEC, Mode.PRIVILEGED_EXEC];
    this.currentInterface = null;
    this.currentVlanId = null;
    this.currentLine = null;
    this.routerProcess = null;
  }

  enterPrivileged() {
    if (this.currentMode === Mode.USER_EXEC) this._pushMode(Mode.PRIVILEGED_EXEC);
  }

  enterUser() {
    this.modeStack = [Mode.USER_EXEC];
  }

  enterGlobalConfig() {
    this._pushMode(Mode.GLOBAL_CONFIG);
  }

  /**
   * @param {import('../devices/NetworkInterface.js').NetworkInterface} iface
   */
  enterInterface(iface) {
    this.currentInterface = iface;
    this._pushMode(Mode.INTERFACE_CONFIG);
  }

  /**
   * @param {number} vlanId
   */
  enterVlan(vlanId) {
    this.currentVlanId = vlanId;
    this._pushMode(Mode.VLAN_CONFIG);
  }

  /**
   * @param {string} line
   */
  enterLine(line) {
    this.currentLine = line;
    this._pushMode(Mode.LINE_CONFIG);
  }

  /**
   * @param {{protocol: string, id: number}} process
   */
  enterRouter(process) {
    this.routerProcess = process;
    this._pushMode(Mode.ROUTER_CONFIG);
  }

  /**
   * Signals that device config changed so the host app can persist/redraw.
   */
  notifyConfigChanged() {
    this.onConfigChange();
  }

  // --- Execution ---------------------------------------------------------

  /**
   * Runs one command line and returns its textual output (may be empty).
   * @param {string} line
   * @returns {string}
   */
  execute(line) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      this.commandHistory.push(trimmed);
      this.historyCursor = this.commandHistory.length;
    }
    if (trimmed.length === 0) return '';

    const tokens = trimmed.split(/\s+/);
    const tree = this.trees.get(this.currentMode);
    const resolved = tree.resolve(tokens);

    if (resolved.error !== undefined) {
      return resolved.error;
    }

    const result = resolved.handler(this, resolved.args);
    if (result === undefined || result === null) return '';
    if (typeof result === 'string') return result;
    return result.output ?? result.error ?? '';
  }

  /**
   * Tab/`?` completion for the current mode.
   * @param {string} line
   * @returns {{completions: string[], param: string|null, exact: boolean}}
   */
  complete(line) {
    const trailingSpace = /\s$/.test(line) || line.length === 0;
    const tokens = line.trim().length === 0 ? [] : line.trim().split(/\s+/);
    const tree = this.trees.get(this.currentMode);
    return tree.complete(tokens, trailingSpace);
  }

  // --- History navigation ------------------------------------------------

  /**
   * @returns {string|null} the previous history entry, or null at the top.
   */
  historyPrev() {
    if (this.commandHistory.length === 0) return null;
    this.historyCursor = Math.max(0, this.historyCursor - 1);
    return this.commandHistory[this.historyCursor] ?? '';
  }

  /**
   * @returns {string} the next history entry, or '' past the newest.
   */
  historyNext() {
    if (this.commandHistory.length === 0) return '';
    this.historyCursor = Math.min(this.commandHistory.length, this.historyCursor + 1);
    return this.commandHistory[this.historyCursor] ?? '';
  }
}
