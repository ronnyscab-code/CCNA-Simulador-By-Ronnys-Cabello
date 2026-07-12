/**
 * Cloud.js
 *
 * Represents an external network / WAN provider cloud — a passthrough that
 * interconnects sites. It exposes generic Ethernet/Serial ports but does no
 * routing decisions of its own in the simulator; it simply bridges whatever
 * connects to it, standing in for "the rest of the internet".
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class Cloud extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, rng = Math.random }) {
    super({
      hostname,
      type: 'cloud',
      capabilities: { passthrough: true },
      interfaces: interfaces ?? [
        new NetworkInterface({ name: 'Ethernet0', rng }),
        new NetworkInterface({ name: 'Ethernet1', rng }),
        new NetworkInterface({ name: 'Serial0', rng }),
      ],
    });
  }

  /**
   * @param {object} data
   * @returns {Cloud}
   */
  static fromJSON(data) {
    return new Cloud({
      hostname: data.hostname,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
