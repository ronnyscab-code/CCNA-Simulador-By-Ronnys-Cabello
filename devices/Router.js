/**
 * Router.js
 *
 * A layer-3 device. Ships with routed GigabitEthernet ports plus a couple
 * of Serial WAN interfaces, all administratively shut down by default just
 * like real IOS (the learner must `no shutdown` them).
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class Router extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, rng = Math.random }) {
    super({
      hostname,
      type: 'router',
      capabilities: { routing: true },
      interfaces: interfaces ?? Router.defaultInterfaces(rng),
    });
  }

  /**
   * @param {() => number} rng
   * @returns {NetworkInterface[]}
   */
  static defaultInterfaces(rng) {
    return [
      new NetworkInterface({ name: 'GigabitEthernet0/0', enabled: false, rng }),
      new NetworkInterface({ name: 'GigabitEthernet0/1', enabled: false, rng }),
      new NetworkInterface({ name: 'Serial0/0/0', enabled: false, rng }),
      new NetworkInterface({ name: 'Serial0/0/1', enabled: false, rng }),
    ];
  }

  /**
   * @param {object} data
   * @returns {Router}
   */
  static fromJSON(data) {
    return new Router({
      hostname: data.hostname,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
