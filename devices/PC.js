/**
 * PC.js
 *
 * An end host with a single FastEthernet NIC. Endpoints carry an IP and a
 * default gateway (stored on `defaultGateway`) and are where `ping` /
 * `traceroute` originate from in the packet engine (v0.4+).
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class PC extends Device {
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
      type: 'pc',
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
   * @returns {PC}
   */
  static fromJSON(data) {
    return new PC({
      hostname: data.hostname,
      defaultGateway: data.defaultGateway ?? null,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
