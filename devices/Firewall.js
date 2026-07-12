/**
 * Firewall.js
 *
 * A layer-3 security device. For topology/addressing purposes it behaves
 * like a router (routed interfaces, IP addressing); its named security
 * zones and rule set are stored here so the ACL/inspection logic in later
 * versions has somewhere to hang off. Conventionally three legs:
 * outside, inside, and DMZ.
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class Firewall extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, rng = Math.random }) {
    super({
      hostname,
      type: 'firewall',
      capabilities: { routing: true, firewall: true },
      interfaces: interfaces ?? Firewall.defaultInterfaces(rng),
    });
  }

  /**
   * @param {() => number} rng
   * @returns {NetworkInterface[]}
   */
  static defaultInterfaces(rng) {
    return [
      new NetworkInterface({
        name: 'GigabitEthernet0/0',
        description: 'outside',
        enabled: false,
        rng,
      }),
      new NetworkInterface({
        name: 'GigabitEthernet0/1',
        description: 'inside',
        enabled: false,
        rng,
      }),
      new NetworkInterface({ name: 'GigabitEthernet0/2', description: 'dmz', enabled: false, rng }),
    ];
  }

  /**
   * @param {object} data
   * @returns {Firewall}
   */
  static fromJSON(data) {
    return new Firewall({
      hostname: data.hostname,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
