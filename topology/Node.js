/**
 * Node.js
 *
 * A `Node` is the topology-level representation of a device placed on the
 * canvas: its identity, position, and label. It intentionally knows nothing
 * about interfaces, MAC/IP addresses, or CLI state — that richer model is
 * introduced in v0.2 (`devices/Device.js` and subclasses) and will attach
 * to a `Node` via `Node#deviceType`/`Node#meta` rather than replacing it.
 *
 * Keeping this class minimal lets the v0.1 editor (placement, selection,
 * dragging, cabling, persistence) be built and fully tested before any
 * simulation behavior exists.
 */

const DEFAULT_SIZE = 48;

export class Node {
  /**
   * @param {object} params
   * @param {string} params.id - Unique identifier (see Topology#generateId).
   * @param {string} params.deviceType - One of the palette device type keys
   *   (e.g. "router", "switch", "pc", "laptop", "server", "firewall",
   *   "accesspoint", "cloud", "printer").
   * @param {string} [params.hostname] - Display label / future CLI hostname.
   * @param {number} [params.x] - World-space X coordinate of the node center.
   * @param {number} [params.y] - World-space Y coordinate of the node center.
   * @param {number} [params.width]
   * @param {number} [params.height]
   * @param {object} [params.meta] - Free-form bag reserved for future layers
   *   (devices/, protocols/, cli/) to attach state without modifying this class.
   */
  constructor({
    id,
    deviceType,
    hostname = null,
    x = 0,
    y = 0,
    width = DEFAULT_SIZE,
    height = DEFAULT_SIZE,
    meta = {},
  }) {
    if (!id) throw new Error('Node requires an id');
    if (!deviceType) throw new Error('Node requires a deviceType');

    this.id = id;
    this.deviceType = deviceType;
    this.hostname = hostname ?? Node.defaultHostname(deviceType, id);
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.meta = meta;
  }

  /**
   * Generates a short, human-friendly default hostname such as "Router1".
   * @param {string} deviceType
   * @param {string} id
   * @returns {string}
   */
  static defaultHostname(deviceType, id) {
    const label = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
    const shortSuffix = id.replace(/-/g, '').slice(-4);
    return `${label}-${shortSuffix}`;
  }

  /**
   * Returns a plain-object, JSON-serializable snapshot of this node.
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      deviceType: this.deviceType,
      hostname: this.hostname,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      meta: this.meta,
    };
  }

  /**
   * Reconstructs a Node from a plain object previously produced by toJSON().
   * @param {object} data
   * @returns {Node}
   */
  static fromJSON(data) {
    return new Node({ ...data });
  }

  /**
   * Creates a deep-enough clone suitable for duplication/paste. A fresh id
   * must be supplied by the caller (Topology owns id generation).
   * @param {string} newId
   * @param {{dx?: number, dy?: number}} [offset]
   * @returns {Node}
   */
  clone(newId, { dx = 24, dy = 24 } = {}) {
    return new Node({
      ...this.toJSON(),
      id: newId,
      hostname: `${this.hostname}-copy`,
      x: this.x + dx,
      y: this.y + dy,
      meta: structuredClone(this.meta),
    });
  }
}
