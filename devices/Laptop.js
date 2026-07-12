/**
 * Laptop.js
 *
 * An end host, functionally identical to a `PC` for simulation purposes but
 * kept as its own type so the palette, icon, and future wireless behavior
 * (associating to an `AccessPoint`) can diverge without reworking `PC`.
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class Laptop extends Device {
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
      type: 'laptop',
      capabilities: { endpoint: true, wireless: true },
      interfaces: interfaces ?? [new NetworkInterface({ name: 'FastEthernet0', rng })],
    });
    this.defaultGateway = defaultGateway;
  }

  toJSON() {
    return { ...super.toJSON(), defaultGateway: this.defaultGateway };
  }

  /**
   * @param {object} data
   * @returns {Laptop}
   */
  static fromJSON(data) {
    return new Laptop({
      hostname: data.hostname,
      defaultGateway: data.defaultGateway ?? null,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
