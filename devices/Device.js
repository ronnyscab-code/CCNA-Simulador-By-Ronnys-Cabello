/**
 * Device.js
 *
 * Base class for every logical network device. Owns the device's hostname,
 * its ordered list of `NetworkInterface`s, and its running/startup config
 * state. Subclasses (`Router`, `Switch`, ...) only differ in their default
 * interface layout and a few capability flags — the CLI and simulation
 * engine program against this base class, not the concrete types.
 *
 * A `Device` is pure data + behavior with no DOM and no knowledge of the
 * canvas. A topology `Node` owns one `Device` (see `topology/Node.js`); the
 * `Node` holds position, the `Device` holds everything network-related.
 *
 * `capabilities` expresses what the device can do (routing, switching,
 * wireless, endpoint) so higher layers can branch on behavior instead of
 * `instanceof` checks against nine subclasses.
 */

import { NetworkInterface } from './NetworkInterface.js';

export class Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {string} params.type - Palette device-type key (e.g. "router").
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {object} [params.capabilities]
   */
  constructor({ hostname, type, interfaces = [], capabilities = {} }) {
    if (!hostname) throw new Error('Device requires a hostname');
    if (!type) throw new Error('Device requires a type');

    this.hostname = hostname;
    this.type = type;
    /** @type {NetworkInterface[]} */
    this.interfaces = interfaces;
    this.capabilities = {
      routing: false,
      switching: false,
      wireless: false,
      endpoint: false,
      ...capabilities,
    };
    // Populated by the CLI in v0.3 (`copy running-config startup-config`).
    this.startupConfig = null;
  }

  /**
   * @param {string} name
   * @returns {NetworkInterface|undefined}
   */
  getInterface(name) {
    return this.interfaces.find((iface) => iface.name === name);
  }

  /**
   * Case-insensitive lookup that also accepts common IOS abbreviations
   * (e.g. "gi0/0" → "GigabitEthernet0/0", "fa0/1" → "FastEthernet0/1").
   * The CLI relies on this so users can type shorthand.
   * @param {string} name
   * @returns {NetworkInterface|undefined}
   */
  resolveInterface(name) {
    const normalized = Device.expandInterfaceName(name).toLowerCase();
    return this.interfaces.find((iface) => iface.name.toLowerCase() === normalized);
  }

  /**
   * Expands an abbreviated interface name to its canonical IOS form.
   * @param {string} name
   * @returns {string}
   */
  static expandInterfaceName(name) {
    const trimmed = String(name).trim();
    const match = trimmed.match(/^([a-z]+)\s*(\d.*)$/i);
    if (!match) return trimmed;
    const [, prefix, rest] = match;
    const table = {
      g: 'GigabitEthernet',
      gi: 'GigabitEthernet',
      gig: 'GigabitEthernet',
      f: 'FastEthernet',
      fa: 'FastEthernet',
      fast: 'FastEthernet',
      e: 'Ethernet',
      et: 'Ethernet',
      eth: 'Ethernet',
      s: 'Serial',
      se: 'Serial',
      ser: 'Serial',
      lo: 'Loopback',
      vl: 'Vlan',
      vlan: 'Vlan',
      wl: 'WLAN',
      wlan: 'WLAN',
    };
    const expanded = table[prefix.toLowerCase()];
    return expanded ? `${expanded}${rest}` : trimmed;
  }

  /**
   * Returns the first interface that has no cable assigned yet, per the
   * `usedInterfaceNames` set the topology maintains. Used when a cable is
   * drawn so each endpoint auto-consumes a free port.
   * @param {Set<string>} usedInterfaceNames
   * @returns {NetworkInterface|null}
   */
  firstFreeInterface(usedInterfaceNames) {
    return this.interfaces.find((iface) => !usedInterfaceNames.has(iface.name)) ?? null;
  }

  /**
   * @returns {object}
   */
  toJSON() {
    return {
      hostname: this.hostname,
      type: this.type,
      capabilities: this.capabilities,
      startupConfig: this.startupConfig,
      interfaces: this.interfaces.map((iface) => iface.toJSON()),
    };
  }

  /**
   * Rehydrates the interface list from serialized data. Subclasses share
   * this via `Device.hydrateInterfaces` so they don't each duplicate it.
   * @param {object[]} interfaceData
   * @returns {NetworkInterface[]}
   */
  static hydrateInterfaces(interfaceData = []) {
    return interfaceData.map((data) => NetworkInterface.fromJSON(data));
  }
}
