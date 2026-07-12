/**
 * HistoryManager.js
 *
 * Generic undo/redo command stack (Gang-of-Four Command pattern). Knows
 * nothing about topologies specifically — it only requires objects shaped
 * as `{ execute(), undo() }` (see `topology/TopologyCommands.js`). Every
 * mutation the editor makes to the `Topology` must go through
 * `history.execute(command)` rather than calling `Topology` methods
 * directly, so undo/redo stays correct by construction.
 *
 * Dispatches "change" whenever canUndo()/canRedo() may have changed, so the
 * toolbar can enable/disable the Undo/Redo buttons.
 */

const MAX_STACK_SIZE = 100;

export class HistoryManager extends EventTarget {
  constructor() {
    super();
    /** @type {Array<{execute: Function, undo: Function}>} */
    this.undoStack = [];
    /** @type {Array<{execute: Function, undo: Function}>} */
    this.redoStack = [];
  }

  /**
   * Runs a command's `execute()`, pushes it onto the undo stack, and clears
   * the redo stack (a fresh action invalidates any "future" that redo would
   * have replayed).
   * @param {{execute: Function, undo: Function}} command
   */
  execute(command) {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_STACK_SIZE) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this._emitChange();
  }

  /**
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * @returns {boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return;
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    this._emitChange();
  }

  redo() {
    if (!this.canRedo()) return;
    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);
    this._emitChange();
  }

  /**
   * Clears all history without undoing anything (used when starting a new
   * topology / loading a project — there is nothing meaningful left to
   * undo into).
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._emitChange();
  }

  _emitChange() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}
