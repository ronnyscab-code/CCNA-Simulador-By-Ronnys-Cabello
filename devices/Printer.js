/**
 * Printer.js
 *
 * A networked end host with a single NIC — behaves like a `PC` on the wire
 * (gets an IP and a gateway, answers ARP/ping) but is modeled separately so
 * it reads clearly in labs ("the printer on VLAN 20").
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class Printer extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {string|null} [params.defaultGateway]
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, defaultGateway = null, rng = Math.random }) {
    super({
      hostname,
      type: 'printer',
      capabilities: { endpoint: true },
      interfaces: interfaces ?? [new NetworkInterface({ name: 'FastEthernet0', rng })],
    });
    this.defaultGateway = defaultGateway;
  }

  toJSON() {
    return { ...super.toJSON(), defaultGateway: this.defaultGateway };
  }

  /**
   * @param {object} data
   * @returns {Printer}
   */
  static fromJSON(data) {
    return new Printer({
      hostname: data.hostname,
      defaultGateway: data.defaultGateway ?? null,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
