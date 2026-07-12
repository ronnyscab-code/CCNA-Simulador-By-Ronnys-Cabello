/**
 * Edge.js
 *
 * An `Edge` is the topology-level representation of a cable connecting two
 * nodes. Like `Node`, this is deliberately minimal for v0.1: it references
 * node ids, not interface objects, because interfaces don't exist until
 * `devices/Device.js` lands in v0.2. `sourcePort`/`targetPort` are reserved
 * fields so the v0.2 upgrade only needs to start populating them, not change
 * the persisted schema.
 */

export class Edge {
  /**
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.sourceNodeId
   * @param {string} params.targetNodeId
   * @param {string} [params.sourcePort] - Reserved for v0.2 interface binding.
   * @param {string} [params.targetPort] - Reserved for v0.2 interface binding.
   * @param {string} [params.cableType] - e.g. "copper-straight", "copper-crossover", "fiber", "serial".
   */
  constructor({
    id,
    sourceNodeId,
    targetNodeId,
    sourcePort = null,
    targetPort = null,
    cableType = 'copper-straight',
  }) {
    if (!id) throw new Error('Edge requires an id');
    if (!sourceNodeId || !targetNodeId) {
      throw new Error('Edge requires sourceNodeId and targetNodeId');
    }
    if (sourceNodeId === targetNodeId) {
      throw new Error('Edge cannot connect a node to itself');
    }

    this.id = id;
    this.sourceNodeId = sourceNodeId;
    this.targetNodeId = targetNodeId;
    this.sourcePort = sourcePort;
    this.targetPort = targetPort;
    this.cableType = cableType;
  }

  /**
   * Returns true if this edge touches the given node id.
   * @param {string} nodeId
   * @returns {boolean}
   */
  connectsTo(nodeId) {
    return this.sourceNodeId === nodeId || this.targetNodeId === nodeId;
  }

  /**
   * Returns the id of the node on the opposite end from the given node id.
   * @param {string} nodeId
   * @returns {string|null}
   */
  otherNodeId(nodeId) {
    if (this.sourceNodeId === nodeId) return this.targetNodeId;
    if (this.targetNodeId === nodeId) return this.sourceNodeId;
    return null;
  }

  /**
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      sourceNodeId: this.sourceNodeId,
      targetNodeId: this.targetNodeId,
      sourcePort: this.sourcePort,
      targetPort: this.targetPort,
      cableType: this.cableType,
    };
  }

  /**
   * @param {object} data
   * @returns {Edge}
   */
  static fromJSON(data) {
    return new Edge({ ...data });
  }
}
