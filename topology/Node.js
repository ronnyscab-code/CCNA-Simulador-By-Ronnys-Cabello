/**
 * Node.js
 *
 * A `Node` is the topology-level representation of a device placed on the
 * canvas. It owns two things:
 *   - view state: identity (`id`), position (`x`/`y`), and size, plus the
 *     `deviceType` key the renderer uses to pick an icon;
 *   - a logical `Device` (see `devices/`), which holds the hostname,
 *     interfaces, MAC/IP addressing, and — from v0.3 — CLI/config state.
 *
 * `hostname` is exposed as a getter/setter that delegates to the underlying
 * `Device`, so there is a single source of truth: renaming the node renames
 * the device and vice versa. Topologies saved by v0.1 (which had no device
 * data) still load — the device is reconstructed from `deviceType` and the
 * saved hostname.
 *
 * This is the only file in `topology/` that imports from `devices/`; the
 * dependency is one-directional (devices/ never imports topology/), so
 * there is no cycle. See `docs/ARCHITECTURE.md`.
 */

import { DeviceFactory } from '../devices/DeviceFactory.js';

const DEFAULT_SIZE = 48;

export class Node {
  /**
   * @param {object} params
   * @param {string} params.id - Unique identifier (see Topology#generateId).
   * @param {string} params.deviceType - One of the palette device-type keys
   *   (e.g. "router", "switch", "pc", "laptop", "server", "firewall",
   *   "accesspoint", "cloud", "printer").
   * @param {string} [params.hostname] - Initial hostname; defaults to a
   *   generated label. Ignored if an explicit `device` is provided.
   * @param {number} [params.x] - World-space X coordinate of the node center.
   * @param {number} [params.y] - World-space Y coordinate of the node center.
   * @param {number} [params.width]
   * @param {number} [params.height]
   * @param {import('../devices/Device.js').Device} [params.device] - A
   *   pre-built device (used by deserialization/cloning). If omitted, one is
   *   created from `deviceType` via `DeviceFactory`.
   * @param {object} [params.meta] - Free-form bag reserved for future layers.
   */
  constructor({
    id,
    deviceType,
    hostname = null,
    x = 0,
    y = 0,
    width = DEFAULT_SIZE,
    height = DEFAULT_SIZE,
    device = null,
    meta = {},
  }) {
    if (!id) throw new Error('Node requires an id');
    if (!deviceType) throw new Error('Node requires a deviceType');

    this.id = id;
    this.deviceType = deviceType;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.meta = meta;

    const resolvedHostname = hostname ?? Node.defaultHostname(deviceType, id);

    if (device) {
      this.device = device;
    } else if (DeviceFactory.isSupported(deviceType)) {
      this.device = DeviceFactory.create(deviceType, resolvedHostname);
    } else {
      // Unknown/legacy type: no logical device, fall back to a stored label.
      this.device = null;
      this._hostname = resolvedHostname;
    }

    if (this.device) this.device.hostname = resolvedHostname;
  }

  /**
   * The device hostname, used as the node's on-canvas label. Delegates to
   * the underlying `Device` so both stay in sync.
   * @returns {string}
   */
  get hostname() {
    return this.device ? this.device.hostname : this._hostname;
  }

  set hostname(value) {
    if (this.device) this.device.hostname = value;
    else this._hostname = value;
  }

  /**
   * Generates a short, human-friendly default hostname such as "Router-1a2b".
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
   * Returns a plain-object, JSON-serializable snapshot of this node,
   * including the full device configuration.
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
      device: this.device ? this.device.toJSON() : null,
      meta: this.meta,
    };
  }

  /**
   * Reconstructs a Node from a plain object previously produced by toJSON().
   * Accepts both v0.2 data (with a `device` payload) and v0.1 data (without).
   * @param {object} data
   * @returns {Node}
   */
  static fromJSON(data) {
    const device = data.device ? DeviceFactory.fromJSON(data.device) : null;
    return new Node({
      id: data.id,
      deviceType: data.deviceType,
      hostname: data.hostname,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      device,
      meta: data.meta ?? {},
    });
  }

  /**
   * Creates a clone suitable for duplication/paste, with a fresh device
   * (new interface MACs are NOT regenerated — the copy is a faithful
   * duplicate of the original's configuration). The caller supplies a new id.
   * @param {string} newId
   * @param {{dx?: number, dy?: number}} [offset]
   * @returns {Node}
   */
  clone(newId, { dx = 24, dy = 24 } = {}) {
    const device = this.device ? DeviceFactory.fromJSON(this.device.toJSON()) : null;
    return new Node({
      id: newId,
      deviceType: this.deviceType,
      hostname: `${this.hostname}-copy`,
      x: this.x + dx,
      y: this.y + dy,
      width: this.width,
      height: this.height,
      device,
      meta: structuredClone(this.meta),
    });
  }
}
