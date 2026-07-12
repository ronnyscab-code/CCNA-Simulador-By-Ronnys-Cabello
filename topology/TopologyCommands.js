/**
 * TopologyCommands.js
 *
 * Command objects for `HistoryManager` (see `ui/HistoryManager.js`). Every
 * user action that mutates the `Topology` and should be undoable is
 * expressed as one of these commands rather than a direct method call, so
 * undo/redo correctness is structural instead of something every call site
 * has to remember to maintain.
 *
 * A command is any object exposing `execute()` and `undo()`. This module
 * only depends on `Topology`/`Node`/`Edge` — it stays DOM-free like the rest
 * of the `topology/` layer.
 */

/**
 * Adds a single node.
 */
export class AddNodeCommand {
  /**
   * @param {import('./Topology.js').Topology} topology
   * @param {import('./Node.js').Node} node
   */
  constructor(topology, node) {
    this.topology = topology;
    this.node = node;
  }

  execute() {
    this.topology.addNode(this.node);
  }

  undo() {
    this.topology.removeNode(this.node.id);
  }
}

/**
 * Removes a single node, capturing its incident edges so undo can restore
 * both the node and every cable that was connected to it.
 */
export class RemoveNodeCommand {
  /**
   * @param {import('./Topology.js').Topology} topology
   * @param {string} nodeId
   */
  constructor(topology, nodeId) {
    this.topology = topology;
    this.nodeId = nodeId;
    this.node = null;
    this.removedEdges = [];
  }

  execute() {
    this.node = this.topology.getNode(this.nodeId);
    if (!this.node) throw new Error(`RemoveNodeCommand: node not found: ${this.nodeId}`);
    this.removedEdges = this.topology.getEdgesForNode(this.nodeId);
    this.topology.removeNode(this.nodeId);
  }

  undo() {
    this.topology.addNode(this.node);
    for (const edge of this.removedEdges) {
      this.topology.addEdge(edge);
    }
  }
}

/**
 * Moves one or more nodes from their previous positions to new positions.
 * Used for both single-node drags and multi-select drags.
 */
export class MoveNodesCommand {
  /**
   * @param {import('./Topology.js').Topology} topology
   * @param {Array<{nodeId: string, from: {x: number, y: number}, to: {x: number, y: number}}>} moves
   */
  constructor(topology, moves) {
    this.topology = topology;
    this.moves = moves;
  }

  execute() {
    for (const move of this.moves) {
      this.topology.updateNode(move.nodeId, { x: move.to.x, y: move.to.y });
    }
  }

  undo() {
    for (const move of this.moves) {
      this.topology.updateNode(move.nodeId, { x: move.from.x, y: move.from.y });
    }
  }
}

/**
 * Renames a node's hostname/label.
 */
export class RenameNodeCommand {
  /**
   * @param {import('./Topology.js').Topology} topology
   * @param {string} nodeId
   * @param {string} oldHostname
   * @param {string} newHostname
   */
  constructor(topology, nodeId, oldHostname, newHostname) {
    this.topology = topology;
    this.nodeId = nodeId;
    this.oldHostname = oldHostname;
    this.newHostname = newHostname;
  }

  execute() {
    this.topology.updateNode(this.nodeId, { hostname: this.newHostname });
  }

  undo() {
    this.topology.updateNode(this.nodeId, { hostname: this.oldHostname });
  }
}

/**
 * Adds a single cable between two existing nodes.
 */
export class AddEdgeCommand {
  /**
   * @param {import('./Topology.js').Topology} topology
   * @param {import('./Edge.js').Edge} edge
   */
  constructor(topology, edge) {
    this.topology = topology;
    this.edge = edge;
  }

  execute() {
    this.topology.addEdge(this.edge);
  }

  undo() {
    this.topology.removeEdge(this.edge.id);
  }
}

/**
 * Removes a single cable.
 */
export class RemoveEdgeCommand {
  /**
   * @param {import('./Topology.js').Topology} topology
   * @param {string} edgeId
   */
  constructor(topology, edgeId) {
    this.topology = topology;
    this.edgeId = edgeId;
    this.edge = null;
  }

  execute() {
    this.edge = this.topology.getEdge(this.edgeId);
    if (!this.edge) throw new Error(`RemoveEdgeCommand: edge not found: ${this.edgeId}`);
    this.topology.removeEdge(this.edgeId);
  }

  undo() {
    this.topology.addEdge(this.edge);
  }
}

/**
 * Groups several commands into a single undo/redo step. Executes in order;
 * undoes in reverse order, which matters when later commands in the group
 * depend on earlier ones (e.g. deleting two nodes that share a cable).
 */
export class CompositeCommand {
  /**
   * @param {Array<{execute: Function, undo: Function}>} commands
   */
  constructor(commands) {
    this.commands = commands;
  }

  execute() {
    for (const command of this.commands) {
      command.execute();
    }
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i -= 1) {
      this.commands[i].undo();
    }
  }
}
