/**
 * Server.js
 *
 * An end host that additionally advertises application services (DHCP, DNS,
 * HTTP, ...). For v0.2 it is an endpoint with a single NIC plus a
 * `services` list; the DHCP/DNS protocol modules in v0.4+ read that list to
 * decide what the server responds to.
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class Server extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {string|null} [params.defaultGateway]
   * @param {string[]} [params.services]
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, defaultGateway = null, services = [], rng = Math.random }) {
    super({
      hostname,
      type: 'server',
      capabilities: { endpoint: true },
      interfaces: interfaces ?? [new NetworkInterface({ name: 'GigabitEthernet0', rng })],
    });
    this.defaultGateway = defaultGateway;
    this.services = services;
  }

  toJSON() {
    return { ...super.toJSON(), defaultGateway: this.defaultGateway, services: this.services };
  }

  /**
   * @param {object} data
   * @returns {Server}
   */
  static fromJSON(data) {
    return new Server({
      hostname: data.hostname,
      defaultGateway: data.defaultGateway ?? null,
      services: data.services ?? [],
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
