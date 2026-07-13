/**
 * arp.js
 *
 * The Address Resolution Protocol: how a device maps a next-hop IPv4 address
 * to the MAC address it must put in the Ethernet destination field. This
 * module holds the ARP message model and a small per-device ARP cache; the
 * request/reply exchange itself is driven by the packet engine.
 */

export const ArpOp = Object.freeze({
  REQUEST: 'request',
  REPLY: 'reply',
});

export class ArpMessage {
  /**
   * @param {object} params
   * @param {string} params.op - one of `ArpOp`.
   * @param {string} params.senderMac
   * @param {string} params.senderIp
   * @param {string|null} params.targetMac - null/unknown in a request.
   * @param {string} params.targetIp
   */
  constructor({ op, senderMac, senderIp, targetMac = null, targetIp }) {
    this.op = op;
    this.senderMac = senderMac;
    this.senderIp = senderIp;
    this.targetMac = targetMac;
    this.targetIp = targetIp;
  }
}

/**
 * A per-device ARP cache (IP → MAC). Entries here are what `show arp` renders
 * once the engine populates them.
 */
export class ArpCache {
  constructor() {
    /** @type {Map<string, string>} ip → mac */
    this.entries = new Map();
  }

  /**
   * @param {string} ip
   * @param {string} mac
   */
  set(ip, mac) {
    this.entries.set(ip, mac);
  }

  /**
   * @param {string} ip
   * @returns {string|undefined}
   */
  get(ip) {
    return this.entries.get(ip);
  }

  /**
   * @param {string} ip
   * @returns {boolean}
   */
  has(ip) {
    return this.entries.has(ip);
  }

  clear() {
    this.entries.clear();
  }

  /**
   * @returns {Array<{ip: string, mac: string}>}
   */
  toArray() {
    return [...this.entries.entries()].map(([ip, mac]) => ({ ip, mac }));
  }
}
