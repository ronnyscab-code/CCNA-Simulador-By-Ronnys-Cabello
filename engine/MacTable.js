/**
 * MacTable.js
 *
 * A switch's MAC address table (a.k.a. CAM table): which port a given MAC
 * address was last seen on, per VLAN. Switches build this by learning the
 * source MAC of every frame they receive, and consult it to forward known
 * unicast traffic out a single port instead of flooding.
 *
 * This lives in the engine's runtime (one per switch node), not on the
 * device model, because it is dynamic state that `reload` clears — the same
 * reason ARP caches live there.
 */

export class MacTable {
  constructor() {
    /** @type {Map<string, {port: string, type: string}>} key `vlan|mac` */
    this.entries = new Map();
  }

  /**
   * @param {number} vlan
   * @param {string} mac
   * @returns {string}
   */
  static _key(vlan, mac) {
    return `${vlan}|${mac.toLowerCase()}`;
  }

  /**
   * Learns (or refreshes) a MAC on a port for a VLAN.
   * @param {number} vlan
   * @param {string} mac
   * @param {string} port
   * @param {string} [type] - "DYNAMIC" (learned) or "STATIC".
   */
  learn(vlan, mac, port, type = 'DYNAMIC') {
    this.entries.set(MacTable._key(vlan, mac), { port, type, vlan, mac: mac.toLowerCase() });
  }

  /**
   * @param {number} vlan
   * @param {string} mac
   * @returns {string|null} the port the MAC is known on, or null if unknown.
   */
  lookup(vlan, mac) {
    const entry = this.entries.get(MacTable._key(vlan, mac));
    return entry ? entry.port : null;
  }

  /**
   * @returns {Array<{vlan: number, mac: string, port: string, type: string}>}
   *   entries sorted by VLAN then MAC, for `show mac address-table`.
   */
  toArray() {
    return [...this.entries.values()].sort((a, b) => a.vlan - b.vlan || a.mac.localeCompare(b.mac));
  }

  /**
   * @returns {number}
   */
  size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }
}
